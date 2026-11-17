import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Platform, useColorScheme } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getThemeColors,
  type ThemeColors,
  type ThemePreference,
  type ResolvedTheme,
} from "../constants/theme";

const THEME_STORAGE_KEY = "shavro_theme_v1";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  colors: ThemeColors;
  setPreference: (value: ThemePreference) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();

  const [preference, setPreferenceState] = useState<ThemePreference>("light");

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    const loadPreference = async () => {
      try {
        const saved =
          Platform.OS === "web"
            ? window.localStorage.getItem(THEME_STORAGE_KEY)
            : await AsyncStorage.getItem(THEME_STORAGE_KEY);

        if (active && isThemePreference(saved)) {
          setPreferenceState(saved);
        }
      } catch (error) {
        console.error("Unable to load theme preference:", error);
      } finally {
        if (active) {
          setLoaded(true);
        }
      }
    };

    void loadPreference();

    return () => {
      active = false;
    };
  }, []);

  const setPreference = (value: ThemePreference): void => {
    setPreferenceState(value);
  };

  useEffect(() => {
    if (!loaded) return;

    const savePreference = async () => {
      try {
        if (Platform.OS === "web") {
          window.localStorage.setItem(THEME_STORAGE_KEY, preference);
        } else {
          await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
        }
      } catch (error) {
        console.error("Unable to save theme preference:", error);
      }
    };

    void savePreference();
  }, [preference, loaded]);

  const resolvedTheme: ResolvedTheme =
    preference === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      colors: getThemeColors(resolvedTheme),
      setPreference,
      isDark: resolvedTheme === "dark",
    }),
    [preference, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used inside ThemeProvider");
  }

  return context;
}
