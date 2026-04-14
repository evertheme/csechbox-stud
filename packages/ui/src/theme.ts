export const colors = {
  primary: "#2D6A4F",
  primaryDark: "#1B4332",
  primaryLight: "#52B788",
  accent: "#FFD700",
  accentDark: "#B8960C",
  background: "#1A1A2E",
  surface: "#16213E",
  surfaceElevated: "#0F3460",
  text: "#E2E8F0",
  textMuted: "#94A3B8",
  textInverse: "#1A1A2E",
  error: "#EF4444",
  success: "#22C55E",
  warning: "#F59E0B",
  cardRed: "#DC2626",
  cardBlack: "#1E293B",
  felt: "#2D6A4F",
  chip: {
    white: "#FFFFFF",
    red: "#DC2626",
    blue: "#2563EB",
    green: "#16A34A",
    black: "#1E293B",
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
} as const;

export const typography = {
  fontSizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  fontWeights: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
} as const;
