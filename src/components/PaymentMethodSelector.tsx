
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  Banknote,
  Building2,
  CreditCard,
  Ellipsis,
  Plus,
  Smartphone,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';

import {
  colors,
  radius,
  spacing,
  typography,
} from '../constants/theme';

export interface PaymentMethod {
  id: string;
  name: string;
  icon: LucideIcon;
}

export const defaultPaymentMethods: PaymentMethod[] = [
  { id: 'cash', name: 'Cash', icon: Banknote },
  { id: 'upi', name: 'UPI', icon: Smartphone },
  { id: 'debit_card', name: 'Debit Card', icon: Wallet },
  { id: 'credit_card', name: 'Credit Card', icon: CreditCard },
  { id: 'bank_transfer', name: 'Bank Transfer', icon: Building2 },
  { id: 'other', name: 'Other', icon: Ellipsis },
];

interface PaymentMethodSelectorProps {
  selectedMethodId: string | null;
  onSelectMethod: (methodId: string) => void;
  onAddMethod: () => void;
  methods?: PaymentMethod[];
  otherMethodName?: string;
  onOtherMethodNameChange?: (name: string) => void;
}

export default function PaymentMethodSelector({
  selectedMethodId,
  onSelectMethod,
  onAddMethod,
  methods = defaultPaymentMethods,
  otherMethodName = '',
  onOtherMethodNameChange,
}: PaymentMethodSelectorProps) {
  const isOtherSelected = selectedMethodId === 'other';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>
          Payment Method
        </Text>

        <Pressable
          onPress={onAddMethod}
          accessibilityRole="button"
          accessibilityLabel="Add a payment method"
          style={styles.addButton}
        >
          <Plus
            size={18}
            color={colors.primary}
          />

          <Text style={styles.addText}>
            Add Method
          </Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {methods.map((method) => {
          const selected = selectedMethodId === method.id;
          const Icon = method.icon;

          return (
            <Pressable
              key={method.id}
              onPress={() => onSelectMethod(method.id)}
              accessibilityRole="button"
              accessibilityLabel={method.name}
              accessibilityState={{ selected }}
              style={[
                styles.methodCard,
                selected && styles.selectedCard,
              ]}
            >
              <Icon
                size={24}
                strokeWidth={1.8}
                color={
                  selected
                    ? colors.primary
                    : colors.text
                }
              />

              <Text
                numberOfLines={2}
                style={[
                  styles.methodText,
                  selected && styles.selectedText,
                ]}
              >
                {method.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isOtherSelected && (
        <View style={styles.otherContainer}>
          <Text style={styles.label}>
            Payment method name
          </Text>

          <TextInput
            style={styles.input}
            value={otherMethodName}
            onChangeText={onOtherMethodNameChange}
            placeholder="Enter payment method"
            placeholderTextColor={colors.textSecondary}
            maxLength={60}
            autoCapitalize="words"
            accessibilityLabel="Custom payment method name"
          />

          <Text style={styles.helperText}>
            Enter the payment method used for this transaction.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },

  heading: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },

  addButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },

  addText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.small,
    fontWeight: typography.weights.medium,
    color: colors.primary,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    rowGap: spacing.sm,
  },

  methodCard: {
    width: '31.33%',
    minHeight: 88,
    marginHorizontal: '1%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: spacing.sm,
  },

  selectedCard: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primaryLight,
  },

  methodText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.small,
    color: colors.text,
    textAlign: 'center',
  },

  selectedText: {
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },

  otherContainer: {
    marginTop: spacing.lg,
  },

  label: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium,
    color: colors.text,
    marginBottom: spacing.sm,
  },

  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.lg,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },

  helperText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
