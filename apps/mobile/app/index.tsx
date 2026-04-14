import { Redirect } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#ffd700" size="large" />
      </View>
    );
  }

  return session ? (
    <Redirect href="/(app)/lobby" />
  ) : (
    <Redirect href="/(auth)" />
  );
}
