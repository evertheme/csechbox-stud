/**
 * Zustand settings store.
 *
 * Preferences are persisted to AsyncStorage so they survive app restarts.
 * The key used is "poker_settings_v1".
 *
 * Usage:
 *   const { soundEffects, setSoundEffects } = useSettingsStore();
 *
 * Initialization:
 *   Call useSettingsStore.getState().load() once at app startup (e.g. in
 *   _layout.tsx alongside authStore.initialize()). The store sets isLoaded
 *   to true when done so consumers can gate on it if needed.
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnimationSpeed = "slow" | "normal" | "fast";
export type AppTheme = "dark" | "light";
export type CardStyle = "classic" | "modern" | "minimal";
export type TableColor = "green" | "blue" | "red" | "black";

export interface SettingsState {
  // ── Data ────────────────────────────────────────────────────────────────────
  isLoaded: boolean;

  // Game preferences
  soundEffects: boolean;
  music: boolean;
  vibration: boolean;
  autoMuckLosing: boolean;
  showHandStrength: boolean;
  animationSpeed: AnimationSpeed;

  // Display
  theme: AppTheme;
  cardStyle: CardStyle;
  tableColor: TableColor;

  // ── Actions ─────────────────────────────────────────────────────────────────
  /** Load persisted settings from AsyncStorage. Call once at startup. */
  load: () => Promise<void>;
  /** Persist all current settings to AsyncStorage. */
  save: () => Promise<void>;
  /** Reset all preferences to their defaults and persist. */
  reset: () => Promise<void>;

  setSoundEffects: (v: boolean) => void;
  setMusic: (v: boolean) => void;
  setVibration: (v: boolean) => void;
  setAutoMuckLosing: (v: boolean) => void;
  setShowHandStrength: (v: boolean) => void;
  setAnimationSpeed: (v: AnimationSpeed) => void;
  setTheme: (v: AppTheme) => void;
  setCardStyle: (v: CardStyle) => void;
  setTableColor: (v: TableColor) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "poker_settings_v1";

const DEFAULTS: Omit<SettingsState, "isLoaded" | keyof SettingsMethods> = {
  soundEffects: true,
  music: true,
  vibration: false,
  autoMuckLosing: true,
  showHandStrength: true,
  animationSpeed: "normal",
  theme: "dark",
  cardStyle: "classic",
  tableColor: "green",
};

type SettingsMethods = Pick<
  SettingsState,
  | "load"
  | "save"
  | "reset"
  | "setSoundEffects"
  | "setMusic"
  | "setVibration"
  | "setAutoMuckLosing"
  | "setShowHandStrength"
  | "setAnimationSpeed"
  | "setTheme"
  | "setCardStyle"
  | "setTableColor"
>;

// ─── Persisted preference keys (subset of state) ──────────────────────────────

type PersistedPrefs = Omit<typeof DEFAULTS, never>;

function pickPersistedPrefs(state: SettingsState): PersistedPrefs {
  return {
    soundEffects: state.soundEffects,
    music: state.music,
    vibration: state.vibration,
    autoMuckLosing: state.autoMuckLosing,
    showHandStrength: state.showHandStrength,
    animationSpeed: state.animationSpeed,
    theme: state.theme,
    cardStyle: state.cardStyle,
    tableColor: state.tableColor,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>((set, get) => ({
  isLoaded: false,
  ...DEFAULTS,

  // ── load ──────────────────────────────────────────────────────────────────

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedPrefs>;
        set({ ...DEFAULTS, ...parsed, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      // If storage is corrupt/unavailable, fall back to defaults.
      set({ isLoaded: true });
    }
  },

  // ── save ──────────────────────────────────────────────────────────────────

  save: async () => {
    const prefs = pickPersistedPrefs(get());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  },

  // ── reset ─────────────────────────────────────────────────────────────────

  reset: async () => {
    set({ ...DEFAULTS });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
  },

  // ── Toggle setters (each persists immediately) ────────────────────────────

  setSoundEffects: (v) => {
    set({ soundEffects: v });
    void get().save();
  },
  setMusic: (v) => {
    set({ music: v });
    void get().save();
  },
  setVibration: (v) => {
    set({ vibration: v });
    void get().save();
  },
  setAutoMuckLosing: (v) => {
    set({ autoMuckLosing: v });
    void get().save();
  },
  setShowHandStrength: (v) => {
    set({ showHandStrength: v });
    void get().save();
  },
  setAnimationSpeed: (v) => {
    set({ animationSpeed: v });
    void get().save();
  },
  setTheme: (v) => {
    set({ theme: v });
    void get().save();
  },
  setCardStyle: (v) => {
    set({ cardStyle: v });
    void get().save();
  },
  setTableColor: (v) => {
    set({ tableColor: v });
    void get().save();
  },
}));
