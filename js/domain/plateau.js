// Plateau Detector. Decides, from logged data only, whether the plan should be
// kept, watched or adjusted. It never changes a goal itself: it returns
// optional `actions` the UI may offer for the user to confirm.
import { addDays, diffDays } from './dates.js';
import { averageIntake } from './nutrition.js';
import { averageBetween, dailyWeights, weeklyRate } from './weight.js';
import { strengthChange, workoutDays } from './workout.js';

export const RULES = {
  windowDays: 21, // trend window (3 weeks)
  minWeighInsPerWeek: 4, // in each of the two most recent weeks
  minWeighIns: 10, // in the whole window
  minSpanDays: 14, // first to last weigh-in in the window
  flatKgPerWeek: 0.15, // |trend| below this counts as "not moving"
  minLossPct: 0.0025, // 0.25% of body weight per week
  maxLossPct: 0.0075, // 0.75% of body weight per week
  waistWindowDays: 35,
  waistMinGapDays: 10,
  waistFlatCm: 0.5,
  foodWindowDays: 14,
  minCompleteFoodDays: 10,
  minStepDays: 7,
  settleDays: 14, // after a goal change, wait this long before suggesting another
  kcalStep: 100,
  kcalFloorOverBmr: 1.05, // a cut is only offered while the new goal stays 5% above BMR
  stepsStep: 1000,
};

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${f1(Math.abs(n))}`;
const int = (n) => Math.round(n).toLocaleString('en-US');

function waistTrend(waistLogs, today) {
  const from = addDays(today, -(RULES.waistWindowDays - 1));
  const pts = waistLogs.filter((w) => w.date >= from && w.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (pts.length < 2) return { known: false, count: pts.length };
  const first = pts[0];
  const last = pts[pts.length - 1];
  const gap = diffDays(first.date, last.date);
  if (gap < RULES.waistMinGapDays) return { known: false, count: pts.length, gap };
  const delta = last.cm - first.cm;
  const dir = delta <= -RULES.waistFlatCm ? 'down' : delta >= RULES.waistFlatCm ? 'up' : 'flat';
  return { known: true, delta, dir, gap, first, last };
}

function stepsAverage(activityLogs, from, to) {
  const days = activityLogs.filter((a) => a.type === 'steps' && a.date >= from && a.date <= to && a.steps > 0);
  if (!days.length) return { days: 0, avg: null };
  return { days: days.length, avg: days.reduce((a, d) => a + d.steps, 0) / days.length };
}

export function analyzePlateau({ weightLogs, waistLogs, foodLogs, activityLogs, sessions, goals, goalHistory, bmr, today }) {
  const daily = dailyWeights(weightLogs);
  const w0 = averageBetween(daily, addDays(today, -6), today);
  const w1 = averageBetween(daily, addDays(today, -13), addDays(today, -7));
  const w2 = averageBetween(daily, addDays(today, -20), addDays(today, -14));
  const windowFrom = addDays(today, -(RULES.windowDays - 1));
  const inWindow = [...daily.keys()].filter((d) => d >= windowFrom && d <= today).sort();
  const span = inWindow.length ? diffDays(inWindow[0], inWindow[inWindow.length - 1]) : 0;

  const foodFrom = addDays(today, -(RULES.foodWindowDays - 1));
  const intake = averageIntake(foodLogs, foodFrom, today);
  const steps = stepsAverage(activityLogs, foodFrom, today);
  const lifted = workoutDays(sessions, foodFrom, today);
  const waist = waistTrend(waistLogs, today);
  const metrics = { w0, w1, w2, weighIns: inWindow.length, span, intake, steps, lifted, waist, rate: null };

  // 1) Enough weigh-ins? Without them nothing may be concluded.
  const missing = [];
  if (w0.n < RULES.minWeighInsPerWeek) missing.push(`7 วันล่าสุดชั่งน้ำหนัก ${w0.n} วัน (ต้องการอย่างน้อย ${RULES.minWeighInsPerWeek})`);
  if (w1.n < RULES.minWeighInsPerWeek) missing.push(`สัปดาห์ก่อนหน้าชั่งน้ำหนัก ${w1.n} วัน (ต้องการอย่างน้อย ${RULES.minWeighInsPerWeek})`);
  if (inWindow.length < RULES.minWeighIns) missing.push(`21 วันล่าสุดชั่งน้ำหนักรวม ${inWindow.length} วัน (ต้องการอย่างน้อย ${RULES.minWeighIns})`);
  if (span < RULES.minSpanDays) missing.push(`ข้อมูลครอบคลุม ${span} วัน (ต้องการอย่างน้อย ${RULES.minSpanDays} วัน)`);
  if (missing.length) {
    return {
      status: 'insufficient',
      tone: 'info',
      title: 'ข้อมูลยังไม่พอสำหรับสรุปผล',
      summary: 'ยังบอกไม่ได้ว่าน้ำหนักนิ่งหรือไม่ น้ำหนักรายวันแกว่งตามน้ำและไกลโคเจน จึงต้องดูค่าเฉลี่ยอย่างน้อย 2–3 สัปดาห์',
      evidence: [],
      suggestions: ['ชั่งน้ำหนักตอนเช้าหลังเข้าห้องน้ำ อย่างน้อย 4 วัน/สัปดาห์', 'วัดรอบเอวสัปดาห์ละครั้ง ที่ระดับสะดือ เวลาเดิม'],
      actions: [],
      missing,
      metrics,
    };
  }

  const rate = weeklyRate(daily, today, RULES.windowDays);
  metrics.rate = rate;
  const current = w0.avg;
  const evidence = [
    `ค่าเฉลี่ย 7 วัน: ${f1(w0.avg)} กก. (สัปดาห์ก่อน ${f1(w1.avg)}${w2.n >= 3 ? `, 2 สัปดาห์ก่อน ${f1(w2.avg)}` : ''})`,
    `แนวโน้ม 3 สัปดาห์: ${signed(rate)} กก./สัปดาห์ จากการชั่ง ${inWindow.length} วัน`,
  ];
  if (waist.known) evidence.push(`รอบเอว: ${signed(waist.delta)} ซม. ใน ${waist.gap} วัน`);
  else evidence.push('รอบเอว: ยังไม่มีการวัด 2 ครั้งที่ห่างกันอย่างน้อย 10 วัน');
  if (intake.completeDays) evidence.push(`อาหาร 14 วัน: บันทึกครบ ${intake.completeDays} วัน เฉลี่ย ${int(intake.kcal)} kcal, โปรตีน ${int(intake.p)} ก.`);
  else evidence.push('อาหาร 14 วัน: ยังไม่มีวันที่บันทึกครบ');
  if (steps.days) evidence.push(`ก้าวเดิน 14 วัน: บันทึก ${steps.days} วัน เฉลี่ย ${int(steps.avg)} ก้าว`);
  evidence.push(`เวท 14 วัน: ${lifted} ครั้ง (เป้าหมาย ${goals.workoutsPerWeek * 2})`);

  const strength = strengthChange(sessions, today);
  const weaker = strength.declined.length >= 2;
  if (weaker) evidence.push(`แรงลดลง ≥5% ใน ${strength.declined.length} ท่า: ${strength.declined.map((d) => d.name).join(', ')}`);

  const base = { evidence, actions: [], missing: [], metrics };
  const lossPct = -rate / current;

  // 2) Losing too fast, or strength falling while losing.
  if (lossPct > RULES.maxLossPct) {
    return {
      ...base,
      status: 'too_fast',
      tone: 'warn',
      title: 'น้ำหนักลดเร็วเกินไป',
      summary: `ลดประมาณ ${f1(-rate)} กก./สัปดาห์ (มากกว่า 0.75% ของน้ำหนักตัว) เสี่ยงเสียกล้ามเนื้อและแรงตก`,
      suggestions: [
        'เพิ่มพลังงานประมาณ 100–150 kcal/วัน โดยเน้นคาร์โบไฮเดรตรอบเวลาฝึก',
        'ตรวจว่าโปรตีนถึงเป้าหมายทุกวัน และนอนให้พอ',
        weaker ? 'แรงในการฝึกลดลงหลายท่า — ลดปริมาณฝึกชั่วคราว 1 สัปดาห์ แล้วประเมินใหม่' : 'ติดตามแรงในการฝึก หากเริ่มตกให้ประเมินการฟื้นตัวใหม่',
      ],
      actions: [{ id: 'kcal', delta: RULES.kcalStep, label: `เพิ่มเป้าหมายแคลอรี +${RULES.kcalStep} kcal` }],
    };
  }

  // 3) Losing at a sensible pace.
  if (rate <= -RULES.flatKgPerWeek) {
    const slow = lossPct < RULES.minLossPct;
    return {
      ...base,
      status: weaker ? 'recovery' : 'on_track',
      tone: weaker ? 'warn' : 'ok',
      title: weaker ? 'น้ำหนักลด แต่แรงในการฝึกลดลง' : slow ? 'น้ำหนักลดช้าแต่ยังลดอยู่' : 'น้ำหนักลดตามเป้าหมาย',
      summary: weaker
        ? 'น้ำหนักลงตามแผน แต่แรงตกในหลายท่า ควรประเมินพลังงานและการฟื้นตัวใหม่ก่อนลดแคลอรีเพิ่ม'
        : `ลดประมาณ ${f1(-rate)} กก./สัปดาห์ — รักษาแผนเดิม ไม่ต้องลดแคลอรี`,
      suggestions: weaker
        ? ['นอน 7–9 ชั่วโมง และเว้นวันพักระหว่างวันเวท', 'ย้ายคาร์โบไฮเดรตไปไว้ก่อน/หลังฝึก', 'หากแรงยังตกอีก 1–2 สัปดาห์ ให้เพิ่ม 100–150 kcal/วัน']
        : ['รักษาแคลอรี โปรตีน และจำนวนก้าวตามเดิม', 'พยายามเพิ่มจำนวนครั้งหรือน้ำหนักดัมเบลทีละน้อย'],
    };
  }

  // 4) Gaining.
  if (rate >= RULES.flatKgPerWeek) {
    const over = intake.completeDays >= RULES.minCompleteFoodDays && intake.kcal > goals.kcal + 100;
    return {
      ...base,
      status: 'gaining',
      tone: 'warn',
      title: 'แนวโน้มน้ำหนักเพิ่มขึ้น',
      summary: `ค่าเฉลี่ยเพิ่มประมาณ ${f1(rate)} กก./สัปดาห์ ตลอด 3 สัปดาห์`,
      suggestions: [
        over
          ? `พลังงานเฉลี่ย ${int(intake.kcal)} kcal สูงกว่าเป้าหมาย ${int(goals.kcal)} — กลับมาที่เป้าหมายเดิมก่อน ยังไม่ต้องลดเป้า`
          : 'ตรวจความครบถ้วนของการบันทึก: น้ำมัน ซอส เครื่องดื่ม ของกินเล่น และมื้อวันหยุด',
        waist.known && waist.dir !== 'up' ? 'รอบเอวไม่เพิ่ม อาจเป็นน้ำ/ไกลโคเจนหรือกล้ามเนื้อ — ติดตามต่ออีก 1–2 สัปดาห์' : 'วัดรอบเอวทุกสัปดาห์เพื่อแยกไขมันออกจากน้ำ',
      ],
    };
  }

  // 5) Weight is flat. Waist decides what it means.
  if (waist.known && waist.dir === 'down') {
    return {
      ...base,
      status: 'recomp',
      tone: 'ok',
      title: 'น้ำหนักนิ่ง แต่รอบเอวลดลง',
      summary: `รอบเอวลด ${f1(-waist.delta)} ซม. แม้น้ำหนักไม่เปลี่ยน มักหมายถึงไขมันลดพร้อมกล้ามเนื้อคงที่หรือเพิ่ม — ติดตามต่อ ยังไม่ต้องปรับแผน`,
      suggestions: ['คงแคลอรีและโปรตีนตามเดิม', 'วัดรอบเอวและถ่ายภาพเปรียบเทียบทุก 2 สัปดาห์'],
    };
  }

  const waistText = waist.known ? 'น้ำหนักและรอบเอวไม่เปลี่ยน' : 'น้ำหนักไม่เปลี่ยน (ยังไม่มีข้อมูลรอบเอวเพียงพอ)';

  // 5a) Cannot judge intake: fix logging first, never cut calories blind.
  if (intake.completeDays < RULES.minCompleteFoodDays) {
    return {
      ...base,
      status: 'check_logging',
      tone: 'warn',
      title: 'น้ำหนักนิ่ง — ตรวจการบันทึกอาหารก่อน',
      summary: `${waistText} แต่ 14 วันล่าสุดบันทึกอาหารครบเพียง ${intake.completeDays} วัน จึงยังบอกไม่ได้ว่ากินตามเป้าหมายจริงหรือไม่`,
      suggestions: [
        `บันทึกอาหารให้ครบอย่างน้อย ${RULES.minCompleteFoodDays} ใน 14 วัน รวมน้ำมัน ซอส น้ำตาล เครื่องดื่ม และมื้อวันหยุด`,
        'ชั่งอาหารหลักด้วยตาชั่ง และเลือกรายการดิบ/สุกให้ตรงกับตอนชั่ง',
        waist.known ? 'ยังไม่ควรลดเป้าหมายแคลอรีจนกว่าข้อมูลจะครบ' : 'เริ่มวัดรอบเอวสัปดาห์ละครั้ง',
      ],
    };
  }

  // 5b) Eating above the target: return to target, do not lower it.
  if (intake.kcal > goals.kcal + 100) {
    return {
      ...base,
      status: 'over_target',
      tone: 'warn',
      title: 'น้ำหนักนิ่ง — พลังงานจริงสูงกว่าเป้าหมาย',
      summary: `${waistText} และกินเฉลี่ย ${int(intake.kcal)} kcal สูงกว่าเป้าหมาย ${int(goals.kcal)} kcal`,
      suggestions: ['กลับมากินตามเป้าหมายเดิมให้ได้ 2 สัปดาห์ก่อน ยังไม่ต้องลดเป้าหมาย', 'ดูมื้อหรือวันที่เกินบ่อย แล้ววางแผนล่วงหน้า'],
    };
  }

  // 5c) A goal was changed recently: give it time before judging or changing again.
  const lastChange = [...(goalHistory || [])].reverse().find((h) => h.changes && (h.changes.kcal || h.changes.steps));
  const sinceChange = lastChange ? diffDays(lastChange.date, today) : null;
  if (sinceChange != null && sinceChange >= 0 && sinceChange < RULES.settleDays) {
    return {
      ...base,
      status: 'adjusting',
      tone: 'info',
      title: 'เพิ่งปรับเป้าหมาย — รอดูผล',
      summary: `${waistText} แต่เพิ่งปรับเป้าหมาย${sinceChange === 0 ? 'วันนี้' : `เมื่อ ${sinceChange} วันก่อน`} ต้องใช้เป้าหมายใหม่ให้ครบ ${RULES.settleDays} วันก่อนจึงจะประเมินได้ (เหลืออีก ${RULES.settleDays - sinceChange} วัน)`,
      suggestions: ['ทำตามเป้าหมายใหม่ให้สม่ำเสมอ และบันทึกต่อเนื่อง', 'ยังไม่ปรับอะไรเพิ่มในช่วงนี้'],
    };
  }

  // 5d) Real plateau: offer one small change, activity first when steps are low.
  const lowSteps = steps.days >= RULES.minStepDays && steps.avg < goals.steps;
  const noStepData = steps.days < RULES.minStepDays;
  const canCut = !bmr || goals.kcal - RULES.kcalStep >= bmr * RULES.kcalFloorOverBmr;
  const suggestions = [];
  const actions = [];
  if (lowSteps) {
    suggestions.push(`ก้าวเฉลี่ย ${int(steps.avg)} ต่ำกว่าเป้าหมาย ${int(goals.steps)} — เพิ่มการเดินให้ถึงเป้าหมายก่อนลดอาหาร`);
  } else {
    if (noStepData) suggestions.push('ยังไม่มีข้อมูลก้าวเดินเพียงพอ — เริ่มบันทึกทุกวัน');
    const walk = `เพิ่มการเดิน ~${int(RULES.stepsStep)}–2,000 ก้าว/วัน`;
    actions.push({ id: 'steps', delta: RULES.stepsStep, label: `เพิ่มเป้าหมายก้าว +${int(RULES.stepsStep)}/วัน` });
    if (canCut) {
      suggestions.push(`เลือกอย่างใดอย่างหนึ่ง: ${walk} หรือ ลดพลังงาน 100–150 kcal/วัน`);
      actions.push({ id: 'kcal', delta: -RULES.kcalStep, label: `ลดเป้าหมายแคลอรี −${RULES.kcalStep} kcal` });
    } else {
      suggestions.push(walk);
      suggestions.push('เป้าหมายแคลอรีใกล้ BMR แล้ว ไม่ควรลดอีก — เพิ่มกิจกรรมแทน หรือพักกินระดับคงน้ำหนัก 1–2 สัปดาห์');
    }
  }
  if (lifted < goals.workoutsPerWeek * 2) suggestions.push(`เวท 14 วันทำได้ ${lifted}/${goals.workoutsPerWeek * 2} ครั้ง — ฝึกให้ครบเพื่อรักษากล้ามเนื้อ`);
  suggestions.push('ปรับทีละอย่าง แล้วประเมินใหม่หลัง 2 สัปดาห์ ไม่ลดแคลอรีซ้ำทุกสัปดาห์');
  return {
    ...base,
    status: 'plateau',
    tone: 'warn',
    title: waist.known ? 'น้ำหนักและรอบเอวนิ่งต่อเนื่อง' : 'น้ำหนักนิ่งต่อเนื่อง',
    summary: `${waistText}ตลอด 3 สัปดาห์ ทั้งที่กินใกล้เป้าหมาย (เฉลี่ย ${int(intake.kcal)} kcal) — ถึงเวลาปรับแผนเล็กน้อย`,
    suggestions,
    actions,
  };
}

/**
 * TDEE implied by logged intake and the weight trend (7,700 kcal per kg).
 * Only returned when both food and weight logging are dense enough.
 */
export function empiricalTdee({ weightLogs, foodLogs, today }) {
  const from = addDays(today, -(RULES.windowDays - 1));
  const intake = averageIntake(foodLogs, from, today);
  const rate = weeklyRate(dailyWeights(weightLogs), today, RULES.windowDays, { minPoints: RULES.minWeighIns, minSpan: RULES.minSpanDays });
  if (rate == null || intake.completeDays < 14) return null;
  return { kcal: intake.kcal - (rate * 7700) / 7, completeDays: intake.completeDays, rate };
}
