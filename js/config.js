// Cloud sync configuration (Supabase). Leave both values empty to run the app
// on-device only.
//
// These two values are meant to be public: the key is the project's
// "publishable" / "anon" key, and row level security in the database
// (docs/supabase.sql) is what keeps each account's data private.
// NEVER put the "service_role" / "secret" key here.
export const SUPABASE_URL = '';
export const SUPABASE_KEY = '';
