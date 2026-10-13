// Default exercises, the starter 3-day dumbbell plan and the starter profile.
import { today } from '../domain/dates.js';
import { activityFactor, bmrMifflin, suggestTargets, tdee } from '../domain/nutrition.js';

// unit 'sec' = timed hold (the reps field stores seconds).
const EX = [
  ['goblet_squat', 'Goblet Squat', ['quads', 'glutes'], ['core']],
  ['split_squat', 'Bulgarian Split Squat (ต่อข้าง)', ['quads', 'glutes'], ['hamstrings']],
  ['reverse_lunge', 'Reverse Lunge (ต่อข้าง)', ['quads', 'glutes'], ['hamstrings']],
  ['rdl', 'Dumbbell Romanian Deadlift', ['hamstrings', 'glutes'], ['back']],
  ['hip_thrust', 'Dumbbell Hip Thrust / Glute Bridge', ['glutes'], ['hamstrings']],
  ['calf_raise', 'Standing Calf Raise', ['calves'], []],
  ['floor_press', 'Dumbbell Floor Press', ['chest'], ['triceps', 'shoulders']],
  ['push_up', 'Push-up', ['chest'], ['triceps', 'shoulders', 'core']],
  ['floor_fly', 'Dumbbell Floor Fly', ['chest'], ['shoulders']],
  ['one_arm_row', 'One-arm Dumbbell Row (ต่อข้าง)', ['back'], ['biceps']],
  ['bent_row', 'Bent-over Dumbbell Row', ['back'], ['biceps', 'hamstrings']],
  ['pullover', 'Dumbbell Pullover', ['back'], ['chest', 'triceps']],
  ['reverse_fly', 'Reverse Fly', ['shoulders'], ['back']],
  ['shoulder_press', 'Dumbbell Shoulder Press', ['shoulders'], ['triceps']],
  ['lateral_raise', 'Lateral Raise', ['shoulders'], []],
  ['curl', 'Dumbbell Curl', ['biceps'], []],
  ['hammer_curl', 'Hammer Curl', ['biceps'], []],
  ['overhead_ext', 'Overhead Triceps Extension', ['triceps'], []],
  ['kickback', 'Triceps Kickback', ['triceps'], []],
  ['plank', 'Plank', ['core'], [], 'sec'],
  ['dead_bug', 'Dead Bug', ['core'], []],
];

export const DEFAULT_EXERCISES = EX.map(([id, name, muscles, secondary, unit]) => ({
  id,
  name,
  muscles,
  secondary,
  unit: unit || 'reps',
  equipment: id === 'push_up' || id === 'plank' || id === 'dead_bug' ? 'bodyweight' : 'dumbbell',
  custom: false,
}));

const row = (exerciseId, sets, repMin, repMax, restSec) => ({ exerciseId, sets, repMin, repMax, restSec });

// Full body three times a week with at least one rest day between sessions:
// each muscle group is trained 2–3 times at a moderate volume that is
// recoverable in a calorie deficit and alongside football.
export const DEFAULT_PLANS = [
  {
    id: 'plan_a',
    name: 'วัน A — Full Body (เน้นขาหน้า/อก/หลัง)',
    weekday: 1,
    order: 1,
    exercises: [
      row('goblet_squat', 3, 8, 12, 90),
      row('floor_press', 3, 8, 12, 90),
      row('one_arm_row', 3, 8, 12, 75),
      row('lateral_raise', 2, 12, 15, 60),
      row('curl', 2, 10, 15, 60),
      row('plank', 2, 30, 60, 45),
    ],
  },
  {
    id: 'plan_b',
    name: 'วัน B — Full Body (เน้นขาหลัง/ไหล่/หลัง)',
    weekday: 3,
    order: 2,
    exercises: [
      row('rdl', 3, 8, 12, 90),
      row('shoulder_press', 3, 8, 12, 90),
      row('bent_row', 3, 8, 12, 75),
      row('push_up', 3, 8, 15, 75),
      row('overhead_ext', 2, 10, 15, 60),
      row('calf_raise', 2, 12, 20, 45),
    ],
  },
  {
    id: 'plan_c',
    name: 'วัน C — Full Body (ขาข้างเดียว/อก/แขน)',
    weekday: 5,
    order: 3,
    exercises: [
      row('split_squat', 3, 8, 12, 75),
      row('floor_fly', 3, 10, 15, 60),
      row('one_arm_row', 3, 10, 12, 75),
      row('reverse_fly', 2, 12, 15, 60),
      row('hammer_curl', 2, 10, 15, 60),
      row('kickback', 2, 12, 15, 60),
    ],
  },
];

export const USER_ID = 'local';

/**
 * Placeholder settings for a fresh install. They are generic example values,
 * not a real person's: `profileConfirmed` stays false until the user saves
 * their own profile in Settings, and the app asks for that on first use.
 */
export function defaultSettings() {
  const profile = {
    sex: 'male',
    age: 30,
    heightCm: 170,
    startWeightKg: 75,
    startDate: today(),
    currentWeightKg: 75, // used only until a weigh-in is logged
    activityLevel: 'light',
  };
  const bmr = bmrMifflin({ sex: profile.sex, age: profile.age, weightKg: profile.currentWeightKg, heightCm: profile.heightCm });
  const targets = suggestTargets({ weightKg: profile.currentWeightKg, bmr, tdee: tdee(bmr, activityFactor(profile.activityLevel)) });
  return {
    id: 'main',
    profile,
    profileConfirmed: false,
    goals: {
      targetWeightKg: 72,
      targetWeightMin: 71,
      targetWeightMax: 73,
      ...targets, // kcal, proteinG, fatG, carbG
      steps: 6000,
      footballMin: 100,
      footballMax: 150,
      workoutsPerWeek: 3,
      mealsPerDay: 4,
    },
    goalHistory: [],
    seeded: false,
  };
}
