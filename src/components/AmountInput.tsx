import React, { useMemo, useState } from "react";

import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

interface AmountInputProps {
  value: string;
  onChangeValue: (value: string) => void;
  currencySymbol?: string;
}

export default function AmountInput({
  value,
  onChangeValue,
  currencySymbol = "₹",
}: AmountInputProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [accessoryId] = useState(
    () => `shavro-amount-${Math.random().toString(36).slice(2)}`,
  );

  const handleAmountChange = (text: string): void => {
    const cleaned = text.replace(/[^0-9.]/g, "");

    // Allow one decimal point and two decimal places.
    if (/^\d*(\.\d{0,2})?$/.test(cleaned)) {
      onChangeValue(cleaned);
    }
  };

  const dismissKeyboard = (): void => {
    Keyboard.dismiss();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Amount</Text>

      <View style={styles.inputRow}>
        <Text style={styles.currency}>{currencySymbol}</Text>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleAmountChange}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={dismissKeyboard}
          inputAccessoryViewID={Platform.OS === "ios" ? accessoryId : undefined}
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
          maxLength={12}
          accessibilityLabel="Transaction amount"
          accessibilityHint="Enter the transaction amount"
        />
      </View>

      {/* iOS numeric keyboard toolbar */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.keyboardToolbar}>
            <Pressable
              onPress={dismissKeyboard}
              accessibilityRole="button"
              accessibilityLabel="Done entering amount"
              style={styles.doneButton}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      padding: spacing.xl,
    },

    label: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },

    inputRow: {
      flexDirection: "row",
      alignItems: "center",
    },

    currency: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.amount,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },

    input: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.amount,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },

    keyboardToolbar: {
      minHeight: 48,
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },

    doneButton: {
      minWidth: 64,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },

    doneText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.primary,
    },
  });
}
