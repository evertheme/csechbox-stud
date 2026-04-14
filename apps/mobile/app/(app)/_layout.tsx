import { Stack } from "expo-router";
import { Pressable, Text, StyleSheet } from "react-native";
import { useAuth } from "../../context/AuthContext";

export default function AppLayout() {
  const { signOut } = useAuth();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#16213e" },
        headerTintColor: "#ffd700",
        headerTitleStyle: { fontWeight: "bold" },
        contentStyle: { backgroundColor: "#1a1a2e" },
        headerRight: () => (
          <Pressable onPress={() => signOut()} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  signOutButton: { paddingHorizontal: 4 },
  signOutText: { color: "#94a3b8", fontSize: 14 },
});
