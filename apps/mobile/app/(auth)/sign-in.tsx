import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { router } from "expo-router";
import * as secureStorage from "../../lib/secure-storage";
import { useAuth } from "../../context/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

export const BIOMETRIC_EMAIL_KEY = "poker_biometric_email";
export const BIOMETRIC_PASSWORD_KEY = "poker_biometric_password";

// ─── Types ────────────────────────────────────────────────────────────────────

type BiometricType = "face" | "fingerprint" | "generic";

// ─── SignInScreen ─────────────────────────────────────────────────────────────

export default function SignInScreen() {
  const { signIn } = useAuth();

  // Form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Submit state
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasStoredCreds, setHasStoredCreds] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>("generic");
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  // Check biometric capability and stored credentials on mount.
  useEffect(() => {
    async function checkBiometrics() {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return;

      setBiometricAvailable(true);

      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (
        types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ) {
        setBiometricType("face");
      } else if (
        types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
      ) {
        setBiometricType("fingerprint");
      }

      const stored = await secureStorage.getItem(BIOMETRIC_EMAIL_KEY);
      setHasStoredCreds(!!stored);
    }
    checkBiometrics();
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSignIn = async () => {
    if (!email || !password) {
      setSubmitError("Please fill in all fields.");
      return;
    }
    setSubmitError(null);
    setBiometricError(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);

    if (error) {
      setSubmitError("Invalid email or password");
      return;
    }

    if (rememberMe) {
      await secureStorage.setItem(BIOMETRIC_EMAIL_KEY, email.trim());
      await secureStorage.setItem(BIOMETRIC_PASSWORD_KEY, password);
      setHasStoredCreds(true);
    }
  };

  const handleBiometric = async () => {
    setBiometricError(null);
    setBiometricLoading(true);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Sign in to Poker Stud",
        cancelLabel: "Use password",
        disableDeviceFallback: true,
      });

      if (result.success) {
        const storedEmail = await secureStorage.getItem(BIOMETRIC_EMAIL_KEY);
        const storedPassword = await secureStorage.getItem(BIOMETRIC_PASSWORD_KEY);
        if (storedEmail && storedPassword) {
          const { error } = await signIn(storedEmail, storedPassword);
          if (error) {
            setBiometricError(
              "Biometric sign-in failed. Please use your password."
            );
          }
        }
      } else if (
        result.error !== "user_cancel" &&
        result.error !== "system_cancel"
      ) {
        setBiometricError("Biometric authentication failed. Please try again.");
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  const biometricLabel =
    biometricType === "face"
      ? "Sign in with Face ID"
      : biometricType === "fingerprint"
        ? "Sign in with Touch ID"
        : "Sign in with Biometrics";

  const biometricIcon = biometricType === "face" ? "🔒" : "👆";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          testID="btn-back"
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* ── Email ───────────────────────────────────────────── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor="#475569"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              testID="input-email"
            />
          </View>

          {/* ── Password ────────────────────────────────────────── */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputFlex}
                placeholder="••••••••"
                placeholderTextColor="#475569"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
                testID="input-password"
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                testID="toggle-password"
              >
                <Text style={styles.eyeIcon}>
                  {showPassword ? "🙈" : "👁"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* ── Remember me / Forgot password row ───────────────── */}
          <View style={styles.optionsRow}>
            <Pressable
              style={styles.rememberRow}
              onPress={() => setRememberMe((v) => !v)}
              testID="toggle-remember"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberMe }}
            >
              <View
                style={[styles.checkbox, rememberMe && styles.checkboxOn]}
                testID="checkbox-remember"
              >
                {rememberMe ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : null}
              </View>
              <Text style={styles.rememberLabel}>Remember me</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/(auth)/forgot-password")}
              testID="link-forgot"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          </View>

          {/* ── Submit error ─────────────────────────────────────── */}
          {submitError ? (
            <Text style={styles.errorBanner} testID="submit-error">
              {submitError}
            </Text>
          ) : null}

          {/* ── Sign In button ───────────────────────────────────── */}
          <Pressable
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSignIn}
            disabled={loading}
            testID="btn-submit"
          >
            {loading ? (
              <ActivityIndicator color="#1a1a2e" testID="submit-spinner" />
            ) : (
              <Text style={styles.submitBtnText}>Sign In</Text>
            )}
          </Pressable>

          {/* ── Biometric button ─────────────────────────────────── */}
          {biometricAvailable && hasStoredCreds ? (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={[
                  styles.biometricBtn,
                  biometricLoading && styles.submitBtnDisabled,
                ]}
                onPress={handleBiometric}
                disabled={biometricLoading}
                testID="btn-biometric"
              >
                {biometricLoading ? (
                  <ActivityIndicator
                    color="#ffd700"
                    testID="biometric-spinner"
                  />
                ) : (
                  <Text style={styles.biometricText}>
                    {biometricIcon} {biometricLabel}
                  </Text>
                )}
              </Pressable>

              {biometricError ? (
                <Text style={styles.errorBanner} testID="biometric-error">
                  {biometricError}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don&apos;t have an account? </Text>
          <Pressable
            onPress={() => router.replace("/(auth)/sign-up")}
            testID="link-signup"
          >
            <Text style={styles.footerLink}>Sign Up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#1a1a2e" },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },

  back: { marginBottom: 32 },
  backText: { color: "#94a3b8", fontSize: 15 },

  header: { marginBottom: 36, gap: 6 },
  title: { fontSize: 30, fontWeight: "800", color: "#ffd700" },
  subtitle: { fontSize: 15, color: "#94a3b8" },

  form: { gap: 18 },
  fieldGroup: { gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: "#16213e",
    borderWidth: 1,
    borderColor: "#2d3a56",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#e2e8f0",
  },
  inputFlex: {
    flex: 1,
    backgroundColor: "#16213e",
    borderWidth: 1,
    borderColor: "#2d3a56",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#e2e8f0",
  },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  eyeBtn: { padding: 10 },
  eyeIcon: { fontSize: 18 },

  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    backgroundColor: "#16213e",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#ffd700", borderColor: "#ffd700" },
  checkmark: { fontSize: 12, color: "#1a1a2e", fontWeight: "800" },
  rememberLabel: { fontSize: 13, color: "#94a3b8" },
  forgotText: { color: "#ffd700", fontSize: 13 },

  errorBanner: {
    color: "#f87171",
    fontSize: 13,
    textAlign: "center",
    backgroundColor: "#1e1013",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  submitBtn: {
    backgroundColor: "#ffd700",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: "#0a3d14", fontSize: 16, fontWeight: "800" },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#2d3a56" },
  dividerText: { color: "#475569", fontSize: 12 },

  biometricBtn: {
    borderWidth: 1.5,
    borderColor: "#ffd700",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  biometricText: { color: "#ffd700", fontSize: 15, fontWeight: "600" },

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 36,
  },
  footerText: { color: "#94a3b8", fontSize: 14 },
  footerLink: { color: "#ffd700", fontSize: 14, fontWeight: "600" },
});
