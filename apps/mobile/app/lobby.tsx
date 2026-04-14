import { View, Text, StyleSheet, FlatList } from "react-native";
import { Stack } from "expo-router";

export default function LobbyScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Lobby" }} />
      <Text style={styles.heading}>Available Rooms</Text>
      <FlatList
        data={[]}
        keyExtractor={(item) => item}
        renderItem={null}
        ListEmptyComponent={
          <Text style={styles.empty}>No rooms available. Create one to get started.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    padding: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffd700",
    marginBottom: 16,
  },
  empty: {
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 40,
    fontSize: 15,
  },
});
