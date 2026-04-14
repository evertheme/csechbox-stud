// Supabase client requires these at module-init time; setting them here ensures
// they are present before any test file imports lib/supabase.ts.
process.env["EXPO_PUBLIC_SUPABASE_URL"] = "https://test.supabase.co";
process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] = "test-anon-key";

global.IS_REACT_ACT_ENVIRONMENT = true;
