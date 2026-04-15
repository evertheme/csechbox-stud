import { createClient } from "@supabase/supabase-js";
import * as secureStorage from "./secure-storage";

const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"]!;
const supabaseAnonKey = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"]!;

const storage = {
  getItem:    (key: string) => secureStorage.getItem(key),
  setItem:    (key: string, value: string) => secureStorage.setItem(key, value),
  removeItem: (key: string) => secureStorage.deleteItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
