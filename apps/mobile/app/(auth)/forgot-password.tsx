import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../context/AuthContext";

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await resetPassword(email.trim());
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.sentIcon}>✅</Text>
        <Text style={styles.sentTitle}>Reset link sent</Text>
        <Text style={styles.sentBody}>
          Check your inbox at{"\n"}
          <Text style={styles.emailHighlight}>{email}</Text>
          {"\n"}and follow the instructions to reset your password.
        </Text>
        <Pressable
          style={styles.backToSignIn}
          onPress={() => router.replace("/(auth)/sign-in")}
        >
          <Text style={styles.backToSignInText}>Back to Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            Enter the email linked to your account and we'll send you a reset link.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#475569"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="done"
              onSubmitEditing={handleReset}
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleReset}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#1a1a2e" />
            ) : (
              <Text style={styles.submitButtonText}>Send Reset Link</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#1a1a2e" },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  sentIcon: { fontSize: 56 },
  sentTitle: { fontSize: 26, fontWeight: "800", color: "#ffd700", textAlign: "center" },
  sentBody: { fontSize: 15, color: "#94a3b8", textAlign: "center", lineHeight: 22 },
  emailHighlight: { color: "#e2e8f0", fontWeight: "600" },
  backToSignIn: {
    marginTop: 8,
    backgroundColor: "#ffd700",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  backToSignInText: { color: "#1a1a2e", fontSize: 15, fontWeight: "700" },
  backButton: { marginBottom: 32 },
  backText: { color: "#94a3b8", fontSize: 15 },
  header: { marginBottom: 36, gap: 10 },
  title: { fontSize: 30, fontWeight: "800", color: "#ffd700" },
  subtitle: { fontSize: 15, color: "#94a3b8", lineHeight: 22 },
  form: { gap: 18 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 },
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
  errorText: {
    color: "#f87171",
    fontSize: 13,
    textAlign: "center",
    backgroundColor: "#1e1013",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  submitButton: {
    backgroundColor: "#ffd700",
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: "#1a1a2e", fontSize: 16, fontWeight: "700" },
});
