import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useState } from "react";
import { router, Stack } from "expo-router";
import { useAuthStore } from "../../store/auth-store";
import {
  useSettingsStore,
  type AnimationSpeed,
  type AppTheme,
} from "../../store/settings-store";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3001";
const APP_VERSION = "1.0.0";

// ─── Row types ────────────────────────────────────────────────────────────────

type RowBase = {
  key: string;
  icon: string;
  label: string;
};

type ToggleRow = RowBase & {
  type: "toggle";
  value: boolean;
  onToggle: (v: boolean) => void;
};

type NavRow = RowBase & {
  type: "nav";
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
};

type InfoRow = RowBase & {
  type: "info";
  value: string;
};

type SettingRow = ToggleRow | NavRow | InfoRow;

type Section = {
  title: string;
  rows: SettingRow[];
};

// ─── Delete account modal ─────────────────────────────────────────────────────

function DeleteAccountModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const handleConfirm = async () => {
    if (!password.trim()) {
      setError("Please enter your password to confirm.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(password.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete account.");
      setLoading(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject} testID="delete-modal">
      <Pressable style={styles.modalBackdrop} onPress={onCancel} />
      <View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Delete Account</Text>
        <Text style={styles.modalBody}>
          This is irreversible. All your data, chips, and game history will be
          permanently deleted.
        </Text>
        <Text style={styles.modalBody}>
          Enter your password to confirm:
        </Text>
        <TextInput
          style={styles.modalInput}
          placeholder="Password"
          placeholderTextColor="#4a5568"
          secureTextEntry
          value={password}
          onChangeText={(t) => { setPassword(t); setError(null); }}
          testID="input-delete-password"
          autoFocus
        />
        {error && (
          <Text style={styles.modalError} testID="delete-error">{error}</Text>
        )}
        <View style={styles.modalButtons}>
          <Pressable
            style={styles.modalCancelBtn}
            onPress={onCancel}
            testID="btn-delete-cancel"
          >
            <Text style={styles.modalCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.modalConfirmBtn, loading && { opacity: 0.5 }]}
            onPress={() => void handleConfirm()}
            disabled={loading}
            testID="btn-delete-confirm"
          >
            <Text style={styles.modalConfirmText}>
              {loading ? "Deleting…" : "Delete Account"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Row renderers ────────────────────────────────────────────────────────────

function ToggleItem({ row }: { row: ToggleRow }) {
  return (
    <View style={styles.row} testID={`row-${row.key}`}>
      <Text style={styles.rowIcon}>{row.icon}</Text>
      <Text style={styles.rowLabel}>{row.label}</Text>
      <Switch
        value={row.value}
        onValueChange={row.onToggle}
        trackColor={{ false: "#21262d", true: "#166534" }}
        thumbColor={row.value ? "#22c55e" : "#64748b"}
        testID={`toggle-${row.key}`}
      />
    </View>
  );
}

function NavItem({ row }: { row: NavRow }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={row.onPress}
      testID={`row-${row.key}`}
    >
      <Text style={styles.rowIcon}>{row.icon}</Text>
      <View style={styles.rowLabelWrap}>
        <Text style={[styles.rowLabel, row.danger && styles.labelDanger]}>
          {row.label}
        </Text>
        {row.sublabel && (
          <Text style={styles.rowSublabel}>{row.sublabel}</Text>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function InfoItem({ row }: { row: InfoRow }) {
  return (
    <View style={styles.row} testID={`row-${row.key}`}>
      <Text style={styles.rowIcon}>{row.icon}</Text>
      <Text style={styles.rowLabel}>{row.label}</Text>
      <Text style={styles.rowInfoValue}>{row.value}</Text>
    </View>
  );
}

function SettingItem({ item }: { item: SettingRow }) {
  if (item.type === "toggle") return <ToggleItem row={item} />;
  if (item.type === "nav") return <NavItem row={item} />;
  return <InfoItem row={item} />;
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── SettingsScreen ───────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { user, session, signOut } = useAuthStore();
  const settings = useSettingsStore();

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const accessToken = session?.access_token ?? null;

  // ── Sign out ─────────────────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => void signOut(),
        },
      ],
      { cancelable: true }
    );
  };

  // ── Delete account ────────────────────────────────────────────────────────

  const handleDeleteAccount = async (password: string) => {
    const res = await fetch(`${API_URL}/api/users/me`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? "Failed to delete account. Please try again.");
    }
    setShowDeleteModal(false);
    await signOut();
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure? This action cannot be undone. All chips, stats, and game history will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => setShowDeleteModal(true),
        },
      ]
    );
  };

  // ── Sections ──────────────────────────────────────────────────────────────

  const sections: Section[] = [
    {
      title: "ACCOUNT",
      rows: [
        {
          key: "change-password",
          type: "nav",
          icon: "🔑",
          label: "Change Password",
          onPress: () => router.push("/(app)/change-password"),
        },
        {
          key: "email-notifications",
          type: "nav",
          icon: "🔔",
          label: "Email Notifications",
          onPress: () => router.push("/(app)/email-notifications"),
        },
        {
          key: "privacy-settings",
          type: "nav",
          icon: "🔒",
          label: "Privacy Settings",
          onPress: () => router.push("/(app)/privacy-settings"),
        },
      ],
    },
    {
      title: "GAME PREFERENCES",
      rows: [
        {
          key: "sound-effects",
          type: "toggle",
          icon: "🔊",
          label: "Sound Effects",
          value: settings.soundEffects,
          onToggle: settings.setSoundEffects,
        },
        {
          key: "music",
          type: "toggle",
          icon: "🎵",
          label: "Music",
          value: settings.music,
          onToggle: settings.setMusic,
        },
        {
          key: "vibration",
          type: "toggle",
          icon: "📳",
          label: "Vibration",
          value: settings.vibration,
          onToggle: settings.setVibration,
        },
        {
          key: "auto-muck",
          type: "toggle",
          icon: "🃏",
          label: "Auto-Muck Losing Hands",
          value: settings.autoMuckLosing,
          onToggle: settings.setAutoMuckLosing,
        },
        {
          key: "hand-strength",
          type: "toggle",
          icon: "💪",
          label: "Show Hand Strength",
          value: settings.showHandStrength,
          onToggle: settings.setShowHandStrength,
        },
        {
          key: "animation-speed",
          type: "nav",
          icon: "⚡",
          label: "Animation Speed",
          sublabel: SPEED_LABEL[settings.animationSpeed],
          onPress: () =>
            showAnimationSpeedPicker(
              settings.animationSpeed,
              settings.setAnimationSpeed
            ),
        },
      ] satisfies SettingRow[],
    },
    {
      title: "DISPLAY",
      rows: [
        {
          key: "theme",
          type: "nav",
          icon: "🌙",
          label: "Theme",
          sublabel: THEME_LABEL[settings.theme],
          onPress: () =>
            showThemePicker(settings.theme, settings.setTheme),
        },
        {
          key: "card-style",
          type: "nav",
          icon: "🎴",
          label: "Card Style",
          sublabel: capitalize(settings.cardStyle),
          onPress: () => router.push("/(app)/card-style"),
        },
        {
          key: "table-color",
          type: "nav",
          icon: "🟢",
          label: "Table Color",
          sublabel: capitalize(settings.tableColor),
          onPress: () => router.push("/(app)/table-color"),
        },
      ] satisfies SettingRow[],
    },
    {
      title: "SUPPORT",
      rows: [
        {
          key: "help-faq",
          type: "nav",
          icon: "❓",
          label: "Help & FAQ",
          onPress: () => router.push("/(app)/help"),
        },
        {
          key: "contact-support",
          type: "nav",
          icon: "💬",
          label: "Contact Support",
          onPress: () =>
            void Linking.openURL("mailto:support@csechbox.com"),
        },
        {
          key: "report-bug",
          type: "nav",
          icon: "🐛",
          label: "Report a Bug",
          onPress: () =>
            void Linking.openURL("mailto:bugs@csechbox.com?subject=Bug+Report"),
        },
        {
          key: "rate-app",
          type: "nav",
          icon: "⭐",
          label: "Rate App",
          onPress: () =>
            void Linking.openURL(
              Platform.OS === "ios"
                ? "https://apps.apple.com/app/id000000000"
                : "https://play.google.com/store/apps/details?id=com.csechbox.poker"
            ),
        },
      ] satisfies SettingRow[],
    },
    {
      title: "ABOUT",
      rows: [
        {
          key: "version",
          type: "info",
          icon: "ℹ️",
          label: "Version",
          value: APP_VERSION,
        },
        {
          key: "terms",
          type: "nav",
          icon: "📄",
          label: "Terms of Service",
          onPress: () =>
            void Linking.openURL("https://csechbox.com/terms"),
        },
        {
          key: "privacy-policy",
          type: "nav",
          icon: "🛡️",
          label: "Privacy Policy",
          onPress: () =>
            void Linking.openURL("https://csechbox.com/privacy"),
        },
      ] satisfies SettingRow[],
    },
    {
      title: "DANGER ZONE",
      rows: [
        {
          key: "delete-account",
          type: "nav",
          icon: "⚠️",
          label: "Delete Account",
          danger: true,
          onPress: confirmDeleteAccount,
        },
      ] satisfies SettingRow[],
    },
  ];

  return (
    <>
      <Stack.Screen options={{ title: "Settings", headerBackTitle: "Lobby" }} />

      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.listContent}
          testID="settings-list"
        >
          {sections.map((section) => (
            <View key={section.title}>
              <SectionHeader title={section.title} />
              <View style={styles.sectionCard}>
                {section.rows.map((row, idx) => (
                  <View key={row.key}>
                    <SettingItem item={row} />
                    {idx < section.rows.length - 1 && (
                      <View style={styles.separator} />
                    )}
                  </View>
                ))}
              </View>
              <View style={styles.sectionFooter} />
            </View>
          ))}

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
              onPress={handleSignOut}
              testID="btn-sign-out"
            >
              <Text style={styles.signOutIcon}>→</Text>
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
            {user?.email && (
              <Text style={styles.accountEmail} testID="account-email">
                {user.email}
              </Text>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Delete-account modal rendered outside the list to avoid clipping. */}
      <DeleteAccountModal
        visible={showDeleteModal}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
      />
    </>
  );
}

// ─── Picker helpers (use Alert on mobile; no dependency on a picker lib) ──────

const SPEED_LABEL: Record<string, string> = {
  slow: "Slow",
  normal: "Normal",
  fast: "Fast",
};

const THEME_LABEL: Record<string, string> = {
  dark: "Dark",
  light: "Light",
};

function showAnimationSpeedPicker(
  current: AnimationSpeed,
  onSelect: (v: AnimationSpeed) => void
) {
  const options: AnimationSpeed[] = ["slow", "normal", "fast"];
  Alert.alert(
    "Animation Speed",
    `Current: ${SPEED_LABEL[current]}`,
    [
      ...options.map((o) => ({
        text: `${o === current ? "✓ " : ""}${SPEED_LABEL[o]}`,
        onPress: () => onSelect(o),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]
  );
}

function showThemePicker(
  current: AppTheme,
  onSelect: (v: AppTheme) => void
) {
  const options: AppTheme[] = ["dark", "light"];
  Alert.alert(
    "Theme",
    `Current: ${THEME_LABEL[current]}`,
    [
      ...options.map((o) => ({
        text: `${o === current ? "✓ " : ""}${THEME_LABEL[o]}`,
        onPress: () => onSelect(o),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0f1a" },
  listContent: { paddingBottom: 40 },

  // Section
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 1,
  },
  sectionFooter: { height: 4 },

  // Rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161b22",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowPressed: { opacity: 0.7 },
  rowIcon: { fontSize: 18, width: 26, textAlign: "center" },
  rowLabelWrap: { flex: 1 },
  rowLabel: { fontSize: 15, color: "#e2e8f0", flex: 1 },
  rowSublabel: { fontSize: 12, color: "#64748b", marginTop: 1 },
  rowInfoValue: { fontSize: 14, color: "#64748b" },
  labelDanger: { color: "#f87171" },
  chevron: { fontSize: 20, color: "#4a5568", marginRight: -2 },
  sectionCard: {
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#21262d",
    overflow: "hidden",
    marginHorizontal: 0,
  },
  separator: { height: 1, backgroundColor: "#21262d", marginLeft: 54 },

  // Footer
  footer: { padding: 24, gap: 12, alignItems: "center" },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1a0a0a",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    width: "100%",
    justifyContent: "center",
  },
  signOutIcon: { fontSize: 16, color: "#f87171" },
  signOutText: { fontSize: 16, fontWeight: "700", color: "#f87171" },
  accountEmail: { fontSize: 12, color: "#4a5568" },

  // Delete modal
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#161b22",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "#7f1d1d",
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 44 : 24,
    gap: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#f87171" },
  modalBody: { fontSize: 14, color: "#94a3b8", lineHeight: 20 },
  modalInput: {
    backgroundColor: "#0d1117",
    borderWidth: 1.5,
    borderColor: "#7f1d1d",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: "#e2e8f0",
    fontSize: 15,
  },
  modalError: { fontSize: 13, color: "#f87171" },
  modalButtons: { flexDirection: "row", gap: 10 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#21262d",
    alignItems: "center",
  },
  modalCancelText: { color: "#94a3b8", fontWeight: "600" },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#7f1d1d",
    alignItems: "center",
  },
  modalConfirmText: { color: "#fecaca", fontWeight: "700" },
});
