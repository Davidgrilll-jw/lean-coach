// Weekly Coach report and the daily advice shown on the dashboard.
// Rule-based: every sentence is derived from logged data.
import { addDays, diffDays } from './dates.js';
import { averageIntake, totalsByDate } from './nutrition.js';
import { dailyWeights, weekAverage } from './weight.js';
import { workoutDays } from './workout.js';

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const int = (n) => Math.round(n).toLocaleString('en-US');

export function weeklyReport({ monday, today, weightLogs, waistLogs, foodLogs, sessions, activityLogs, goals }) {
  const sunday = addDays(monday, 6);
  const complete = sunday < today;
  const daysElapsed = Math.max(0, Math.min(7, diffDays(monday, today) + 1));
  const inWeek = (x) => x.date >= monday && x.date <= sunday;

  const daily = dailyWeights(weightLogs);
  const cur = weekAverage(daily, monday);
  const prev = weekAverage(daily, addDays(monday, -7));
  const weight = { avg: cur.avg, n: cur.n, prevAvg: prev.avg, prevN: prev.n, delta: cur.n >= 3 && prev.n >= 3 ? cur.avg - prev.avg : null };

  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const waistIn = waistLogs.filter(inWeek).sort(byDate);
  const waistBefore = waistLogs.filter((w) => w.date < monday && w.date >= addDays(monday, -21)).sort(byDate);
  const wl = waistIn[waistIn.length - 1] || null;
  const wp = waistBefore[waistBefore.length - 1] || null;
  const waist = { latest: wl ? wl.cm : null, prev: wp ? wp.cm : null, delta: wl && wp ? wl.cm - wp.cm : null };

  const intake = averageIntake(foodLogs, monday, sunday);
  const nutrition = { ...intake, kcalGoal: goals.kcal, proteinGoal: goals.proteinG };

  const stepLogs = activityLogs.filter((a) => a.type === 'steps' && inWeek(a) && a.steps > 0);
  const steps = { days: stepLogs.length, avg: stepLogs.length ? stepLogs.reduce((a, s) => a + s.steps, 0) / stepLogs.length : null, goal: goals.steps };
  const minutesOf = (type) => activityLogs.filter((a) => a.type === type && inWeek(a)).reduce((a, x) => a + (x.minutes || 0), 0);
  const football = { minutes: minutesOf('football'), goalMin: goals.footballMin, goalMax: goals.footballMax };
  const cardioMinutes = minutesOf('cardio');
  const workouts = { done: workoutDays(sessions, monday, sunday), goal: goals.workoutsPerWeek };

  const foodDays = totalsByDate(foodLogs.filter(inWeek)).size;
  const denom = daysElapsed * 3;
  const consistency = {
    weightDays: cur.n,
    foodDays,
    stepDays: steps.days,
    days: daysElapsed,
    pct: denom ? (cur.n + foodDays + steps.days) / denom : 0,
  };

  const wins = [];
  const improvements = [];
  const notes = [];
  const refKg = cur.avg || prev.avg || 0;

  if (weight.delta != null) {
    const d = weight.delta;
    if (d <= -0.0075 * refKg) improvements.push(`น้ำหนักเฉลี่ยลด ${f1(-d)} กก. ในสัปดาห์เดียว เร็วเกินช่วงที่เหมาะสม — ตรวจว่ากินถึงเป้าหมาย`);
    else if (d <= -0.15) wins.push(`น้ำหนักเฉลี่ยลด ${f1(-d)} กก. จากสัปดาห์ก่อน`);
    else if (d < 0.15) notes.push('น้ำหนักเฉลี่ยแทบไม่เปลี่ยนจากสัปดาห์ก่อน — สัปดาห์เดียวยังสรุปไม่ได้ ดูผล Plateau Detector ที่ใช้ข้อมูล 3 สัปดาห์');
    else notes.push(`น้ำหนักเฉลี่ยเพิ่ม ${f1(d)} กก. — อาจเป็นน้ำ/ไกลโคเจน ดูแนวโน้มหลายสัปดาห์ประกอบ`);
  } else {
    improvements.push(`ชั่งน้ำหนักอย่างน้อย 3 วัน/สัปดาห์ติดกัน 2 สัปดาห์ เพื่อเทียบค่าเฉลี่ยได้ (สัปดาห์นี้ ${cur.n} วัน, สัปดาห์ก่อน ${prev.n} วัน)`);
  }

  if (waist.delta != null) {
    if (waist.delta <= -0.5) wins.push(`รอบเอวลด ${f1(-waist.delta)} ซม.`);
    else if (waist.delta >= 0.5) notes.push(`รอบเอวเพิ่ม ${f1(waist.delta)} ซม. — วัดซ้ำเวลาเดิมตำแหน่งเดิมเพื่อยืนยัน`);
  } else if (!wl) {
    improvements.push('วัดรอบเอวสัปดาห์ละครั้ง (ระดับสะดือ ตอนเช้า)');
  }

  if (intake.completeDays >= 3) {
    const dk = intake.kcal - goals.kcal;
    if (Math.abs(dk) <= 100) wins.push(`พลังงานเฉลี่ย ${int(intake.kcal)} kcal ใกล้เป้าหมาย ${int(goals.kcal)}`);
    else if (dk > 100) improvements.push(`พลังงานเฉลี่ย ${int(intake.kcal)} kcal เกินเป้าหมาย ${int(dk)} kcal/วัน`);
    else if (dk < -250) improvements.push(`พลังงานเฉลี่ย ${int(intake.kcal)} kcal ต่ำกว่าเป้าหมายมาก (${int(-dk)} kcal) — กินน้อยเกินไปเสี่ยงเสียกล้ามเนื้อ หรือบันทึกไม่ครบ`);
    else notes.push(`พลังงานเฉลี่ย ${int(intake.kcal)} kcal ต่ำกว่าเป้าหมายเล็กน้อย`);
    if (intake.p >= goals.proteinG * 0.9) wins.push(`โปรตีนเฉลี่ย ${int(intake.p)} ก. ถึงเป้าหมาย`);
    else improvements.push(`โปรตีนเฉลี่ย ${int(intake.p)} ก. ยังขาดอีก ~${int(goals.proteinG - intake.p)} ก./วัน`);
  } else {
    improvements.push(`บันทึกอาหารให้ครบอย่างน้อย 3 วัน เพื่อคำนวณค่าเฉลี่ยได้ (สัปดาห์นี้ครบ ${intake.completeDays} วัน)`);
  }

  if (workouts.done >= workouts.goal) wins.push(`เวทครบ ${workouts.done}/${workouts.goal} ครั้ง`);
  else if (complete) improvements.push(`เวท ${workouts.done}/${workouts.goal} ครั้ง — จัดวันฝึกล่วงหน้าในสัปดาห์ถัดไป`);
  else notes.push(`เวท ${workouts.done}/${workouts.goal} ครั้ง (สัปดาห์ยังไม่จบ)`);

  if (steps.avg != null) {
    if (steps.avg >= goals.steps) wins.push(`ก้าวเฉลี่ย ${int(steps.avg)} ถึงเป้าหมาย`);
    else improvements.push(`ก้าวเฉลี่ย ${int(steps.avg)} ต่ำกว่าเป้าหมาย ${int(goals.steps)} — เพิ่มการเดินหลังมื้ออาหาร 10 นาที`);
  } else {
    improvements.push('บันทึกจำนวนก้าวทุกวัน');
  }

  if (football.minutes >= football.goalMin) wins.push(`เตะฟุตบอล ${int(football.minutes)} นาที`);

  if (daysElapsed >= 3) {
    if (consistency.pct >= 0.8) wins.push(`บันทึกข้อมูลสม่ำเสมอ ${Math.round(consistency.pct * 100)}%`);
    else if (consistency.pct < 0.6) improvements.push(`ความสม่ำเสมอในการบันทึก ${Math.round(consistency.pct * 100)}% — ยิ่งบันทึกครบ คำแนะนำยิ่งแม่น`);
  }

  return {
    monday,
    sunday,
    complete,
    daysElapsed,
    weight,
    waist,
    nutrition,
    workouts,
    steps,
    football,
    cardioMinutes,
    consistency,
    wins,
    improvements,
    notes,
    enough: cur.n >= 3 && intake.completeDays >= 3,
  };
}

/** Short, prioritised advice for today. */
export function dailyAdvice({ today, hasWeightToday, totals, goals, stepsToday, workedOutToday, weekWorkouts, plateau, weighIns7 }) {
  const out = [];
  if (!hasWeightToday) out.push({ tone: 'info', text: 'ยังไม่ได้ชั่งน้ำหนักวันนี้ — ชั่งตอนเช้าหลังเข้าห้องน้ำจะเทียบกันได้ดีที่สุด' });
  if (plateau.status === 'insufficient') {
    out.push({ tone: 'info', text: `Plateau Detector ยังสรุปไม่ได้ (7 วันล่าสุดชั่ง ${weighIns7} วัน) — บันทึกต่อเนื่อง 2–3 สัปดาห์` });
  } else {
    out.push({ tone: plateau.tone, text: `${plateau.title}: ${plateau.suggestions[0] || plateau.summary}` });
  }
  if (totals.items > 0) {
    const pLeft = goals.proteinG - totals.p;
    const kLeft = goals.kcal - totals.kcal;
    if (kLeft < -100) out.push({ tone: 'warn', text: `วันนี้เกินเป้าหมายแล้ว ${int(-kLeft)} kcal — ไม่ต้องอดชดเชย กลับมากินตามแผนในมื้อถัดไป` });
    else if (pLeft > 25) out.push({ tone: 'info', text: `โปรตีนยังขาด ${int(pLeft)} ก. เหลือพลังงาน ${int(Math.max(0, kLeft))} kcal — เลือกเนื้อไม่ติดมัน ไข่ขาว หรือเวย์` });
    else if (pLeft <= 0) out.push({ tone: 'ok', text: 'โปรตีนถึงเป้าหมายแล้ววันนี้' });
  } else {
    out.push({ tone: 'info', text: 'ยังไม่ได้บันทึกอาหารวันนี้ — บันทึกทันทีหลังกินจะครบที่สุด' });
  }
  if (stepsToday == null) out.push({ tone: 'info', text: `บันทึกจำนวนก้าววันนี้ (เป้าหมาย ${int(goals.steps)} ก้าว)` });
  else if (stepsToday < goals.steps) out.push({ tone: 'info', text: `เดินอีก ${int(goals.steps - stepsToday)} ก้าวจะถึงเป้าหมาย` });
  if (!workedOutToday && weekWorkouts < goals.workoutsPerWeek) {
    out.push({ tone: 'info', text: `สัปดาห์นี้เวท ${weekWorkouts}/${goals.workoutsPerWeek} ครั้ง — เหลืออีก ${goals.workoutsPerWeek - weekWorkouts} ครั้ง` });
  }
  return out;
}
