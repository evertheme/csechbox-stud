import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useAuth } from "../../context/AuthContext";

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  toastKey: number;
}

function Toast({ message, toastKey }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [toastKey, message, opacity]);

  if (!message) return null;

  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
      <Text style={styles.toastText}>⚠ {message}</Text>
    </Animated.View>
  );
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const { signInAnonymously } = useAuth();
  const [guestLoading, setGuestLoading] = useState(false);
  const [toast, setToast] = useState({ message: "", key: 0 });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(48)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.parallel([
      // Fade the whole content in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      // Slide buttons up from below
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        delay: 250,
        useNativeDriver: true,
      }),
      // Pop the logo in with a spring
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, logoScale]);

  const showToast = (message: string) =>
    setToast((t) => ({ message, key: t.key + 1 }));

  const handleGuestAuth = async () => {
    setGuestLoading(true);
    const { error } = await signInAnonymously();
    setGuestLoading(false);
    if (error) {
      showToast(error.message ?? "Failed to continue as guest.");
    }
    // On success: AuthContext's onAuthStateChange sets the session and
    // the redirect effect navigates to /(app)/lobby automatically.
  };

  return (
    <LinearGradient
      colors={["#0a3d14", "#1b6b2a", "#0e4019", "#093310"]}
      locations={[0, 0.4, 0.75, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.gradient}
    >
      {/* Subtle vignette overlay */}
      <View style={styles.vignette} />

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <Animated.Text
            style={[styles.logo, { transform: [{ scale: logoScale }] }]}
            testID="logo"
          >
            ♠
          </Animated.Text>

          <Text style={styles.title} testID="title">
            Poker Stud
          </Text>
          <Text style={styles.tagline} testID="tagline">
            Play Classic Stud Poker Online
          </Text>

          {/* Suit row decoration */}
          <View style={styles.suitRow}>
            {(["♠", "♥", "♦", "♣"] as const).map((s) => (
              <Text
                key={s}
                style={[
                  styles.suitDecor,
                  (s === "♥" || s === "♦") && styles.suitRed,
                ]}
              >
                {s}
              </Text>
            ))}
          </View>
        </View>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <Animated.View
          style={[styles.actions, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* Primary — Sign Up */}
          <Pressable
            style={({ pressed }) => [
              styles.btnBase,
              styles.btnPrimary,
              pressed && styles.btnPrimaryPressed,
            ]}
            onPress={() => router.push("/(auth)/sign-up")}
            testID="btn-signup"
          >
            <Text style={styles.btnTextPrimary}>Sign Up</Text>
          </Pressable>

          {/* Secondary — Sign In */}
          <Pressable
            style={({ pressed }) => [
              styles.btnBase,
              styles.btnSecondary,
              pressed && styles.btnSecondaryPressed,
            ]}
            onPress={() => router.push("/(auth)/sign-in")}
            testID="btn-signin"
          >
            <Text style={styles.btnTextSecondary}>Sign In</Text>
          </Pressable>

          {/* Ghost — Continue as Guest */}
          <Pressable
            style={[styles.btnGhost, guestLoading && styles.btnDisabled]}
            onPress={handleGuestAuth}
            disabled={guestLoading}
            testID="btn-guest"
          >
            {guestLoading ? (
              <ActivityIndicator
                size="small"
                color="#94a3b8"
                testID="guest-spinner"
              />
            ) : (
              <Text style={styles.btnTextGhost}>Continue as Guest</Text>
            )}
          </Pressable>
        </Animated.View>
      </Animated.View>

      <Toast message={toast.message} toastKey={toast.key} />
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 80,
    paddingBottom: 56,
    paddingHorizontal: 28,
  },

  // ── Hero
  hero: {
    alignItems: "center",
    gap: 10,
    marginTop: 24,
  },
  logo: {
    fontSize: 96,
    color: "#ffd700",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 2, height: 4 },
    textShadowRadius: 8,
  },
  title: {
    fontSize: 38,
    fontWeight: "800",
    color: "#ffd700",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
  },
  tagline: {
    fontSize: 15,
    color: "#c8e6c9",
    textAlign: "center",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  suitRow: {
    flexDirection: "row",
    gap: 18,
    marginTop: 20,
    opacity: 0.7,
  },
  suitDecor: {
    fontSize: 22,
    color: "#ffffff",
  },
  suitRed: {
    color: "#ef9a9a",
  },

  // ── Buttons
  actions: {
    width: "100%",
    gap: 14,
    alignItems: "center",
  },
  btnBase: {
    width: "100%",
    paddingVertical: 17,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  btnPrimary: {
    backgroundColor: "#ffd700",
  },
  btnPrimaryPressed: {
    backgroundColor: "#e6c200",
    transform: [{ scale: 0.98 }],
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1.5,
    borderColor: "#ffd700",
  },
  btnSecondaryPressed: {
    backgroundColor: "rgba(255,215,0,0.15)",
    transform: [{ scale: 0.98 }],
  },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnTextPrimary: {
    color: "#0a3d14",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  btnTextSecondary: {
    color: "#ffd700",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  btnTextGhost: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "500",
  },

  // ── Toast
  toast: {
    position: "absolute",
    bottom: 48,
    left: 24,
    right: 24,
    backgroundColor: "rgba(30,16,20,0.95)",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderLeftWidth: 3,
    borderLeftColor: "#ef4444",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: "#fca5a5",
    fontSize: 14,
    lineHeight: 20,
  },
});
