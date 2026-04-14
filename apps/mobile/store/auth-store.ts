/**
 * Zustand auth store.
 *
 * Architectural note
 * ──────────────────
 * This store is the global, singleton source of auth state.  It works both
 * inside and outside React components (e.g. socket handlers, API helpers).
 *
 * AuthContext (context/AuthContext.tsx) still exists for the subset of logic
 * that requires Expo Router hooks (useRouter / useSegments) to perform
 * redirect navigation based on auth state.  The two layers are independent —
 * each subscribes to Supabase's onAuthStateChange separately.  Neither calls
 * the other.
 *
 * Extended state owned exclusively here
 * ──────────────────────────────────────
 * • chips   — in-game currency, initialised from user metadata and kept in
 *             local store state.  updateChips() is intentionally synchronous
 *             and local-only; callers are responsible for persisting to the
 *             database when required.
 */

import { create } from "zustand";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthState {
  // ── Data ──────────────────────────────────────────────────────────────────
  user: User | null;
  session: Session | null;
  /** True while the initial session check (initialize) is in progress. */
  isLoading: boolean;
  /** Derived: true whenever a valid session exists. */
  isAuthenticated: boolean;
  /** In-game chip count, sourced from user_metadata on sign-in. */
  chips: number;

  // ── Setters ────────────────────────────────────────────────────────────────
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;

  // ── Async actions ──────────────────────────────────────────────────────────
  /**
   * Load the persisted session and subscribe to future auth changes.
   * Call once at app startup (e.g. in the root layout).
   */
  initialize: () => Promise<void>;
  /** Sign the current user out, clear all state, and navigate to the auth
   *  welcome screen. */
  signOut: () => Promise<void>;
  /** Persist a new username in Supabase user metadata and sync to the store. */
  updateUsername: (username: string) => Promise<{ error: AuthError | null }>;

  // ── Sync actions ───────────────────────────────────────────────────────────
  /** Replace the local chip count (not persisted automatically). */
  updateChips: (amount: number) => void;
}

// ─── Internal subscription reference ─────────────────────────────────────────
//
// Stored outside the Zustand state so that initialize() can tear down a
// previous subscription when called more than once (e.g. during hot reload).

let _unsubscribe: (() => void) | null = null;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────

  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  chips: 0,

  // ── Setters ────────────────────────────────────────────────────────────────

  setUser: (user) => set({ user }),

  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      isAuthenticated: !!session,
    }),

  // ── initialize ────────────────────────────────────────────────────────────

  initialize: async () => {
    // Tear down any previous subscription (safe to call during dev reloads).
    _unsubscribe?.();
    _unsubscribe = null;

    set({ isLoading: true });

    // Restore any persisted session (Supabase uses expo-secure-store).
    const {
      data: { session },
    } = await supabase.auth.getSession();

    set({
      session,
      user: session?.user ?? null,
      isAuthenticated: !!session,
      chips: (session?.user?.user_metadata?.["chips"] as number | undefined) ?? 0,
      isLoading: false,
    });

    // Subscribe to future auth state changes.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        set({ session: null, user: null, isAuthenticated: false, chips: 0 });
        return;
      }

      set({
        session,
        user: session?.user ?? null,
        isAuthenticated: !!session,
        // Keep existing chips when metadata doesn't include them (e.g. token
        // refresh) rather than resetting to 0.
        chips:
          (session?.user?.user_metadata?.["chips"] as number | undefined) ??
          get().chips,
      });
    });

    _unsubscribe = () => subscription.unsubscribe();
  },

  // ── signOut ───────────────────────────────────────────────────────────────

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, isAuthenticated: false, chips: 0 });
    router.replace("/(auth)");
  },

  // ── updateUsername ────────────────────────────────────────────────────────

  updateUsername: async (username) => {
    const { data, error } = await supabase.auth.updateUser({
      data: { username },
    });
    if (!error && data.user) {
      set({ user: data.user });
    }
    return { error: error ?? null };
  },

  // ── updateChips ───────────────────────────────────────────────────────────

  updateChips: (amount) => set({ chips: amount }),
}));
