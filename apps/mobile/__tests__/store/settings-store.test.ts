/**
 * settings-store tests.
 *
 * Testing strategy
 * ────────────────
 * • Actions are tested directly via useSettingsStore.getState() — no React
 *   rendering required.
 * • AsyncStorage and Zustand's persist middleware are both mocked so tests
 *   run synchronously without hitting native modules.
 * • State is reset to SETTINGS_DEFAULTS before every test to prevent
 *   cross-test pollution.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

// Mock AsyncStorage — all tests assert against these spies.
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
}));

// Strip the persist middleware so tests run synchronously without any storage
// I/O from the middleware itself.  loadSettings / resetToDefaults call
// AsyncStorage directly, so those are still verifiable via the mock above.
jest.mock("zustand/middleware", () => ({
  persist:
    (config: (...args: unknown[]) => unknown) =>
    (zustandSet: unknown, zustandGet: unknown, zustandApi: unknown) =>
      config(zustandSet, zustandGet, zustandApi),
  createJSONStorage: () => ({}),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSettingsStore, SETTINGS_DEFAULTS } from "../../store/settings-store";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Reset store state to defaults before each test. */
function resetStore() {
  useSettingsStore.setState({ ...SETTINGS_DEFAULTS });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

// ─── Default state ────────────────────────────────────────────────────────────

describe("settings-store — default state", () => {
  it("has soundEffects: true by default", () => {
    expect(useSettingsStore.getState().soundEffects).toBe(true);
  });

  it("has music: true by default", () => {
    expect(useSettingsStore.getState().music).toBe(true);
  });

  it("has vibration: false by default", () => {
    expect(useSettingsStore.getState().vibration).toBe(false);
  });

  it("has autoMuckLosing: true by default", () => {
    expect(useSettingsStore.getState().autoMuckLosing).toBe(true);
  });

  it("has showHandStrength: true by default", () => {
    expect(useSettingsStore.getState().showHandStrength).toBe(true);
  });

  it("has animationSpeed: 'normal' by default", () => {
    expect(useSettingsStore.getState().animationSpeed).toBe("normal");
  });

  it("has theme: 'dark' by default", () => {
    expect(useSettingsStore.getState().theme).toBe("dark");
  });

  it("has cardStyle: 'classic' by default", () => {
    expect(useSettingsStore.getState().cardStyle).toBe("classic");
  });

  it("has tableColor: '#0a5f38' by default", () => {
    expect(useSettingsStore.getState().tableColor).toBe("#0a5f38");
  });
});

// ─── Toggle actions ───────────────────────────────────────────────────────────

describe("settings-store — toggle actions", () => {
  it("toggleSoundEffects flips true → false", () => {
    useSettingsStore.setState({ soundEffects: true });
    useSettingsStore.getState().toggleSoundEffects();
    expect(useSettingsStore.getState().soundEffects).toBe(false);
  });

  it("toggleSoundEffects flips false → true", () => {
    useSettingsStore.setState({ soundEffects: false });
    useSettingsStore.getState().toggleSoundEffects();
    expect(useSettingsStore.getState().soundEffects).toBe(true);
  });

  it("toggleMusic flips true → false", () => {
    useSettingsStore.setState({ music: true });
    useSettingsStore.getState().toggleMusic();
    expect(useSettingsStore.getState().music).toBe(false);
  });

  it("toggleMusic flips false → true", () => {
    useSettingsStore.setState({ music: false });
    useSettingsStore.getState().toggleMusic();
    expect(useSettingsStore.getState().music).toBe(true);
  });

  it("toggleVibration flips false → true", () => {
    useSettingsStore.setState({ vibration: false });
    useSettingsStore.getState().toggleVibration();
    expect(useSettingsStore.getState().vibration).toBe(true);
  });

  it("toggleVibration flips true → false", () => {
    useSettingsStore.setState({ vibration: true });
    useSettingsStore.getState().toggleVibration();
    expect(useSettingsStore.getState().vibration).toBe(false);
  });

  it("toggleAutoMuckLosing flips true → false", () => {
    useSettingsStore.setState({ autoMuckLosing: true });
    useSettingsStore.getState().toggleAutoMuckLosing();
    expect(useSettingsStore.getState().autoMuckLosing).toBe(false);
  });

  it("toggleShowHandStrength flips true → false", () => {
    useSettingsStore.setState({ showHandStrength: true });
    useSettingsStore.getState().toggleShowHandStrength();
    expect(useSettingsStore.getState().showHandStrength).toBe(false);
  });

  it("multiple toggles are independent", () => {
    useSettingsStore.getState().toggleSoundEffects();
    useSettingsStore.getState().toggleMusic();
    const state = useSettingsStore.getState();
    expect(state.soundEffects).toBe(false);
    expect(state.music).toBe(false);
    expect(state.vibration).toBe(false); // unchanged
  });
});

// ─── Value setters ────────────────────────────────────────────────────────────

describe("settings-store — value setters", () => {
  it("setAnimationSpeed updates to 'slow'", () => {
    useSettingsStore.getState().setAnimationSpeed("slow");
    expect(useSettingsStore.getState().animationSpeed).toBe("slow");
  });

  it("setAnimationSpeed updates to 'fast'", () => {
    useSettingsStore.getState().setAnimationSpeed("fast");
    expect(useSettingsStore.getState().animationSpeed).toBe("fast");
  });

  it("setTheme updates to 'light'", () => {
    useSettingsStore.getState().setTheme("light");
    expect(useSettingsStore.getState().theme).toBe("light");
  });

  it("setTheme updates back to 'dark'", () => {
    useSettingsStore.setState({ theme: "light" });
    useSettingsStore.getState().setTheme("dark");
    expect(useSettingsStore.getState().theme).toBe("dark");
  });

  it("setCardStyle updates to 'modern'", () => {
    useSettingsStore.getState().setCardStyle("modern");
    expect(useSettingsStore.getState().cardStyle).toBe("modern");
  });

  it("setCardStyle updates to 'minimal'", () => {
    useSettingsStore.getState().setCardStyle("minimal");
    expect(useSettingsStore.getState().cardStyle).toBe("minimal");
  });

  it("setTableColor accepts any hex string", () => {
    useSettingsStore.getState().setTableColor("#1a3c5e");
    expect(useSettingsStore.getState().tableColor).toBe("#1a3c5e");
  });

  it("setTableColor accepts another hex string", () => {
    useSettingsStore.getState().setTableColor("#8b0000");
    expect(useSettingsStore.getState().tableColor).toBe("#8b0000");
  });
});

// ─── Backward-compat boolean setters ─────────────────────────────────────────

describe("settings-store — backward-compat setSoundEffects etc.", () => {
  it("setSoundEffects sets to an explicit value", () => {
    useSettingsStore.getState().setSoundEffects(false);
    expect(useSettingsStore.getState().soundEffects).toBe(false);
    useSettingsStore.getState().setSoundEffects(true);
    expect(useSettingsStore.getState().soundEffects).toBe(true);
  });

  it("setMusic sets to an explicit value", () => {
    useSettingsStore.getState().setMusic(false);
    expect(useSettingsStore.getState().music).toBe(false);
  });

  it("setVibration sets to an explicit value", () => {
    useSettingsStore.getState().setVibration(true);
    expect(useSettingsStore.getState().vibration).toBe(true);
  });

  it("setAutoMuckLosing sets to an explicit value", () => {
    useSettingsStore.getState().setAutoMuckLosing(false);
    expect(useSettingsStore.getState().autoMuckLosing).toBe(false);
  });

  it("setShowHandStrength sets to an explicit value", () => {
    useSettingsStore.getState().setShowHandStrength(false);
    expect(useSettingsStore.getState().showHandStrength).toBe(false);
  });
});

// ─── loadSettings ─────────────────────────────────────────────────────────────

describe("settings-store — loadSettings()", () => {
  it("calls AsyncStorage.getItem with the storage key", async () => {
    await useSettingsStore.getState().loadSettings();
    expect(jest.mocked(AsyncStorage.getItem)).toHaveBeenCalledWith(
      "poker_settings_v1"
    );
  });

  it("returns a resolved promise", async () => {
    await expect(useSettingsStore.getState().loadSettings()).resolves.toBeUndefined();
  });

  it("merges persisted values on top of defaults", async () => {
    const persisted = { soundEffects: false, theme: "light", tableColor: "#ff0000" };
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify(persisted));
    await useSettingsStore.getState().loadSettings();
    const state = useSettingsStore.getState();
    expect(state.soundEffects).toBe(false);
    expect(state.theme).toBe("light");
    expect(state.tableColor).toBe("#ff0000");
    // Fields not in persisted blob remain at defaults.
    expect(state.music).toBe(true);
    expect(state.animationSpeed).toBe("normal");
  });

  it("stays on defaults when AsyncStorage returns null", async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);
    await useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().soundEffects).toBe(true);
  });

  it("stays on defaults when AsyncStorage throws", async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("disk error"));
    await useSettingsStore.getState().loadSettings();
    expect(useSettingsStore.getState().soundEffects).toBe(true);
  });
});

// ─── resetToDefaults ──────────────────────────────────────────────────────────

describe("settings-store — resetToDefaults()", () => {
  it("resets all preferences to SETTINGS_DEFAULTS", () => {
    // Dirty the store.
    useSettingsStore.setState({
      soundEffects: false,
      music: false,
      vibration: true,
      autoMuckLosing: false,
      showHandStrength: false,
      animationSpeed: "fast",
      theme: "light",
      cardStyle: "modern",
      tableColor: "#ff0000",
    });

    useSettingsStore.getState().resetToDefaults();

    const state = useSettingsStore.getState();
    expect(state.soundEffects).toBe(SETTINGS_DEFAULTS.soundEffects);
    expect(state.music).toBe(SETTINGS_DEFAULTS.music);
    expect(state.vibration).toBe(SETTINGS_DEFAULTS.vibration);
    expect(state.autoMuckLosing).toBe(SETTINGS_DEFAULTS.autoMuckLosing);
    expect(state.showHandStrength).toBe(SETTINGS_DEFAULTS.showHandStrength);
    expect(state.animationSpeed).toBe(SETTINGS_DEFAULTS.animationSpeed);
    expect(state.theme).toBe(SETTINGS_DEFAULTS.theme);
    expect(state.cardStyle).toBe(SETTINGS_DEFAULTS.cardStyle);
    expect(state.tableColor).toBe(SETTINGS_DEFAULTS.tableColor);
  });

  it("calls AsyncStorage.removeItem to wipe the persisted entry", () => {
    useSettingsStore.getState().resetToDefaults();
    expect(jest.mocked(AsyncStorage.removeItem)).toHaveBeenCalledWith(
      "poker_settings_v1"
    );
  });
});

// ─── Type checks (compile-time, verified by value assertions) ─────────────────

describe("settings-store — TypeScript type correctness", () => {
  it("animationSpeed only accepts valid union values", () => {
    // These are the only three legal values — TypeScript enforces this at
    // compile time; this test confirms the accepted values at runtime.
    const speeds = ["slow", "normal", "fast"] as const;
    for (const speed of speeds) {
      useSettingsStore.getState().setAnimationSpeed(speed);
      expect(useSettingsStore.getState().animationSpeed).toBe(speed);
    }
  });

  it("theme only accepts 'dark' | 'light'", () => {
    for (const theme of ["dark", "light"] as const) {
      useSettingsStore.getState().setTheme(theme);
      expect(useSettingsStore.getState().theme).toBe(theme);
    }
  });

  it("cardStyle only accepts 'classic' | 'modern' | 'minimal'", () => {
    for (const style of ["classic", "modern", "minimal"] as const) {
      useSettingsStore.getState().setCardStyle(style);
      expect(useSettingsStore.getState().cardStyle).toBe(style);
    }
  });

  it("tableColor accepts any string", () => {
    const colors = ["#0a5f38", "#ff0000", "blue", "rgb(10,95,56)"];
    for (const color of colors) {
      useSettingsStore.getState().setTableColor(color);
      expect(useSettingsStore.getState().tableColor).toBe(color);
    }
  });
});
