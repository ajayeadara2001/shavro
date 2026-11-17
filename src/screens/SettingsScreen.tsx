import React from "react";

import {
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronRight, DatabaseBackup, ShieldCheck } from "lucide-react-native";

import { useAppTheme } from "../context/ThemeContext";

import { typography } from "../constants/theme";

interface SettingsScreenProps {
  onOpenBackup: () => void;
}

const DESKTOP_BREAKPOINT = 1000;
const TABLET_BREAKPOINT = 600;

export default function SettingsScreen({ onOpenBackup }: SettingsScreenProps) {
  const { colors } = useAppTheme();

  const { width } = useWindowDimensions();

  const insets = useSafeAreaInsets();

  const isWeb = Platform.OS === "web";

  const isDesktop = isWeb && width >= DESKTOP_BREAKPOINT;

  const isTablet = width >= TABLET_BREAKPOINT && !isDesktop;

  // =======================================
  // RESPONSIVE HORIZONTAL SPACING
  // =======================================

  const horizontalPadding = isDesktop ? 40 : isTablet ? 28 : 20;

  // =======================================
  // MOBILE NOTCH / STATUS BAR
  // =======================================

  const nativeTopInset = isWeb
    ? 0
    : Platform.OS === "android"
      ? Math.max(insets.top, NativeStatusBar.currentHeight ?? 0)
      : insets.top;

  const contentTopPadding = isDesktop ? 36 : nativeTopInset + 24;

  // =======================================
  // RENDER
  // =======================================

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
            paddingTop: contentTopPadding,
            paddingBottom: Math.max(insets.bottom, 0) + 48,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* =================================
            SETTINGS HEADER
           ================================= */}

        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              isDesktop && styles.desktopTitle,
              {
                color: colors.text,
              },
            ]}
          >
            Settings
          </Text>

          <Text
            style={[
              styles.subtitle,
              {
                color: colors.textSecondary,
              },
            ]}
          >
            Manage your Shavro preferences and data.
          </Text>
        </View>

        {/* =================================
            DATA MANAGEMENT
           ================================= */}

        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.textSecondary,
              },
            ]}
          >
            DATA MANAGEMENT
          </Text>

          <Pressable
            onPress={onOpenBackup}
            accessibilityRole="button"
            accessibilityLabel="Open Backup and Restore"
            accessibilityHint="Opens backup export and restore options"
            style={({ pressed }) => [
              styles.settingItem,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: colors.primary + "18",
                },
              ]}
            >
              <DatabaseBackup size={22} color={colors.primary} />
            </View>

            <View style={styles.settingText}>
              <Text
                style={[
                  styles.itemTitle,
                  {
                    color: colors.text,
                  },
                ]}
              >
                Backup & Restore
              </Text>

              <Text
                style={[
                  styles.description,
                  {
                    color: colors.textSecondary,
                  },
                ]}
              >
                Export and recover your financial records
              </Text>
            </View>

            <ChevronRight size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* =================================
            PRIVACY INFORMATION
           ================================= */}

        <View
          style={[
            styles.privacyNote,
            {
              borderColor: colors.border,
            },
          ]}
        >
          <ShieldCheck size={19} color={colors.primary} />

          <Text
            style={[
              styles.privacyText,
              {
                color: colors.textSecondary,
              },
            ]}
          >
            Shavro stores your financial records locally. Keep a secure backup
            in case you change devices or clear your app data.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// =========================================
// STYLES
// =========================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  scrollView: {
    flex: 1,
    width: "100%",
  },

  content: {
    width: "100%",
    flexGrow: 1,
  },

  header: {
    marginBottom: 36,
  },

  title: {
    fontFamily: typography.fontFamily,
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 8,
  },

  desktopTitle: {
    fontSize: 32,
  },

  subtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    lineHeight: 22,
  },

  section: {
    width: "100%",
  },

  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 12,
  },

  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    minHeight: 84,
  },

  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },

  settingText: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },

  itemTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: "600",
  },

  description: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    lineHeight: 19,
  },

  privacyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
  },

  privacyText: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    lineHeight: 20,
  },
});
