/**
 * Verifies that lib/supabase.ts correctly creates a Supabase client using the
 * Expo-specific config (SecureStore adapter, correct auth options).
 *
 * We mock @supabase/supabase-js so that createClient can be inspected without
 * needing real environment variables present at module-init time.
 */

// Must be before any imports so the mock is in place when lib/supabase.ts loads.
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  })),
}));

import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import * as SecureStore from "expo-secure-store";

describe("supabase client", () => {
  it("calls createClient exactly once on module load", () => {
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("passes the Supabase URL and anon key from env vars", () => {
    const [url, key] = jest.mocked(createClient).mock.calls[0];
    // env vars are set in jest.setup.ts
    expect(url).toBe(process.env["EXPO_PUBLIC_SUPABASE_URL"]);
    expect(key).toBe(process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"]);
  });

  it("configures auth with autoRefreshToken and persistSession enabled", () => {
    const [, , options] = jest.mocked(createClient).mock.calls[0] as [string, string, any];
    expect(options.auth.autoRefreshToken).toBe(true);
    expect(options.auth.persistSession).toBe(true);
    expect(options.auth.detectSessionInUrl).toBe(false);
  });

  it("uses expo-secure-store as the storage adapter", () => {
    const [, , options] = jest.mocked(createClient).mock.calls[0] as [string, string, any];
    const storage = options.auth.storage;
    // Verify the adapter delegates to the SecureStore functions.
    storage.getItem("k");
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith("k");
    storage.setItem("k", "v");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("k", "v");
    storage.removeItem("k");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("k");
  });

  it("exports the client returned by createClient", () => {
    const returnedClient = jest.mocked(createClient).mock.results[0].value;
    expect(supabase).toBe(returnedClient);
  });
});
