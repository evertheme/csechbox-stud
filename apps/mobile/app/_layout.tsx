import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../context/AuthContext";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <AuthProvider>
        <Slot />
      </AuthProvider>
    </>
  );
}
