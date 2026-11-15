
import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  colors,
  radius,
  spacing,
  typography,
} from '../constants/theme';

interface AmountInputProps {
  value: string;
  onChangeValue: (value: string) => void;
  currencySymbol?: string;
}

export default function AmountInput({
  value,
  onChangeValue,
  currencySymbol = '₹',
}: AmountInputProps) {

  const handleAmountChange = (text: string) => {
    // Remove everything except digits and decimal points
    const cleaned = text.replace(/[^0-9.]/g, '');

    // Allow only one decimal point and two decimal places
    if (/^\d*(\.\d{0,2})?$/.test(cleaned)) {
      onChangeValue(cleaned);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Amount</Text>

      <View style={styles.inputRow}>
        <Text style={styles.currency}>
          {currencySymbol}
        </Text>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleAmountChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Expense amount"
          accessibilityHint="Enter the amount spent"
          maxLength={12}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    flexDirection: 'row',
    alignItems: 'center',
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
});
