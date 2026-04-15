import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import * as ImagePicker from "expo-image-picker";
import { useAuthStore } from "../../store/auth-store";
import { useGameStore } from "../../store/game-store";
import { checkUsernameAvailable } from "../../lib/usernameCheck";
import {
  fetchUserProfile,
  updateUsernameApi,
  uploadAvatar,
  type UserProfile,
} from "../../lib/profileApi";

// ─── Constants ────────────────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// ─── Toast banner ─────────────────────────────────────────────────────────────

type ToastType = "success" | "error";

interface ToastState {
  message: string;
  type: ToastType;
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonBlock({
  width,
  height,
  style,
}: {
  width: number | string;
  height: number;
  style?: object;
}) {
  return (
    <View
      style={[styles.skeleton, { width: width as number, height }, style]}
      testID="skeleton-block"
    />
  );
}

function ProfileSkeleton() {
  return (
    <View style={styles.skeletonContainer} testID="profile-skeleton">
      <SkeletonBlock width={88} height={88} style={{ borderRadius: 44, alignSelf: "center" }} />
      <SkeletonBlock width={120} height={14} style={{ alignSelf: "center", marginTop: 12 }} />
      <View style={styles.section}>
        <SkeletonBlock width="80%" height={14} />
        <SkeletonBlock width="60%" height={14} style={{ marginTop: 10 }} />
        <SkeletonBlock width="70%" height={14} style={{ marginTop: 10 }} />
      </View>
      <View style={styles.section}>
        <SkeletonBlock width="40%" height={18} />
        <SkeletonBlock width="100%" height={72} style={{ marginTop: 12, borderRadius: 12 }} />
      </View>
      <View style={styles.section}>
        <SkeletonBlock width="40%" height={18} />
        <SkeletonBlock width="100%" height={160} style={{ marginTop: 12, borderRadius: 12 }} />
      </View>
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  uri,
  uploading,
  onPress,
}: {
  uri: string | null;
  uploading: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.avatarSection}>
      <Pressable
        style={styles.avatarWrapper}
        onPress={onPress}
        disabled={uploading}
        testID="avatar-pressable"
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.avatarImage}
            testID="avatar-image"
          />
        ) : (
          <View style={styles.avatarPlaceholder} testID="avatar-placeholder">
            <Text style={styles.avatarInitial}>👤</Text>
          </View>
        )}
        {uploading && (
          <View style={styles.avatarOverlay} testID="avatar-uploading">
            <ActivityIndicator color="#ffd700" />
          </View>
        )}
      </Pressable>
      <Pressable
        style={styles.changePhotoBtn}
        onPress={onPress}
        disabled={uploading}
        testID="btn-change-photo"
      >
        <Text style={styles.changePhotoText}>
          {uploading ? "Uploading…" : "Change Photo"}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Username row ─────────────────────────────────────────────────────────────

type UsernameStatus = "idle" | "checking" | "available" | "taken";

function UsernameRow({
  username,
  onSave,
}: {
  username: string;
  onSave: (newName: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(username);
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = (text: string) => {
    setValue(text);
    setError(null);
    clearTimeout(debounceRef.current);
    if (!USERNAME_RE.test(text) || text === username) {
      setStatus("idle");
      return;
    }
    setStatus("checking");
    debounceRef.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(text);
      setStatus(available ? "available" : "taken");
    }, 500);
  };

  const handleSave = async () => {
    if (!USERNAME_RE.test(value)) {
      setError("3–20 chars, letters/numbers/underscore only");
      return;
    }
    if (status === "taken") {
      setError("Username already taken");
      return;
    }
    if (value === username) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update username");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(username);
    setStatus("idle");
    setError(null);
    setEditing(false);
    clearTimeout(debounceRef.current);
  };

  const statusColor =
    status === "available"
      ? "#22c55e"
      : status === "taken"
      ? "#f87171"
      : "#64748b";
  const statusLabel =
    status === "checking"
      ? "Checking…"
      : status === "available"
      ? "Available ✓"
      : status === "taken"
      ? "Already taken"
      : null;

  const canSave =
    !saving &&
    USERNAME_RE.test(value) &&
    status !== "taken" &&
    status !== "checking";

  return (
    <View testID="username-row">
      <Text style={styles.fieldLabel}>Username</Text>
      {editing ? (
        <View style={styles.editRow}>
          <TextInput
            style={styles.usernameInput}
            value={value}
            onChangeText={handleChange}
            autoFocus
            autoCapitalize="none"
            maxLength={20}
            testID="input-username"
          />
          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            testID="btn-save-username"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#0a3d14" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.cancelBtn}
            onPress={handleCancel}
            testID="btn-cancel-username"
          >
            <Text style={styles.cancelBtnText}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.viewRow}>
          <Text style={styles.fieldValue} testID="username-display">
            {username}
          </Text>
          <Pressable
            style={styles.editBtn}
            onPress={() => setEditing(true)}
            testID="btn-edit-username"
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        </View>
      )}
      {statusLabel && (
        <Text style={[styles.statusHint, { color: statusColor }]} testID="username-status">
          {statusLabel}
        </Text>
      )}
      {error && (
        <Text style={styles.fieldError} testID="username-error">
          {error}
        </Text>
      )}
    </View>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────

function SessionRow({
  label,
  value,
  valueColor,
  testID,
}: {
  label: string;
  value: string;
  valueColor?: string;
  testID?: string;
}) {
  return (
    <View style={styles.sessionRow}>
      <Text style={styles.sessionLabel}>{label}</Text>
      <Text
        style={[styles.sessionValue, valueColor ? { color: valueColor } : null]}
        testID={testID}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Session helpers ──────────────────────────────────────────────────────────

function formatBuyIns(buyIns: number[]): string {
  if (buyIns.length === 0) return "—";
  if (buyIns.length === 1) return `$${buyIns[0]!.toLocaleString("en-US")}`;
  const amounts = buyIns.map((b) => `$${b.toLocaleString("en-US")}`).join("+");
  return `${buyIns.length}x (${amounts})`;
}

function sessionNet(currentChips: number, buyIns: number[]): number | null {
  const total = buyIns.reduce((s, b) => s + b, 0);
  return total > 0 ? currentChips - total : null;
}

function formatNet(net: number | null): string {
  if (net === null) return "—";
  const abs = Math.abs(net).toLocaleString("en-US");
  return net >= 0 ? `+$${abs}` : `-$${abs}`;
}

function netColor(net: number | null): string {
  if (net === null) return "#64748b";
  return net >= 0 ? "#22c55e" : "#f87171";
}

// ─── Stats grid ───────────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} testID={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {value}
      </Text>
    </View>
  );
}

// ─── ProfileScreen ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, session, chips, updateUsername, updateChips } = useAuthStore();
  const accessToken = session?.access_token ?? null;

  const { currentRoom, myPlayer, sessionBuyIns } = useGameStore(
    useShallow((s) => ({
      currentRoom: s.currentRoom,
      myPlayer: s.myPlayer,
      sessionBuyIns: s.sessionBuyIns,
    }))
  );

  const inActiveGame = currentRoom !== null && myPlayer !== null;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Toast helper ───────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Load profile ───────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    try {
      const data = await fetchUserProfile(accessToken);
      setProfile(data);
      // Sync chips into store if server has newer value.
      if (data.chips !== chips) updateChips(data.chips);
    } catch {
      // Fall back to auth store data — server may not be running in dev.
      if (user) {
        setProfile({
          id: user.id,
          username:
            (user.user_metadata?.["username"] as string | undefined) ?? "Player",
          email: user.email ?? "",
          avatarUrl:
            (user.user_metadata?.["avatar_url"] as string | undefined) ?? null,
          chips,
          createdAt: user.created_at,
          stats: {
            gamesPlayed: 0,
            handsWon: 0,
            winRate: 0,
            totalWinnings: 0,
            biggestPot: 0,
            favoriteGame: "—",
          },
        });
      }
    }
  }, [accessToken, chips, user, updateChips]);

  useEffect(() => {
    (async () => {
      await loadProfile();
      setLoading(false);
    })();
    return () => clearTimeout(toastTimer.current);
  }, [loadProfile]);

  // ── Pull to refresh ────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  // ── Username save ──────────────────────────────────────────────────────────

  const handleSaveUsername = async (newUsername: string) => {
    // Update Supabase auth metadata via store.
    const { error } = await updateUsername(newUsername);
    if (error) throw new Error(error.message);

    // Also update server profile.
    try {
      await updateUsernameApi(newUsername, accessToken);
    } catch {
      // Server update failed but auth metadata was updated — not fatal.
    }

    setProfile((prev) => (prev ? { ...prev, username: newUsername } : prev));
    showToast("Username updated!");
  };

  // ── Avatar change ──────────────────────────────────────────────────────────

  const handleChangePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Please allow access to your photo library to change your avatar."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    if (!user?.id) return;

    setUploading(true);
    try {
      const publicUrl = await uploadAvatar(uri, user.id);
      setProfile((prev) => (prev ? { ...prev, avatarUrl: publicUrl } : prev));
      showToast("Avatar updated!");
    } catch (e: unknown) {
      showToast(
        e instanceof Error ? e.message : "Failed to upload photo",
        "error"
      );
    } finally {
      setUploading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <>
      <Stack.Screen options={{ title: "Profile", headerBackTitle: "Lobby" }} />

      {/* Toast */}
      {toast && (
        <View
          style={[
            styles.toast,
            toast.type === "error" ? styles.toastError : styles.toastSuccess,
          ]}
          testID="toast"
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ffd700"
            testID="refresh-control"
          />
        }
        testID="profile-scroll"
      >
        {loading ? (
          <ProfileSkeleton />
        ) : (
          <>
            {/* ── Avatar ──────────────────────────────────────────────── */}
            <Avatar
              uri={profile?.avatarUrl ?? null}
              uploading={uploading}
              onPress={handleChangePhoto}
            />

            {/* ── Info ────────────────────────────────────────────────── */}
            <View style={styles.section} testID="info-section">
              {profile && (
                <UsernameRow
                  username={profile.username}
                  onSave={handleSaveUsername}
                />
              )}

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Email</Text>
                <Text style={styles.fieldValue} testID="email-display">
                  {profile?.email ?? "—"}
                </Text>
                <Text style={styles.fieldHint}>Cannot be changed</Text>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Member since</Text>
                <Text style={styles.fieldValue} testID="member-since">
                  {memberSince}
                </Text>
              </View>
            </View>

            {/* ── Balance ─────────────────────────────────────────────── */}
            <View style={styles.section} testID="balance-section">
              <Text style={styles.sectionTitle}>💰 Chip Balance</Text>
              <View style={styles.balanceCard}>
                {/* Unlimited indicator */}
                <View style={styles.unlimitedRow} testID="unlimited-row">
                  <Text style={styles.unlimitedIcon}>♾️</Text>
                  <Text style={styles.unlimitedLabel}>Unlimited</Text>
                  <View style={styles.freeBadge}>
                    <Text style={styles.freeBadgeText}>Free</Text>
                  </View>
                </View>

                {/* Current session */}
                {inActiveGame ? (
                  <View style={styles.sessionSection} testID="current-session">
                    <Text style={styles.sessionTitle}>Current Session</Text>
                    <SessionRow
                      label="Stack"
                      value={`$${myPlayer!.chips.toLocaleString("en-US")}`}
                      testID="session-stack"
                    />
                    <SessionRow
                      label="Buy-ins"
                      value={formatBuyIns(sessionBuyIns)}
                      testID="session-buyins"
                    />
                    {(() => {
                      const net = sessionNet(myPlayer!.chips, sessionBuyIns);
                      return (
                        <SessionRow
                          label="Net"
                          value={formatNet(net)}
                          valueColor={netColor(net)}
                          testID="session-net"
                        />
                      );
                    })()}
                  </View>
                ) : (
                  <Text style={styles.noGame} testID="no-active-game">
                    Not currently in a game
                  </Text>
                )}
              </View>
            </View>

            {/* ── Stats ───────────────────────────────────────────────── */}
            <View style={styles.section} testID="stats-section">
              <Text style={styles.sectionTitle}>📊 Statistics</Text>
              <View style={styles.statsCard}>
                <StatRow
                  label="Games Played"
                  value={profile?.stats.gamesPlayed ?? 0}
                />
                <StatRow
                  label="Hands Won"
                  value={profile?.stats.handsWon ?? 0}
                />
                <StatRow
                  label="Win Rate"
                  value={`${profile?.stats.winRate ?? 0}%`}
                />
                <StatRow
                  label="Total Winnings"
                  value={`$${(profile?.stats.totalWinnings ?? 0).toLocaleString()}`}
                />
                <StatRow
                  label="Biggest Pot"
                  value={`$${(profile?.stats.biggestPot ?? 0).toLocaleString()}`}
                />
                <StatRow
                  label="Favorite Game"
                  value={profile?.stats.favoriteGame ?? "—"}
                />
              </View>
              <Pressable
                style={styles.fullStatsBtn}
                onPress={() => router.push("/(app)/stats")}
                testID="btn-full-stats"
              >
                <Text style={styles.fullStatsBtnText}>View Full Stats</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0d1117" },
  scrollContent: { paddingBottom: 40 },

  // Skeleton
  skeletonContainer: { padding: 20, gap: 8 },
  skeleton: { backgroundColor: "#1e2a3a", borderRadius: 6 },

  // Toast
  toast: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    zIndex: 999,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  toastSuccess: { backgroundColor: "#14532d", borderWidth: 1, borderColor: "#22c55e" },
  toastError: { backgroundColor: "#450a0a", borderWidth: 1, borderColor: "#f87171" },
  toastText: { color: "#e2e8f0", fontSize: 14, fontWeight: "600", textAlign: "center" },

  // Avatar
  avatarSection: { alignItems: "center", paddingTop: 28, paddingBottom: 8 },
  avatarWrapper: { position: "relative" },
  avatarImage: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: "#ffd700" },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#16213e",
    borderWidth: 2,
    borderColor: "#2d3a56",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 36 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoBtn: { marginTop: 10, paddingVertical: 4, paddingHorizontal: 14 },
  changePhotoText: { color: "#60a5fa", fontSize: 13, fontWeight: "600" },

  // Sections
  section: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: "#161b22",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#21262d",
    padding: 16,
    gap: 14,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#ffd700" },

  // Info fields
  fieldRow: { gap: 2 },
  fieldLabel: { fontSize: 11, color: "#64748b", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 },
  fieldValue: { fontSize: 15, color: "#e2e8f0", fontWeight: "500", marginTop: 2 },
  fieldHint: { fontSize: 11, color: "#4a5568", marginTop: 2 },

  // Username edit
  viewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  usernameInput: {
    flex: 1,
    backgroundColor: "#0d1117",
    borderWidth: 1.5,
    borderColor: "#2d3a56",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#e2e8f0",
    fontSize: 15,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "#1e3a5f",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#2d5a8e",
  },
  editBtnText: { color: "#60a5fa", fontSize: 12, fontWeight: "600" },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#ffd700",
    borderRadius: 8,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: "#0a1628", fontSize: 13, fontWeight: "700" },
  cancelBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#1e2a3a",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { color: "#94a3b8", fontSize: 14 },
  statusHint: { fontSize: 11, marginTop: 3 },
  fieldError: { fontSize: 12, color: "#f87171", marginTop: 2 },

  // Balance
  balanceCard: {
    backgroundColor: "#0a1628",
    borderRadius: 12,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: "#1e3a5f",
  },
  unlimitedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unlimitedIcon: { fontSize: 20 },
  unlimitedLabel: { fontSize: 17, fontWeight: "700", color: "#ffd700", flex: 1 },
  freeBadge: {
    backgroundColor: "#14532d",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  freeBadgeText: { fontSize: 11, fontWeight: "700", color: "#22c55e" },

  // Current session
  sessionSection: {
    borderTopWidth: 1,
    borderTopColor: "#1e3a5f",
    paddingTop: 12,
    gap: 4,
  },
  sessionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  sessionLabel: { fontSize: 13, color: "#94a3b8" },
  sessionValue: { fontSize: 13, fontWeight: "700", color: "#e2e8f0" },
  noGame: {
    fontSize: 13,
    color: "#64748b",
    borderTopWidth: 1,
    borderTopColor: "#1e3a5f",
    paddingTop: 12,
  },

  // Stats
  statsCard: {
    backgroundColor: "#0a1628",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e3a5f",
    overflow: "hidden",
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#161b22",
  },
  statLabel: { fontSize: 14, color: "#94a3b8" },
  statValue: { fontSize: 14, color: "#e2e8f0", fontWeight: "600" },
  fullStatsBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#16213e",
    borderWidth: 1,
    borderColor: "#2d3a56",
    alignItems: "center",
  },
  fullStatsBtnText: { color: "#94a3b8", fontSize: 14, fontWeight: "600" },
});
