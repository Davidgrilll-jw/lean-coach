// Tests for the calculation layer and the storage layer.
import { DEFAULT_FOODS } from '../js/data/foods.js';
import { addDays, diffDays, isValid, range, weekStart } from '../js/domain/dates.js';
import { activityFactor, averageIntake, bmrMifflin, checkTargets, foodNutrients, kcalFromMacros, suggestTargets, sumNutrients, tdee } from '../js/domain/nutrition.js';
import { analyzePlateau, empiricalTdee } from '../js/domain/plateau.js';
import { weeklyReport } from '../js/domain/report.js';
import { ValidationError, num, parseNum } from '../js/domain/validate.js';
import { dailyWeights, progressToTarget, rollingAverage, weeklyRate, weightSummary } from '../js/domain/weight.js';
import { est1RM, exerciseHistory, muscleSets, progressionAdvice, recoveryConflicts, strengthChange } from '../js/domain/workout.js';
import { createMemoryAdapter } from '../js/store/adapters.js';
import * as repo from '../js/store/repo.js';
import { eq, near, ok, test, throws } from './harness.js';

const TODAY = '2026-10-13'; // a Tuesday
const GOALS = { kcal: 2050, proteinG: 160, fatG: 60, carbG: 220, steps: 6000, workoutsPerWeek: 3, footballMin: 100, footballMax: 150 };
const food = (id) => DEFAULT_FOODS.find((f) => f.id === id);

/** Weigh-ins for the `days` days ending today; kgOf(i) with i = 0 for the oldest day. */
const weights = (days, kgOf, end = TODAY) => Array.from({ length: days }, (_, i) => ({ date: addDays(end, -(days - 1 - i)), kg: kgOf(i) }));
const foodDays = (days, kcal, protein = 160, end = TODAY) => Array.from({ length: days }, (_, i) => ({ date: addDays(end, -i), kcal, p: protein, c: 200, f: 60 }));
const stepDays = (days, steps, end = TODAY) => Array.from({ length: days }, (_, i) => ({ type: 'steps', date: addDays(end, -i), steps }));
const plateauInput = (over = {}) => ({ weightLogs: [], waistLogs: [], foodLogs: [], activityLogs: [], sessions: [], goals: GOALS, bmr: 1798, today: TODAY, ...over });
const flat = (i) => 80 + [0.3, -0.2, 0.1, -0.3, 0.2, 0, -0.1][i % 7];

// ---------- dates ----------

test('dates: day arithmetic crosses months and years', () => {
  eq(addDays('2026-12-31', 1), '2027-01-01');
  eq(addDays('2026-03-01', -1), '2026-02-28');
  eq(diffDays('2026-10-01', '2026-10-13'), 12);
  eq(range('2026-10-11', '2026-10-13'), ['2026-10-11', '2026-10-12', '2026-10-13']);
});

test('dates: week starts on Monday', () => {
  eq(weekStart('2026-10-13'), '2026-10-12');
  eq(weekStart('2026-10-12'), '2026-10-12');
  eq(weekStart('2026-10-18'), '2026-10-12');
});

test('dates: rejects impossible dates', () => {
  ok(isValid('2026-02-28'));
  ok(!isValid('2026-02-30'));
  ok(!isValid('13/10/2026'));
});

// ---------- energy ----------

test('BMR: Mifflin–St Jeor for an example profile (male, 30 y, 170 cm, 75 kg)', () => {
  near(bmrMifflin({ sex: 'male', age: 30, weightKg: 75, heightCm: 170 }), 1667.5);
});

test('BMR: female constant is 166 kcal lower; invalid input gives null', () => {
  near(bmrMifflin({ sex: 'female', age: 30, weightKg: 75, heightCm: 170 }), 1501.5);
  eq(bmrMifflin({ sex: 'male', age: 30, weightKg: NaN, heightCm: 170 }), null);
});

test('TDEE: BMR × activity factor, nothing added for exercise', () => {
  near(tdee(1667.5, activityFactor('light')), 2292.8125);
  near(tdee(1667.5, activityFactor('sedentary')), 2001);
});

test('targets: suggested starting targets for the example profile', () => {
  const bmr = 1667.5;
  eq(suggestTargets({ weightKg: 75, bmr, tdee: tdee(bmr, 1.375) }), { kcal: 1900, proteinG: 150, fatG: 55, carbG: 200 });
});

test('targets: calorie goal never suggested below BMR', () => {
  const t = suggestTargets({ weightKg: 80, bmr: 1800, tdee: 1900 });
  ok(t.kcal >= 1800, `kcal ${t.kcal} is below BMR`);
});

test('targets: 4/4/9 energy and consistency check', () => {
  eq(kcalFromMacros(160, 220, 60), 2060);
  ok(checkTargets(GOALS).consistent);
  const bad = checkTargets({ kcal: 2050, proteinG: 160, carbG: 300, fatG: 80 });
  ok(!bad.consistent);
  eq(bad.diff, 510);
});

// ---------- food ----------

test('food: 150 g of cooked chicken breast is 46.5 g protein, not 150 g', () => {
  const n = foodNutrients(food('chicken_breast_cooked'), 150);
  near(n.p, 46.5);
  near(n.kcal, 247.5);
});

test('food: raw and cooked weights of the same meat give different protein', () => {
  const raw = foodNutrients(food('chicken_breast_raw'), 150).p;
  const cooked = foodNutrients(food('chicken_breast_cooked'), 150).p;
  near(raw, 33.75);
  ok(cooked > raw);
});

test('food: 450 g cooked white rice', () => {
  const n = foodNutrients(food('rice_white_cooked'), 450);
  near(n.kcal, 585);
  near(n.c, 126.9);
});

test('food: every default item has sane values that roughly agree with 4/4/9', () => {
  for (const f of DEFAULT_FOODS) {
    ok(f.kcal >= 0 && f.kcal <= 900, `${f.name}: kcal out of range`);
    ok(f.p + f.c + f.f <= 100.5, `${f.name}: macros exceed 100 g`);
    if (f.id === 'beer') continue; // alcohol energy is not in the macros
    const diff = Math.abs(kcalFromMacros(f.p, f.c, f.f) - f.kcal);
    ok(diff <= Math.max(12, f.kcal * 0.12), `${f.name}: kcal ${f.kcal} vs macros ${kcalFromMacros(f.p, f.c, f.f)}`);
  }
});

test('food: totals add up across entries', () => {
  eq(sumNutrients([{ kcal: 100, p: 10, c: 5, f: 2 }, { kcal: 250.5, p: 20, c: 30, f: 4 }]), { kcal: 350.5, p: 30, c: 35, f: 6 });
});

test('food: weekly average ignores missing days and incompletely logged days', () => {
  const logs = [
    { date: '2026-10-12', kcal: 2000, p: 150, c: 200, f: 60 },
    { date: '2026-10-13', kcal: 1200, p: 80, c: 100, f: 40 },
    { date: '2026-10-13', kcal: 1000, p: 80, c: 100, f: 30 },
    { date: '2026-10-11', kcal: 300, p: 10, c: 40, f: 5 }, // one snack only: not a full day
  ];
  const a = averageIntake(logs, '2026-10-07', '2026-10-13');
  eq(a.loggedDays, 3);
  eq(a.completeDays, 2);
  near(a.kcal, 2100);
  near(a.p, 155);
  eq(averageIntake([], '2026-10-07', '2026-10-13').kcal, null);
});

// ---------- weight ----------

test('weight: several weigh-ins on one day are averaged to one value', () => {
  const d = dailyWeights([{ date: TODAY, kg: 80 }, { date: TODAY, kg: 81 }]);
  near(d.get(TODAY), 80.5);
});

test('weight: 7-day average uses exactly the last 7 calendar days', () => {
  const logs = weights(8, (i) => [90, 80, 80.2, 79.8, 80.4, 79.6, 80, 80][i]);
  const r = rollingAverage(dailyWeights(logs), TODAY);
  eq(r.n, 7);
  near(r.avg, 80, 1e-9);
});

test('weight: 7-day average with gaps averages only the days that exist', () => {
  const logs = [{ date: TODAY, kg: 80 }, { date: addDays(TODAY, -3), kg: 81 }, { date: addDays(TODAY, -6), kg: 82 }, { date: addDays(TODAY, -7), kg: 99 }];
  const r = rollingAverage(dailyWeights(logs), TODAY);
  eq(r.n, 3);
  near(r.avg, 81);
  eq(rollingAverage(new Map(), TODAY), { avg: null, n: 0 });
});

test('weight: weekly rate from a steady 0.1 kg/day loss is −0.7 kg/week', () => {
  near(weeklyRate(dailyWeights(weights(21, (i) => 82 - 0.1 * i)), TODAY), -0.7, 1e-9);
});

test('weight: weekly rate is null with too few points', () => {
  eq(weeklyRate(dailyWeights(weights(4, () => 80)), TODAY), null);
});

test('weight: summary, total lost and progress to target', () => {
  const s = weightSummary(weights(14, () => 80), { today: TODAY, startKg: 84, targetKg: 78 });
  near(s.avg7.avg, 80);
  near(s.totalLost, 4);
  near(s.progress, 4 / 6);
  near(s.weekChange, 0);
  eq(progressToTarget(80, 80, 80), null);
});

// ---------- plateau detector ----------

test('plateau: no verdict from a handful of weigh-ins', () => {
  const p = analyzePlateau(plateauInput({ weightLogs: weights(3, () => 80) }));
  eq(p.status, 'insufficient');
  ok(p.missing.length > 0);
  eq(p.actions, []);
});

test('plateau: a single high day never triggers a calorie cut', () => {
  const logs = weights(21, (i) => 81.5 - 0.06 * i);
  logs[20].kg += 1.4; // today's weigh-in jumps
  const p = analyzePlateau(plateauInput({ weightLogs: logs, foodLogs: foodDays(14, 2050), activityLogs: stepDays(14, 6500) }));
  ok(!p.actions.some((a) => a.id === 'kcal' && a.delta < 0), `status ${p.status} offered a cut`);
});

test('plateau: steady loss in range → keep the plan', () => {
  const p = analyzePlateau(plateauInput({ weightLogs: weights(21, (i) => 81.2 - 0.057 * i) }));
  eq(p.status, 'on_track');
  eq(p.actions, []);
});

test('plateau: losing more than 0.75% per week → too fast, suggests adding energy', () => {
  const p = analyzePlateau(plateauInput({ weightLogs: weights(21, (i) => 83 - 0.15 * i) }));
  eq(p.status, 'too_fast');
  eq(p.actions[0].delta, 100);
});

test('plateau: flat weight with a shrinking waist → keep going', () => {
  const p = analyzePlateau(
    plateauInput({ weightLogs: weights(21, flat), waistLogs: [{ date: addDays(TODAY, -20), cm: 88 }, { date: TODAY, cm: 86.8 }], foodLogs: foodDays(14, 2050), activityLogs: stepDays(14, 6500) })
  );
  eq(p.status, 'recomp');
  eq(p.actions, []);
});

test('plateau: flat weight but sparse food logging → fix logging, no cut', () => {
  const p = analyzePlateau(plateauInput({ weightLogs: weights(21, flat), waistLogs: [{ date: addDays(TODAY, -20), cm: 88 }, { date: TODAY, cm: 88 }], foodLogs: foodDays(4, 2050) }));
  eq(p.status, 'check_logging');
  eq(p.actions, []);
});

test('plateau: flat weight while eating above target → return to target, no cut', () => {
  const p = analyzePlateau(plateauInput({ weightLogs: weights(21, flat), foodLogs: foodDays(14, 2400), activityLogs: stepDays(14, 6500) }));
  eq(p.status, 'over_target');
  eq(p.actions, []);
});

test('plateau: flat weight and waist, on target, steps below goal → walk first', () => {
  const p = analyzePlateau(
    plateauInput({ weightLogs: weights(21, flat), waistLogs: [{ date: addDays(TODAY, -20), cm: 88 }, { date: TODAY, cm: 88.1 }], foodLogs: foodDays(14, 2050), activityLogs: stepDays(14, 4200) })
  );
  eq(p.status, 'plateau');
  eq(p.actions, []);
});

test('plateau: flat weight and waist, on target, steps met → offers a small change', () => {
  const p = analyzePlateau(
    plateauInput({ weightLogs: weights(21, flat), waistLogs: [{ date: addDays(TODAY, -20), cm: 88 }, { date: TODAY, cm: 88.1 }], foodLogs: foodDays(14, 2050), activityLogs: stepDays(14, 6500) })
  );
  eq(p.status, 'plateau');
  eq(p.actions.map((a) => [a.id, a.delta]), [['steps', 1000], ['kcal', -100]]);
});

test('plateau: never offers a cut that would go close to BMR', () => {
  const p = analyzePlateau(
    plateauInput({ goals: { ...GOALS, kcal: 1900 }, weightLogs: weights(21, flat), foodLogs: foodDays(14, 1900), activityLogs: stepDays(14, 6500) })
  );
  eq(p.status, 'plateau');
  ok(!p.actions.some((a) => a.id === 'kcal'));
});

test('plateau: after a goal change, waits 14 days before suggesting another', () => {
  const input = { weightLogs: weights(21, flat), foodLogs: foodDays(14, 2050), activityLogs: stepDays(14, 6500) };
  const change = (daysAgo) => [{ date: addDays(TODAY, -daysAgo), reason: 'x', changes: { kcal: { from: 2150, to: 2050 } } }];
  const recent = analyzePlateau(plateauInput({ ...input, goalHistory: change(5) }));
  eq(recent.status, 'adjusting');
  eq(recent.actions, []);
  eq(analyzePlateau(plateauInput({ ...input, goalHistory: change(14) })).status, 'plateau');
});

test('plateau: TDEE from real data needs dense logging', () => {
  eq(empiricalTdee({ weightLogs: weights(5, () => 80), foodLogs: foodDays(5, 2050), today: TODAY }), null);
  const e = empiricalTdee({ weightLogs: weights(21, (i) => 82 - 0.05 * i), foodLogs: foodDays(21, 2000), today: TODAY });
  near(e.kcal, 2000 + 0.05 * 7700, 1e-6); // losing 0.05 kg/day ≈ 385 kcal/day deficit
});

// ---------- workout ----------

const session = (date, sets) => ({ date, type: 'workout', status: 'done', sets });
const set = (exerciseId, kg, reps) => ({ exerciseId, exerciseName: exerciseId, kg, reps });
const EX = new Map([
  ['squat', { muscles: ['quads', 'glutes'], secondary: ['core'] }],
  ['row', { muscles: ['back'], secondary: ['biceps'] }],
]);

test('workout: Epley estimate', () => {
  near(est1RM(20, 10), 26.6666667, 1e-6);
  eq(est1RM(0, 10), 0);
});

test('workout: double progression advice', () => {
  const target = { sets: 3, repMin: 8, repMax: 12 };
  eq(progressionAdvice(null, target).code, 'start');
  eq(progressionAdvice([set('squat', 15, 12), set('squat', 15, 12)], target).code, 'finish_sets');
  eq(progressionAdvice([set('squat', 15, 12), set('squat', 15, 12), set('squat', 15, 12)], target).code, 'increase_load');
  eq(progressionAdvice([set('squat', 15, 10), set('squat', 15, 9), set('squat', 15, 8)], target).code, 'add_reps');
  eq(progressionAdvice([set('squat', 15, 9), set('squat', 15, 7), set('squat', 15, 6)], target).code, 'hold');
});

test('workout: history, weekly muscle sets and recovery conflicts', () => {
  const sessions = [session('2026-10-12', [set('squat', 15, 10), set('squat', 15, 9), set('row', 12, 10)]), session('2026-10-05', [set('squat', 12.5, 10)])];
  const h = exerciseHistory(sessions, 'squat');
  eq(h.map((x) => x.date), ['2026-10-05', '2026-10-12']);
  eq(h[1].volume, 285);
  eq(muscleSets(sessions, EX, '2026-10-12', '2026-10-18'), { quads: 2, glutes: 2, core: 1, back: 1, biceps: 0.5 });
  eq(recoveryConflicts(sessions, EX, ['squat'], '2026-10-13'), ['quads', 'glutes']);
  eq(recoveryConflicts(sessions, EX, ['squat'], '2026-10-14'), []);
});

test('workout: detects strength dropping by 5% or more', () => {
  const sessions = [session(addDays(TODAY, -20), [set('squat', 20, 10), set('row', 15, 10)]), session(addDays(TODAY, -2), [set('squat', 17.5, 10), set('row', 15, 10)])];
  const s = strengthChange(sessions, TODAY);
  eq(s.declined.map((d) => d.exerciseId), ['squat']);
});

// ---------- weekly report ----------

test('report: missing data stays missing instead of becoming zero', () => {
  const r = weeklyReport({ monday: '2026-10-12', today: TODAY, weightLogs: [], waistLogs: [], foodLogs: [], sessions: [], activityLogs: [], goals: GOALS });
  eq(r.weight.avg, null);
  eq(r.nutrition.kcal, null);
  eq(r.steps.avg, null);
  ok(!r.enough);
  eq(r.wins, []);
});

test('report: averages, change from last week and adherence', () => {
  const monday = '2026-10-05';
  const r = weeklyReport({
    monday,
    today: TODAY,
    weightLogs: [...weights(7, () => 80.5, '2026-10-04'), ...weights(7, () => 80.1, '2026-10-11')],
    waistLogs: [{ date: '2026-09-30', cm: 88 }, { date: '2026-10-07', cm: 87.2 }],
    foodLogs: foodDays(7, 2080, 150, '2026-10-11'),
    sessions: [session('2026-10-05', [set('squat', 15, 10)]), session('2026-10-07', [set('squat', 15, 10)]), session('2026-10-09', [set('squat', 15, 10)])],
    activityLogs: [...stepDays(7, 6400, '2026-10-11'), { type: 'football', date: '2026-10-08', minutes: 90 }, { type: 'football', date: '2026-10-10', minutes: 40 }],
    goals: GOALS,
  });
  ok(r.complete);
  near(r.weight.delta, -0.4, 1e-9);
  near(r.waist.delta, -0.8, 1e-9);
  near(r.nutrition.kcal, 2080);
  eq(r.workouts.done, 3);
  near(r.steps.avg, 6400);
  eq(r.football.minutes, 130);
  near(r.consistency.pct, 1);
  ok(r.enough);
  ok(r.wins.length >= 4);
});

// ---------- validation ----------

test('validation: numbers accept a decimal comma and reject text or out-of-range values', async () => {
  eq(parseNum('80,5'), 80.5);
  ok(Number.isNaN(parseNum('80kg')));
  eq(num('79.6', { label: 'w', min: 30, max: 250 }), 79.6);
  eq(num('', { label: 'w', optional: true }), null);
  await throws(() => num('abc', { label: 'w' }));
  await throws(() => num('500', { label: 'w', max: 250 }));
  await throws(() => num('6.5', { label: 'steps', integer: true }));
  try {
    num('x', { label: 'w' });
  } catch (err) {
    ok(err instanceof ValidationError);
  }
});

// ---------- storage ----------

test('storage: first run seeds defaults; records survive a reload of the same database', async () => {
  const adapter = createMemoryAdapter();
  await repo.init(adapter);
  eq(repo.settings().goals.kcal, 1900);
  eq(repo.settings().profileConfirmed, false);
  ok(repo.list('foodItems').length >= 80);
  eq(repo.list('workoutPlans').length, 3);
  const saved = await repo.save('weightLogs', { date: TODAY, kg: 79.8 });
  await repo.init(adapter); // simulates refreshing the page
  eq(repo.get('weightLogs', saved.id).kg, 79.8);
  await repo.save('weightLogs', { ...saved, kg: 79.5 });
  eq(repo.list('weightLogs').length, 1);
  eq(repo.get('weightLogs', saved.id).kg, 79.5);
  await repo.remove('weightLogs', saved.id);
  await repo.init(adapter);
  eq(repo.list('weightLogs').length, 0);
});

test('storage: goal changes are recorded with a reason', async () => {
  await repo.init(createMemoryAdapter());
  await repo.changeGoals({ kcal: 1800 }, 'test', TODAY);
  eq(repo.settings().goals.kcal, 1800);
  eq(repo.settings().goalHistory[0].changes.kcal, { from: 1900, to: 1800 });
  await repo.changeGoals({ kcal: 1800 }, 'no change', TODAY);
  eq(repo.settings().goalHistory.length, 1);
});

test('storage: export → wipe → import restores the data; bad files are rejected', async () => {
  await repo.init(createMemoryAdapter());
  await repo.save('weightLogs', { date: TODAY, kg: 80.2 });
  await repo.save('foodLogs', { date: TODAY, meal: 1, name: 'x', grams: 100, kcal: 130, p: 3, c: 28, f: 0 });
  const backup = JSON.parse(JSON.stringify(repo.exportAll()));
  await repo.wipe();
  eq(repo.list('weightLogs').length, 0);
  await repo.importAll(backup);
  eq(repo.list('weightLogs')[0].kg, 80.2);
  eq(repo.list('foodLogs').length, 1);
  await throws(() => repo.importAll({ hello: 'world' }));
  await throws(() => repo.importAll({ format: 'lean-coach-export', version: 1, data: { settings: [] } }));
  eq(repo.list('weightLogs').length, 1, 'a rejected import must not change data');
});
