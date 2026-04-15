/**
 * Root layout — the single component that wraps the entire Expo Router tree.
 *
 * Responsibilities
 * ────────────────
 * 1. Call useAuthStore.initialize() once on mount so the Zustand store loads
 *    the persisted Supabase session and subscribes to auth-state changes.
 * 2. Show a full-screen splash/loading indicator while the initial session
 *    check is in progress — this prevents a flash of the wrong navigator.
 * 3. Once loading is resolved, render <Slot /> which lets Expo Router mount
 *    the matched child route (index → (auth) or (app) group).
 *
 * AuthContext is still mounted here because it contains the Expo Router
 * redirect logic that requires useRouter / useSegments hooks.  The store and
 * the context subscribe to Supabase's onAuthStateChange independently.
 */

import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../context/AuthContext";
import { useAuthStore } from "../store/auth-store";

// ─── Splash / loading screen ──────────────────────────────────────────────────

function SplashScreen() {
  return (
    <View style={styles.splash} testID="splash-screen">
      <ActivityIndicator
        color="#ffd700"
        size="large"
        testID="splash-indicator"
      />
    </View>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  const { isLoading, initialize } = useAuthStore();

  // Initialize the auth store once — loads persisted session + starts listener.
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      <StatusBar style="light" />
      <AuthProvider>
        {/* Slot must always be rendered so Expo Router's navigator is mounted.
            The splash screen overlays it while the initial session loads. */}
        <Slot />
        {isLoading && <SplashScreen />}
      </AuthProvider>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
});
