/**
 * Entry route — decides where to send the user.
 *
 * By the time this renders, the root layout has already called
 * useAuthStore.initialize() and will suppress this screen entirely while
 * isLoading is true (showing SplashScreen instead of <Slot />).
 *
 * The null return below is a safety fallback for the brief instant between
 * Expo Router rendering the route and the layout's splash kicking in.
 */

import { Redirect } from "expo-router";
import { useAuthStore } from "../store/auth-store";

export default function Index() {
  const { isAuthenticated, isLoading } = useAuthStore();

  // Splash is shown by the root layout; render nothing here during load.
  if (isLoading) return null;

  return isAuthenticated ? (
    <Redirect href="/(app)/lobby" />
  ) : (
    <Redirect href="/(auth)" />
  );
}
