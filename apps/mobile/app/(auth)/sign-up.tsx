import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { Controller, useForm } from "react-hook-form";
import { router } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { checkUsernameAvailable } from "../../lib/usernameCheck";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormData = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type UsernameStatus = "idle" | "checking" | "available" | "taken";

// ─── Constants ────────────────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

// ─── Password strength ────────────────────────────────────────────────────────

function passwordStrength(pw: string): number {
  return (
    (pw.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(pw) ? 1 : 0)
  );
}

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_COLORS = ["", "#ef4444", "#f97316", "#eab308", "#22c55e"] as const;

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordStrength(password);
  const color = STRENGTH_COLORS[score];
  const label = STRENGTH_LABELS[score];

  return (
    <View style={meter.row} testID="password-strength">
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[meter.bar, { backgroundColor: i < score ? color : "#2d3a56" }]}
        />
      ))}
      <Text style={[meter.label, { color }]}>{label}</Text>
    </View>
  );
}

const meter = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  bar: { flex: 1, height: 3, borderRadius: 2 },
  label: { fontSize: 11, fontWeight: "600", width: 42, textAlign: "right" },
});

// ─── Field wrapper ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}

function Field({ label, error, children, hint }: FieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

// ─── Success view ─────────────────────────────────────────────────────────────

function SuccessView({ email }: { email: string }) {
  return (
    <View style={styles.successContainer} testID="success-view">
      <Text style={styles.successIcon}>✉️</Text>
      <Text style={styles.successTitle}>Check your email</Text>
      <Text style={styles.successBody}>
        We sent a confirmation link to{"\n"}
        <Text style={styles.emailHighlight}>{email}</Text>
      </Text>
      <Pressable
        style={styles.submitBtn}
        onPress={() => router.replace("/(auth)/sign-in")}
        testID="go-signin"
      >
        <Text style={styles.submitBtnText}>Go to Sign In</Text>
      </Pressable>
    </View>
  );
}

// ─── SignUpScreen ─────────────────────────────────────────────────────────────

export default function SignUpScreen() {
  const { signUp } = useAuth();

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<FormData>({
    mode: "onChange",
    defaultValues: { username: "", email: "", password: "", confirmPassword: "" },
  });

  const passwordValue = watch("password");
  const emailValue = watch("email");

  // Clean up debounce timer on unmount.
  useEffect(
    () => () => { if (debounceRef.current) clearTimeout(debounceRef.current); },
    []
  );

  // Debounced availability check — only fires when format is valid.
  const handleUsernameChange = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!USERNAME_RE.test(value)) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    debounceRef.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(value);
      setUsernameStatus(available ? "available" : "taken");
    }, 500);
  }, []);

  const onSubmit = async (data: FormData) => {
    setSubmitError(null);
    const { error } = await signUp(data.email.trim(), data.password, data.username.trim());
    if (error) {
      setSubmitError(error.message);
    } else {
      setSuccess(true);
    }
  };

  const submitDisabled =
    !isValid || isSubmitting || usernameStatus !== "available";

  if (success) return <SuccessView email={emailValue} />;

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
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Join the table</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* ── Username ─────────────────────────────────────────────── */}
          <Controller
            control={control}
            name="username"
            rules={{
              required: "Username is required",
              minLength: { value: 3, message: "At least 3 characters" },
              maxLength: { value: 20, message: "Maximum 20 characters" },
              pattern: {
                value: /^[a-zA-Z0-9_]+$/,
                message: "Letters, numbers and underscores only",
              },
            }}
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <Field
                label="Username"
                error={
                  error?.message ??
                  (usernameStatus === "taken" ? "Username already taken" : undefined)
                }
                hint={
                  <UsernameHint status={usernameStatus} />
                }
              >
                <TextInput
                  style={[
                    styles.input,
                    error || usernameStatus === "taken" ? styles.inputError : null,
                    usernameStatus === "available" ? styles.inputSuccess : null,
                  ]}
                  placeholder="Choose a username"
                  placeholderTextColor="#475569"
                  value={value}
                  onChangeText={(text) => {
                    onChange(text);
                    handleUsernameChange(text);
                  }}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  testID="input-username"
                />
              </Field>
            )}
          />

          {/* ── Email ────────────────────────────────────────────────── */}
          <Controller
            control={control}
            name="email"
            rules={{
              required: "Email is required",
              pattern: { value: EMAIL_RE, message: "Enter a valid email address" },
            }}
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <Field label="Email" error={error?.message}>
                <TextInput
                  style={[styles.input, error ? styles.inputError : null]}
                  placeholder="your@email.com"
                  placeholderTextColor="#475569"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="next"
                  testID="input-email"
                />
              </Field>
            )}
          />

          {/* ── Password ─────────────────────────────────────────────── */}
          <Controller
            control={control}
            name="password"
            rules={{
              required: "Password is required",
              minLength: { value: 8, message: "Minimum 8 characters" },
              validate: {
                hasUppercase: (v) =>
                  /[A-Z]/.test(v) || "At least one uppercase letter",
                hasNumber: (v) =>
                  /[0-9]/.test(v) || "At least one number",
              },
            }}
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <Field
                label="Password"
                error={error?.message}
                hint={<PasswordStrengthMeter password={value} />}
              >
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.inputFlex, error ? styles.inputError : null]}
                    placeholder="Create password"
                    placeholderTextColor="#475569"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    returnKeyType="next"
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
              </Field>
            )}
          />

          {/* ── Confirm Password ─────────────────────────────────────── */}
          <Controller
            control={control}
            name="confirmPassword"
            rules={{
              required: "Please confirm your password",
              validate: (v) =>
                v === passwordValue || "Passwords do not match",
            }}
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <Field label="Confirm Password" error={error?.message}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.inputFlex, error ? styles.inputError : null]}
                    placeholder="Repeat your password"
                    placeholderTextColor="#475569"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry={!showConfirm}
                    autoComplete="new-password"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit(onSubmit)}
                    testID="input-confirm"
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowConfirm((v) => !v)}
                    testID="toggle-confirm"
                  >
                    <Text style={styles.eyeIcon}>
                      {showConfirm ? "🙈" : "👁"}
                    </Text>
                  </Pressable>
                </View>
              </Field>
            )}
          />

          {/* ── Submit error ─────────────────────────────────────────── */}
          {submitError ? (
            <Text style={styles.submitError} testID="submit-error">
              {submitError}
            </Text>
          ) : null}

          {/* ── Submit button ─────────────────────────────────────────── */}
          <Pressable
            style={[styles.submitBtn, submitDisabled && styles.submitBtnDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={submitDisabled}
            testID="btn-submit"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#1a1a2e" testID="submit-spinner" />
            ) : (
              <Text style={styles.submitBtnText}>Create Account</Text>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Pressable
            onPress={() => router.replace("/(auth)/sign-in")}
            testID="link-signin"
          >
            <Text style={styles.footerLink}>Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Username availability hint ───────────────────────────────────────────────

function UsernameHint({ status }: { status: UsernameStatus }) {
  if (status === "idle") return null;
  const map: Record<Exclude<UsernameStatus, "idle">, [string, string]> = {
    checking: ["#94a3b8", "Checking…"],
    available: ["#22c55e", "✓ Available"],
    taken: ["#ef4444", "✗ Already taken"],
  };
  const [color, text] = map[status];
  return (
    <Text style={[styles.usernameHint, { color }]} testID={`username-status-${status}`}>
      {text}
    </Text>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#1a1a2e" },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },

  // Header
  back: { marginBottom: 32 },
  backText: { color: "#94a3b8", fontSize: 15 },
  header: { marginBottom: 32, gap: 6 },
  title: { fontSize: 30, fontWeight: "800", color: "#ffd700" },
  subtitle: { fontSize: 15, color: "#94a3b8" },

  // Form
  form: { gap: 20 },
  fieldGroup: { gap: 6 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  // Inputs
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
  inputError: { borderColor: "#ef4444" },
  inputSuccess: { borderColor: "#22c55e" },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  eyeBtn: { padding: 10 },
  eyeIcon: { fontSize: 18 },

  // Field error
  fieldError: { fontSize: 12, color: "#f87171", marginTop: 2 },

  // Username hint
  usernameHint: { fontSize: 12, fontWeight: "500", marginTop: 3 },

  // Submit error
  submitError: {
    color: "#f87171",
    fontSize: 13,
    backgroundColor: "#1e1013",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    textAlign: "center",
  },

  // Submit button
  submitBtn: {
    backgroundColor: "#ffd700",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: "#0a3d14", fontSize: 16, fontWeight: "800" },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 36,
  },
  footerText: { color: "#94a3b8", fontSize: 14 },
  footerLink: { color: "#ffd700", fontSize: 14, fontWeight: "600" },

  // Success
  successContainer: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  successIcon: { fontSize: 56 },
  successTitle: { fontSize: 26, fontWeight: "800", color: "#ffd700", textAlign: "center" },
  successBody: { fontSize: 15, color: "#94a3b8", textAlign: "center", lineHeight: 22 },
  emailHighlight: { color: "#e2e8f0", fontWeight: "600" },
});
