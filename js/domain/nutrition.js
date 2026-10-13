// Energy and nutrient calculations. Pure functions, no storage or DOM access.

export const KCAL_PER_G = { protein: 4, carb: 4, fat: 9 };

/** Days logged below this are treated as incompletely logged and left out of averages. */
export const MIN_COMPLETE_KCAL = 1000;

// The multiplier already includes planned exercise. Exercise calories must
// never be added on top of TDEE again.
export const ACTIVITY_LEVELS = [
  { id: 'sedentary', factor: 1.2, label: 'นั่งเป็นส่วนใหญ่', desc: 'งานนั่งโต๊ะ แทบไม่ออกกำลังกาย' },
  { id: 'light', factor: 1.375, label: 'เคลื่อนไหวเล็กน้อย', desc: 'ออกกำลัง 2–4 วัน/สัปดาห์ แต่เดินน้อย (ต่ำกว่า ~6,000 ก้าว)' },
  { id: 'moderate', factor: 1.55, label: 'ปานกลาง', desc: 'ออกกำลัง 4–5 วัน/สัปดาห์ และเดิน 8,000+ ก้าว' },
  { id: 'high', factor: 1.725, label: 'สูง', desc: 'ฝึกหนักเกือบทุกวัน หรืองานใช้แรง' },
  { id: 'very_high', factor: 1.9, label: 'สูงมาก', desc: 'นักกีฬา/งานใช้แรงหนักทั้งวัน' },
];

export function activityFactor(id) {
  return (ACTIVITY_LEVELS.find((l) => l.id === id) || ACTIVITY_LEVELS[1]).factor;
}

/** Mifflin–St Jeor. Returns kcal/day (not rounded). */
export function bmrMifflin({ sex, age, weightKg, heightCm }) {
  for (const v of [age, weightKg, heightCm]) {
    if (!Number.isFinite(v) || v <= 0) return null;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);
}

export function tdee(bmr, factor) {
  return bmr == null ? null : bmr * factor;
}

export function kcalFromMacros(p, c, f) {
  return p * KCAL_PER_G.protein + c * KCAL_PER_G.carb + f * KCAL_PER_G.fat;
}

const roundTo = (v, step) => Math.round(v / step) * step;

/**
 * Starting targets for fat loss while keeping muscle:
 * ~18% below estimated TDEE (never below BMR), protein 2.0 g/kg,
 * fat 0.75 g/kg, carbohydrate from the remaining energy.
 */
export function suggestTargets({ weightKg, bmr, tdee: tdeeKcal }) {
  if (!bmr || !tdeeKcal || !weightKg) return null;
  const kcal = Math.max(roundTo(tdeeKcal * 0.82, 50), roundTo(bmr, 50));
  const proteinG = roundTo(weightKg * 2.0, 5);
  const fatG = roundTo(weightKg * 0.75, 5);
  const carbG = Math.max(0, roundTo((kcal - proteinG * 4 - fatG * 9) / 4, 5));
  return { kcal, proteinG, fatG, carbG };
}

/** Does the calorie target agree with the macro targets? (tolerance in kcal) */
export function checkTargets({ kcal, proteinG, carbG, fatG }, tolerance = 60) {
  const macroKcal = kcalFromMacros(proteinG, carbG, fatG);
  const diff = macroKcal - kcal;
  return { macroKcal, diff, consistent: Math.abs(diff) <= tolerance };
}

/** Nutrients for `grams` of a food item whose values are stored per 100 g. */
export function foodNutrients(food, grams) {
  const k = grams / 100;
  return {
    kcal: food.kcal * k,
    p: food.p * k,
    c: food.c * k,
    f: food.f * k,
  };
}

export function sumNutrients(entries) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const e of entries) {
    t.kcal += e.kcal || 0;
    t.p += e.p || 0;
    t.c += e.c || 0;
    t.f += e.f || 0;
  }
  return t;
}

/** Map of date -> totals for every date that has at least one entry. */
export function totalsByDate(foodLogs) {
  const byDate = new Map();
  for (const e of foodLogs) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const out = new Map();
  for (const [date, list] of byDate) out.set(date, { ...sumNutrients(list), items: list.length });
  return out;
}

/**
 * Average intake over [from, to]. Only days that look completely logged
 * (>= MIN_COMPLETE_KCAL) are averaged; missing days are never counted as zero.
 */
export function averageIntake(foodLogs, from, to) {
  const totals = totalsByDate(foodLogs.filter((e) => e.date >= from && e.date <= to));
  let loggedDays = 0;
  const complete = [];
  for (const t of totals.values()) {
    loggedDays += 1;
    if (t.kcal >= MIN_COMPLETE_KCAL) complete.push(t);
  }
  if (!complete.length) return { loggedDays, completeDays: 0, kcal: null, p: null, c: null, f: null };
  const s = sumNutrients(complete);
  const n = complete.length;
  return { loggedDays, completeDays: n, kcal: s.kcal / n, p: s.p / n, c: s.c / n, f: s.f / n };
}
