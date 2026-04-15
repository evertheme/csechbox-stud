/**
 * secure-storage — platform-aware key-value storage.
 *
 * Native (iOS / Android): delegates to expo-secure-store, which encrypts
 * values in the device keychain / keystore.
 *
 * Web: falls back to localStorage.  Values are NOT encrypted on web — this
 * is acceptable for development / browser testing but should not be used
 * to store production secrets in a shipped web build.
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// localStorage is browser-only — it doesn't exist during Expo Router's
// Node.js SSR pass even when Platform.OS === "web".
const hasLocalStorage = typeof localStorage !== "undefined";

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (hasLocalStorage) localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return hasLocalStorage ? localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (hasLocalStorage) localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
