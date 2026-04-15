import { Platform } from "react-native";

/**
 * Pass as `useNativeDriver` in any Animated call.
 * The native driver is only available on iOS/Android; on web it falls back to
 * JS-based animation automatically, but React Native logs a warning every time
 * `true` is passed.  Using this constant silences that warning without
 * scattering Platform checks across every animation site.
 */
export const nativeDriver = Platform.OS !== "web";
