// Read-model: combines stored data with the pure domain functions.
// Pages call these instead of repeating the wiring.
import { addDays, today, weekStart } from '../domain/dates.js';
import { activityFactor, bmrMifflin, sumNutrients, tdee } from '../domain/nutrition.js';
import { analyzePlateau, empiricalTdee } from '../domain/plateau.js';
import { weeklyReport } from '../domain/report.js';
import { weightSummary } from '../domain/weight.js';
import { workoutDays } from '../domain/workout.js';
import * as repo from '../store/repo.js';

export function overview(t = today()) {
  const settings = repo.settings();
  const { profile, goals } = settings;
  const weightLogs = repo.list('weightLogs');
  const summary = weightSummary(weightLogs, { today: t, startKg: profile.startWeightKg, targetKg: goals.targetWeightKg });

  // Weight used for BMR: measured trend when available, otherwise the profile value.
  const measured = summary.current;
  const weightKg = measured ?? profile.currentWeightKg;
  const weightSource = measured == null ? 'profile' : summary.avg7.n >= 3 ? 'avg7' : 'latest';
  const bmr = bmrMifflin({ sex: profile.sex, age: profile.age, weightKg, heightCm: profile.heightCm });
  const factor = activityFactor(profile.activityLevel);
  const data = {
    weightLogs,
    waistLogs: repo.list('waistLogs'),
    foodLogs: repo.list('foodLogs'),
    activityLogs: repo.list('activityLogs'),
    sessions: repo.list('workoutSessions'),
  };
  return {
    today: t,
    settings,
    profile,
    goals,
    summary,
    weightKg,
    weightSource,
    bmr,
    factor,
    tdee: tdee(bmr, factor),
    empirical: empiricalTdee({ weightLogs, foodLogs: data.foodLogs, today: t }),
    plateau: analyzePlateau({ ...data, goals, goalHistory: settings.goalHistory, bmr, today: t }),
    data,
  };
}

export function dayTotals(date) {
  const entries = repo.list('foodLogs').filter((e) => e.date === date);
  return { ...sumNutrients(entries), items: entries.length, entries };
}

export function stepsOn(date) {
  const log = repo.list('activityLogs').find((a) => a.type === 'steps' && a.date === date);
  return log ? log.steps : null;
}

export function latestWaist() {
  let best = null;
  for (const w of repo.list('waistLogs')) if (!best || w.date > best.date) best = w;
  return best;
}

export function weekWorkouts(t = today()) {
  const monday = weekStart(t);
  return workoutDays(repo.list('workoutSessions'), monday, addDays(monday, 6));
}

export function reportFor(monday, t = today()) {
  return weeklyReport({
    monday,
    today: t,
    weightLogs: repo.list('weightLogs'),
    waistLogs: repo.list('waistLogs'),
    foodLogs: repo.list('foodLogs'),
    sessions: repo.list('workoutSessions'),
    activityLogs: repo.list('activityLogs'),
    goals: repo.settings().goals,
  });
}
