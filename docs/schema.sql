-- Lean Coach — PostgreSQL schema for a future server-side database.
-- The app currently stores the same data in IndexedDB (see js/store/adapters.js).
-- Mapping from the local stores is noted on each table.
-- Every table carries user_id; enable row level security so a user only ever
-- sees their own rows (example policy at the end).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- local: settings.profile
CREATE TABLE user_profiles (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sex               text NOT NULL CHECK (sex IN ('male', 'female')),
  age               int  NOT NULL CHECK (age BETWEEN 14 AND 100),
  height_cm         numeric(5,1) NOT NULL CHECK (height_cm BETWEEN 120 AND 230),
  start_weight_kg   numeric(5,2) NOT NULL,
  start_date        date NOT NULL,
  current_weight_kg numeric(5,2),
  activity_level    text NOT NULL DEFAULT 'light',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- local: settings.goals (current row) + settings.goalHistory (older rows)
CREATE TABLE user_goals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from     date NOT NULL,
  reason             text,
  target_weight_kg   numeric(5,2) NOT NULL,
  target_weight_min  numeric(5,2) NOT NULL,
  target_weight_max  numeric(5,2) NOT NULL,
  kcal               int NOT NULL CHECK (kcal BETWEEN 1000 AND 6000),
  protein_g          int NOT NULL,
  carb_g             int NOT NULL,
  fat_g              int NOT NULL,
  steps              int NOT NULL,
  football_min       int NOT NULL,
  football_max       int NOT NULL,
  workouts_per_week  int NOT NULL,
  meals_per_day      int NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_goals_user_date ON user_goals (user_id, effective_from DESC);

-- local: weightLogs
CREATE TABLE weight_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date   date NOT NULL,
  log_time   time,
  kg         numeric(5,2) NOT NULL CHECK (kg BETWEEN 30 AND 250),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX weight_logs_user_date ON weight_logs (user_id, log_date);

-- local: waistLogs
CREATE TABLE waist_measurements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date   date NOT NULL,
  cm         numeric(5,1) NOT NULL CHECK (cm BETWEEN 40 AND 200),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX waist_user_date ON waist_measurements (user_id, log_date);

-- local: foodItems (nutrient values are per 100 g)
CREATE TABLE food_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  category   text NOT NULL,
  state      text NOT NULL DEFAULT 'na' CHECK (state IN ('raw', 'cooked', 'na')),
  kcal       numeric(6,1) NOT NULL CHECK (kcal BETWEEN 0 AND 900),
  protein_g  numeric(5,1) NOT NULL CHECK (protein_g BETWEEN 0 AND 100),
  carb_g     numeric(5,1) NOT NULL CHECK (carb_g BETWEEN 0 AND 100),
  fat_g      numeric(5,1) NOT NULL CHECK (fat_g BETWEEN 0 AND 100),
  servings   jsonb NOT NULL DEFAULT '[]',  -- [{ "label": "ทัพพี", "grams": 60 }]
  favorite   boolean NOT NULL DEFAULT false,
  custom     boolean NOT NULL DEFAULT true,
  source     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX food_items_user ON food_items (user_id, name);

-- local: foodLogs (nutrients are a snapshot taken when the entry is logged)
CREATE TABLE food_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date     date NOT NULL,
  meal         int  NOT NULL,              -- 0 = snack/drink, 1..n = meal number
  food_item_id uuid REFERENCES food_items(id) ON DELETE SET NULL,
  name         text NOT NULL,
  state        text NOT NULL DEFAULT 'na',
  grams        numeric(7,1) NOT NULL CHECK (grams > 0),
  unit_label   text,
  unit_qty     numeric(7,2),
  kcal         numeric(7,1) NOT NULL,
  protein_g    numeric(6,1) NOT NULL,
  carb_g       numeric(6,1) NOT NULL,
  fat_g        numeric(6,1) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX food_logs_user_date ON food_logs (user_id, log_date);

-- local: mealTemplates
CREATE TABLE meal_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  items      jsonb NOT NULL,               -- same shape as food_logs rows without date/meal
  created_at timestamptz NOT NULL DEFAULT now()
);

-- local: exercises
CREATE TABLE exercises (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  muscles    text[] NOT NULL,              -- primary muscles
  secondary  text[] NOT NULL DEFAULT '{}',
  unit       text NOT NULL DEFAULT 'reps' CHECK (unit IN ('reps', 'sec')),
  equipment  text NOT NULL DEFAULT 'dumbbell',
  custom     boolean NOT NULL DEFAULT true
);

-- local: workoutPlans (plan.exercises[] becomes workout_plan_exercises)
CREATE TABLE workout_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  weekday    int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  sort_order int  NOT NULL DEFAULT 0
);
CREATE TABLE workout_plan_exercises (
  plan_id     uuid NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  position    int  NOT NULL,
  exercise_id uuid NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  sets        int  NOT NULL,
  rep_min     int  NOT NULL,
  rep_max     int  NOT NULL,
  rest_sec    int  NOT NULL,
  PRIMARY KEY (plan_id, position)
);

-- local: workoutSessions (type 'rest' rows are rest/recovery days)
CREATE TABLE workout_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  type         text NOT NULL DEFAULT 'workout' CHECK (type IN ('workout', 'rest')),
  status       text NOT NULL DEFAULT 'done' CHECK (status IN ('active', 'done')),
  plan_id      uuid REFERENCES workout_plans(id) ON DELETE SET NULL,
  plan_name    text,
  started_at   timestamptz,
  finished_at  timestamptz,
  duration_min int,
  energy       int CHECK (energy BETWEEN 1 AND 3),
  soreness     int CHECK (soreness BETWEEN 1 AND 5),
  sleep_hours  numeric(3,1),
  note         text
);
CREATE INDEX workout_sessions_user_date ON workout_sessions (user_id, session_date);

-- local: workoutSessions.sets[]
CREATE TABLE workout_sets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id      uuid REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name    text NOT NULL,
  kg               numeric(5,2) NOT NULL CHECK (kg BETWEEN 0 AND 200),
  reps             int NOT NULL CHECK (reps > 0),   -- seconds for timed holds
  rest_sec         int,                              -- actual rest before this set
  planned_rest_sec int,
  performed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workout_sets_session ON workout_sets (session_id);

-- local: activityLogs
CREATE TABLE activity_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date   date NOT NULL,
  type       text NOT NULL CHECK (type IN ('steps', 'football', 'cardio')),
  name       text,
  steps      int CHECK (steps BETWEEN 0 AND 100000),
  minutes    int CHECK (minutes BETWEEN 1 AND 600),
  fatigue    int CHECK (fatigue BETWEEN 1 AND 5),
  note       text,
  source     text NOT NULL DEFAULT 'manual',  -- 'manual' until a health API is connected
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_user_date ON activity_logs (user_id, log_date);
CREATE UNIQUE INDEX activity_steps_one_per_day ON activity_logs (user_id, log_date) WHERE type = 'steps';

-- local: photos (store the image in private object storage, not in the table)
CREATE TABLE progress_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_date  date NOT NULL,
  kg          numeric(5,2),
  pose        text NOT NULL DEFAULT 'front' CHECK (pose IN ('front', 'side', 'back')),
  note        text,
  storage_key text NOT NULL,                 -- private bucket key; serve via short-lived signed URLs
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- local: weeklyReports
CREATE TABLE weekly_reports (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start date NOT NULL,                  -- Monday
  snapshot   jsonb NOT NULL,
  ai_text    text,
  ai_model   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);

-- Row level security: repeat for every table that has user_id.
-- The API sets the user for the transaction:  SET LOCAL app.user_id = '<uuid>';
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY weight_logs_owner ON weight_logs
  USING (user_id = current_setting('app.user_id')::uuid)
  WITH CHECK (user_id = current_setting('app.user_id')::uuid);
