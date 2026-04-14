import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>♠ CSechBox Poker</Text>
      <Text style={styles.subtitle}>Texas Hold'em on the go</Text>
      <Pressable style={styles.button} onPress={() => router.push("/lobby")}>
        <Text style={styles.buttonText}>Enter Lobby</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: "800",
    color: "#ffd700",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#94a3b8",
    marginBottom: 40,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#2d6a4f",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 8,
  },
  buttonText: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "600",
  },
});
