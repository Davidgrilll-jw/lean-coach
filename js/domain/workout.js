// Resistance-training calculations. Pure functions.
import { addDays } from './dates.js';

export const MUSCLES = {
  quads: 'ต้นขาหน้า',
  hamstrings: 'ต้นขาหลัง',
  glutes: 'ก้น',
  calves: 'น่อง',
  chest: 'อก',
  back: 'หลัง',
  shoulders: 'ไหล่',
  biceps: 'ไบเซป',
  triceps: 'ไตรเซป',
  core: 'แกนกลางลำตัว',
};

/** Epley estimate. Only meaningful for roughly 1–15 reps. */
export function est1RM(kg, reps) {
  if (!(kg > 0) || !(reps > 0)) return 0;
  return kg * (1 + reps / 30);
}

/** Comparable score for one set: estimated 1RM when loaded, reps (or seconds) when bodyweight. */
export function setScore(set) {
  return set.kg > 0 ? est1RM(set.kg, set.reps) : set.reps;
}

export const isWorkout = (s) => s.type !== 'rest' && s.status !== 'active';

/** Per-session history of one exercise, oldest first. */
export function exerciseHistory(sessions, exerciseId) {
  const out = [];
  for (const s of sessions) {
    if (s.type === 'rest') continue;
    const sets = (s.sets || []).filter((x) => x.exerciseId === exerciseId);
    if (!sets.length) continue;
    const topKg = Math.max(...sets.map((x) => x.kg));
    out.push({
      date: s.date,
      sessionId: s.id,
      sets,
      topKg,
      topReps: Math.max(...sets.filter((x) => x.kg === topKg).map((x) => x.reps)),
      volume: sets.reduce((a, x) => a + x.kg * x.reps, 0),
      totalReps: sets.reduce((a, x) => a + x.reps, 0),
      score: Math.max(...sets.map(setScore)),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Double progression: fill the rep range first, then add load.
 * `lastSets` are the sets from the most recent session of the exercise.
 */
export function progressionAdvice(lastSets, { sets, repMin, repMax }, unit = 'reps') {
  const u = unit === 'sec' ? 'วินาที' : 'ครั้ง';
  if (!lastSets || !lastSets.length) {
    return { code: 'start', text: `เริ่มด้วยน้ำหนักที่ทำได้ ${repMin}–${repMax} ${u} โดยยังเหลือแรงอีก 1–2 ${u}` };
  }
  if (lastSets.length < sets) {
    return { code: 'finish_sets', text: `ครั้งก่อนทำ ${lastSets.length}/${sets} เซต — ทำให้ครบ ${sets} เซตด้วยน้ำหนักเดิมก่อน` };
  }
  const reps = lastSets.map((s) => s.reps);
  if (reps.every((r) => r >= repMax)) {
    const loaded = lastSets.some((s) => s.kg > 0);
    return {
      code: 'increase_load',
      text: loaded
        ? `ครบ ${repMax} ${u} ทุกเซตแล้ว — เพิ่มน้ำหนักขั้นถัดไปที่มี แล้วเริ่มใหม่ที่ ${repMin} ${u}`
        : `ครบ ${repMax} ${u} ทุกเซตแล้ว — เพิ่มความยาก (ถือดัมเบล/ลงช้าลง) หรือเพิ่ม 1 เซต`,
    };
  }
  if (reps.every((r) => r >= repMin)) {
    return { code: 'add_reps', text: `น้ำหนักเดิม เพิ่มเซตละ 1 ${u} จนถึง ${repMax} ${u}` };
  }
  return { code: 'hold', text: `ยังไม่ถึง ${repMin} ${u} ทุกเซต — คงน้ำหนักเดิม หรือลดลงเล็กน้อยเพื่อให้ฟอร์มดี` };
}

/** Weekly set count per muscle: 1 per set for primary muscles, 0.5 for secondary. */
export function muscleSets(sessions, exercisesById, from, to) {
  const out = {};
  for (const s of sessions) {
    if (s.type === 'rest' || s.date < from || s.date > to) continue;
    for (const set of s.sets || []) {
      const ex = exercisesById.get(set.exerciseId);
      if (!ex) continue;
      for (const m of ex.muscles || []) out[m] = (out[m] || 0) + 1;
      for (const m of ex.secondary || []) out[m] = (out[m] || 0) + 0.5;
    }
  }
  return out;
}

/** Number of distinct days with a finished workout in [from, to]. */
export function workoutDays(sessions, from, to) {
  const days = new Set();
  for (const s of sessions) {
    if (isWorkout(s) && (s.sets || []).length && s.date >= from && s.date <= to) days.add(s.date);
  }
  return days.size;
}

/**
 * Primary muscles of the planned exercises that were already trained the day
 * before `date` (less than ~48 h of recovery).
 */
export function recoveryConflicts(sessions, exercisesById, plannedExerciseIds, date) {
  const yesterday = addDays(date, -1);
  const trained = new Set();
  for (const s of sessions) {
    if (s.type === 'rest' || s.date !== yesterday) continue;
    for (const set of s.sets || []) {
      for (const m of exercisesById.get(set.exerciseId)?.muscles || []) trained.add(m);
    }
  }
  const planned = new Set();
  for (const id of plannedExerciseIds) {
    for (const m of exercisesById.get(id)?.muscles || []) planned.add(m);
  }
  return [...planned].filter((m) => trained.has(m));
}

/**
 * Best score per exercise in the last 14 days against the 14 days before.
 * Used to notice strength dropping during a deficit.
 */
export function strengthChange(sessions, today) {
  const recentFrom = addDays(today, -13);
  const prevFrom = addDays(today, -27);
  const best = new Map();
  for (const s of sessions) {
    if (s.type === 'rest' || s.date < prevFrom || s.date > today) continue;
    const slot = s.date >= recentFrom ? 'recent' : 'prev';
    for (const set of s.sets || []) {
      const b = best.get(set.exerciseId) || { name: set.exerciseName, recent: 0, prev: 0 };
      b[slot] = Math.max(b[slot], setScore(set));
      best.set(set.exerciseId, b);
    }
  }
  const compared = [];
  for (const [exerciseId, b] of best) {
    if (b.recent > 0 && b.prev > 0) compared.push({ exerciseId, name: b.name, pct: (b.recent - b.prev) / b.prev });
  }
  return { compared, declined: compared.filter((c) => c.pct <= -0.05) };
}
