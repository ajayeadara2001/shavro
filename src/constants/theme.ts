import { Platform } from "react-native";

export const lightColors = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "#F7F8FA",

  primary: "#2563EB",
  primaryLight: "#EFF6FF",

  text: "#111827",
  textSecondary: "#6B7280",

  border: "#E5E7EB",

  success: "#15803D",
  error: "#DC2626",

  incomeSurface: "#EAF7EE",
  expenseSurface: "#FDF0F0",
  incomeBorder: "#CBEBD4",
  expenseBorder: "#F5D3D3",
  incomeIconBackground: "#D7F3E1",
  expenseIconBackground: "#FBE0E0",
};

export const darkColors: typeof lightColors = {
  background: "#10141D",
  surface: "#171D28",
  surfaceMuted: "#202735",

  primary: "#8BABFF",
  primaryLight: "#263654",

  text: "#F9FAFB",
  textSecondary: "#A1AAB9",

  border: "#394252",

  success: "#4ADE80",
  error: "#F87171",

  incomeSurface: "#163527",
  expenseSurface: "#3B2027",
  incomeBorder: "#285C40",
  expenseBorder: "#68404A",
  incomeIconBackground: "#24563B",
  expenseIconBackground: "#593039",
};

// Compatibility export for existing screens.
// We'll migrate screens to dynamic theme colors.
export const colors = lightColors;

export type ThemeColors = typeof lightColors;
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function getThemeColors(theme: ResolvedTheme): ThemeColors {
  return theme === "dark" ? darkColors : lightColors;
}

export const typography = {
  fontFamily: Platform.select({
    ios: "System",
    android: "Roboto",
    default: "System",
  }),

  sizes: {
    caption: 12,
    small: 14,
    body: 16,
    subtitle: 18,
    heading: 24,
    amount: 36,
  },

  weights: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  } as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 20,
};

export const layout = {
  screenPadding: 20,
  minimumTouchTarget: 44,
  buttonHeight: 56,
};
