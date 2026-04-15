import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { checkUsernameAvailable } from "../lib/usernameCheck";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditUsernameModalProps {
  visible: boolean;
  currentUsername: string;
  onClose: () => void;
  onSave: (newUsername: string) => Promise<void>;
}

type ValidationStatus =
  | "idle"
  | "invalid-length"
  | "invalid-chars"
  | "checking"
  | "available"
  | "taken";

type SaveStatus = "idle" | "saving" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_LENGTH = 20;
const MIN_LENGTH = 3;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const DEBOUNCE_MS = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validate(value: string): "invalid-length" | "invalid-chars" | "ok" {
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) {
    return "invalid-length";
  }
  if (!USERNAME_RE.test(value)) {
    return "invalid-chars";
  }
  return "ok";
}

// ─── Status indicator ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ValidationStatus,
  { text: string | null; color: string; icon: string | null; showSpinner: boolean }
> = {
  idle:           { text: null,                                   color: "#64748b", icon: null,  showSpinner: false },
  "invalid-length": { text: `Must be ${MIN_LENGTH}–${MAX_LENGTH} characters`, color: "#f87171", icon: "✗", showSpinner: false },
  "invalid-chars":  { text: "Only letters, numbers, and underscore", color: "#f87171", icon: "✗", showSpinner: false },
  checking:       { text: "Checking availability…",              color: "#94a3b8", icon: null,  showSpinner: true  },
  available:      { text: "Username available",                  color: "#22c55e", icon: "✓",  showSpinner: false },
  taken:          { text: "Username already taken",              color: "#f87171", icon: "✗",  showSpinner: false },
};

function StatusIndicator({ status }: { status: ValidationStatus }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg.text && !cfg.showSpinner) return null;

  return (
    <View style={styles.statusRow} testID="validation-status">
      {cfg.showSpinner ? (
        <ActivityIndicator size="small" color={cfg.color} testID="checking-spinner" />
      ) : cfg.icon ? (
        <Text style={[styles.statusIcon, { color: cfg.color }]}>{cfg.icon}</Text>
      ) : null}
      <Text style={[styles.statusText, { color: cfg.color }]} testID="validation-message">
        {cfg.text}
      </Text>
    </View>
  );
}

// ─── EditUsernameModal ────────────────────────────────────────────────────────

export function EditUsernameModal({
  visible,
  currentUsername,
  onClose,
  onSave,
}: EditUsernameModalProps) {
  const [value, setValue] = useState(currentUsername);
  const [status, setStatus] = useState<ValidationStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<TextInput>(null);

  // Backdrop fade animation.
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Sheet slide-up animation.
  const sheetTranslateY = useRef(new Animated.Value(80)).current;

  // ── Reset state when modal opens ──────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;

    setValue(currentUsername);
    setStatus("idle");
    setSaveStatus("idle");
    setSaveError(null);

    // Animate in.
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
      }),
    ]).start(() => {
      // Auto-focus after animation.
      inputRef.current?.focus();
    });
  }, [visible, currentUsername, backdropOpacity, sheetTranslateY]);

  // ── Animate out helper ────────────────────────────────────────────────────

  const animateOut = useCallback(
    (callback: () => void) => {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 80,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(callback);
    },
    [backdropOpacity, sheetTranslateY]
  );

  const handleClose = useCallback(() => {
    clearTimeout(debounceRef.current);
    animateOut(onClose);
  }, [animateOut, onClose]);

  // ── Real-time validation + debounced availability check ───────────────────

  const handleChange = useCallback(
    (text: string) => {
      setValue(text);
      setSaveError(null);
      clearTimeout(debounceRef.current);

      // Same as current → idle
      if (text === currentUsername) {
        setStatus("idle");
        return;
      }

      const result = validate(text);
      if (result !== "ok") {
        setStatus(result);
        return;
      }

      // Valid format — debounce the network check.
      setStatus("checking");
      debounceRef.current = setTimeout(async () => {
        const available = await checkUsernameAvailable(text);
        setStatus(available ? "available" : "taken");
      }, DEBOUNCE_MS);
    },
    [currentUsername]
  );

  // ── Save ──────────────────────────────────────────────────────────────────

  const canSave =
    saveStatus !== "saving" &&
    value !== currentUsername &&
    (status === "available" || (validate(value) === "ok" && status !== "taken" && status !== "checking"));

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await onSave(value.trim());
      animateOut(onClose);
    } catch (e: unknown) {
      setSaveStatus("error");
      setSaveError(e instanceof Error ? e.message : "Failed to update username");
    }
  }, [canSave, value, onSave, animateOut, onClose]);

  // ── Char count colour ─────────────────────────────────────────────────────

  const charCount = value.length;
  const charCountColor =
    charCount < MIN_LENGTH || charCount > MAX_LENGTH ? "#f87171" : "#64748b";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      testID="edit-username-modal"
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Backdrop */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          testID="modal-backdrop"
        >
          <Pressable style={styles.flex} onPress={handleClose} testID="backdrop-press" />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
          testID="modal-sheet"
        >
          {/* Title */}
          <View style={styles.titleRow}>
            <Text style={styles.title}>Change Username</Text>
            <Pressable
              style={styles.closeBtn}
              onPress={handleClose}
              testID="btn-close-modal"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Input + char count */}
          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                status === "taken" && styles.inputError,
                status === "available" && styles.inputSuccess,
              ]}
              value={value}
              onChangeText={handleChange}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={MAX_LENGTH}
              returnKeyType="done"
              onSubmitEditing={handleSave}
              testID="input-username"
              placeholder="Enter username"
              placeholderTextColor="#4a5568"
            />
            <Text
              style={[styles.charCount, { color: charCountColor }]}
              testID="char-count"
            >
              {charCount}/{MAX_LENGTH}
            </Text>
          </View>

          {/* Validation status */}
          <StatusIndicator status={status} />

          {/* Save error */}
          {saveStatus === "error" && saveError && (
            <Text style={styles.saveError} testID="save-error">
              {saveError}
            </Text>
          )}

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.cancelBtn}
              onPress={handleClose}
              testID="btn-cancel"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
              accessibilityState={{ disabled: !canSave }}
              testID="btn-save"
            >
              {saveStatus === "saving" ? (
                <ActivityIndicator
                  size="small"
                  color="#0a1628"
                  testID="save-spinner"
                />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // Backdrop
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },

  // Sheet
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#161b22",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "#21262d",
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    gap: 16,
  },

  // Title
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#e2e8f0" },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#21262d",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { color: "#94a3b8", fontSize: 14 },

  // Input
  inputWrapper: { position: "relative" },
  input: {
    backgroundColor: "#0d1117",
    borderWidth: 1.5,
    borderColor: "#21262d",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 56,
    color: "#e2e8f0",
    fontSize: 16,
  },
  inputError: { borderColor: "#f87171" },
  inputSuccess: { borderColor: "#22c55e" },
  charCount: {
    position: "absolute",
    right: 14,
    top: "50%",
    marginTop: -8,
    fontSize: 11,
    fontWeight: "600",
  },

  // Validation status
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 20,
  },
  statusIcon: { fontSize: 13, fontWeight: "700" },
  statusText: { fontSize: 13 },

  // Save error
  saveError: {
    fontSize: 13,
    color: "#f87171",
    backgroundColor: "#450a0a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#7f1d1d",
  },

  // Buttons
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#21262d",
    alignItems: "center",
  },
  cancelBtnText: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#ffd700",
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: "#0a1628", fontSize: 15, fontWeight: "700" },
});
