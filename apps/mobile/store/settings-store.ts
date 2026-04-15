/**
 * Zustand settings store — persisted via AsyncStorage.
 *
 * Persistence is handled automatically by the `persist` middleware.
 * On first mount Zustand rehydrates from AsyncStorage; no manual "load" call
 * is needed for reads, but `loadSettings()` is exposed to let callers await
 * full hydration if they gate rendering on settings values.
 *
 * Usage
 * ─────
 *   const { soundEffects, toggleSoundEffects } = useSettingsStore();
 *
 * Startup (optional — only if you need to wait for hydration)
 * ─────────────────────────────────────────────────────────────
 *   await useSettingsStore.getState().loadSettings();
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnimationSpeed = "slow" | "normal" | "fast";
export type AppTheme = "dark" | "light";
export type CardStyle = "classic" | "modern" | "minimal";

export interface SettingsState {
  // ── Preference data ─────────────────────────────────────────────────────────

  /** Play sound effects during gameplay. */
  soundEffects: boolean;
  /** Play background music. */
  music: boolean;
  /** Vibrate on actions (native only). */
  vibration: boolean;
  /** Automatically muck losing hands at showdown. */
  autoMuckLosing: boolean;
  /** Show an overlay indicating hand strength during play. */
  showHandStrength: boolean;
  /** Speed of card-dealing and chip animations. */
  animationSpeed: AnimationSpeed;
  /** UI colour theme. */
  theme: AppTheme;
  /** Visual style used for cards. */
  cardStyle: CardStyle;
  /** Hex colour for the poker table felt (e.g. "#0a5f38"). */
  tableColor: string;

  // ── Boolean toggles ─────────────────────────────────────────────────────────

  toggleSoundEffects: () => void;
  toggleMusic: () => void;
  toggleVibration: () => void;
  toggleAutoMuckLosing: () => void;
  toggleShowHandStrength: () => void;

  // ── Value setters ───────────────────────────────────────────────────────────

  setAnimationSpeed: (speed: AnimationSpeed) => void;
  setTheme: (theme: AppTheme) => void;
  setCardStyle: (style: CardStyle) => void;
  setTableColor: (color: string) => void;

  // ── Convenience setters kept for backward-compat with SettingsScreen ────────

  setSoundEffects: (v: boolean) => void;
  setMusic: (v: boolean) => void;
  setVibration: (v: boolean) => void;
  setAutoMuckLosing: (v: boolean) => void;
  setShowHandStrength: (v: boolean) => void;

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Await full rehydration from AsyncStorage.
   * The persist middleware starts hydration automatically; this lets callers
   * block until it completes (e.g. to avoid a flash of default values).
   */
  loadSettings: () => Promise<void>;

  /** Reset all preferences to their compile-time defaults and re-persist. */
  resetToDefaults: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "poker_settings_v1";

// ─── Default values ───────────────────────────────────────────────────────────

export const SETTINGS_DEFAULTS = {
  soundEffects: true,
  music: true,
  vibration: false,
  autoMuckLosing: true,
  showHandStrength: true,
  animationSpeed: "normal" as AnimationSpeed,
  theme: "dark" as AppTheme,
  cardStyle: "classic" as CardStyle,
  tableColor: "#0a5f38",
} as const;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // ── Initial state (overwritten by rehydration) ────────────────────────

      ...SETTINGS_DEFAULTS,

      // ── Boolean toggles ──────────────────────────────────────────────────

      toggleSoundEffects: () =>
        set((s) => ({ soundEffects: !s.soundEffects })),
      toggleMusic: () =>
        set((s) => ({ music: !s.music })),
      toggleVibration: () =>
        set((s) => ({ vibration: !s.vibration })),
      toggleAutoMuckLosing: () =>
        set((s) => ({ autoMuckLosing: !s.autoMuckLosing })),
      toggleShowHandStrength: () =>
        set((s) => ({ showHandStrength: !s.showHandStrength })),

      // ── Value setters ────────────────────────────────────────────────────

      setAnimationSpeed: (speed) => set({ animationSpeed: speed }),
      setTheme: (theme) => set({ theme }),
      setCardStyle: (style) => set({ cardStyle: style }),
      setTableColor: (color) => set({ tableColor: color }),

      // ── Boolean setters (backward-compat with SettingsScreen) ────────────

      setSoundEffects: (v) => set({ soundEffects: v }),
      setMusic: (v) => set({ music: v }),
      setVibration: (v) => set({ vibration: v }),
      setAutoMuckLosing: (v) => set({ autoMuckLosing: v }),
      setShowHandStrength: (v) => set({ showHandStrength: v }),

      // ── Lifecycle ────────────────────────────────────────────────────────

      loadSettings: async () => {
        // The persist middleware rehydrates automatically on mount; this gives
        // callers a way to await explicit rehydration from AsyncStorage.
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<typeof SETTINGS_DEFAULTS>;
            set({ ...SETTINGS_DEFAULTS, ...parsed });
          }
        } catch {
          // Storage unavailable — remain on current (default) values.
        }
      },

      resetToDefaults: () => {
        set({ ...SETTINGS_DEFAULTS });
        // Wipe the persisted entry so the next cold-start also gets defaults.
        void AsyncStorage.removeItem(STORAGE_KEY);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist preference data — exclude action functions.
      partialize: (state) => ({
        soundEffects: state.soundEffects,
        music: state.music,
        vibration: state.vibration,
        autoMuckLosing: state.autoMuckLosing,
        showHandStrength: state.showHandStrength,
        animationSpeed: state.animationSpeed,
        theme: state.theme,
        cardStyle: state.cardStyle,
        tableColor: state.tableColor,
      }),
    }
  )
);
