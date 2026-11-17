import React, { useMemo } from "react";

import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import {
  type ThemeColors,
  layout,
  radius,
  typography,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
}: PrimaryButtonProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
      }}
      style={({ pressed }) => [
        styles.button,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      height: layout.buttonHeight,
      backgroundColor: colors.primary,
      borderRadius: radius.large,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },

    buttonText: {
      color: "#FFFFFF",
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
    },

    pressed: {
      opacity: 0.85,
    },

    disabled: {
      opacity: 0.5,
    },
  });
}
