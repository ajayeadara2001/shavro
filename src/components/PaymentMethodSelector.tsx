import React, { useMemo, useState } from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
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
  type ThemeColors,
  radius,
  spacing,
  typography,
} from '../constants/theme';

import { useAppTheme } from '../context/ThemeContext';

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

const GRID_GAP = 12;
const MOBILE_BREAKPOINT = 420;

export default function PaymentMethodSelector({
  selectedMethodId,
  onSelectMethod,
  onAddMethod,
  methods = defaultPaymentMethods,
  otherMethodName = '',
  onOtherMethodNameChange,
}: PaymentMethodSelectorProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(
    () => createStyles(colors),
    [colors]
  );

  const [sectionWidth, setSectionWidth] = useState(0);

  const handleLayout = (
    event: LayoutChangeEvent
  ): void => {
    const width = event.nativeEvent.layout.width;

    setSectionWidth(previous =>
      Math.abs(previous - width) > 1
        ? width
        : previous
    );
  };

  // Keep mobile the same.
  // Wider screens get more columns to avoid large empty space.
  const columns =
    sectionWidth >= 1100
      ? 6
      : sectionWidth >= MOBILE_BREAKPOINT
        ? 3
        : 2;

  const cardWidth =
    sectionWidth > 0
      ? Math.max(
          0,
          (
            sectionWidth -
            GRID_GAP * (columns - 1)
          ) / columns
        )
      : undefined;

  const isOtherSelected =
    selectedMethodId === 'other';

  return (
    <View style={styles.container}>
      <View
        style={styles.section}
        onLayout={handleLayout}
      >
        {/* Section heading */}
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
              strokeWidth={2}
            />

            <Text style={styles.addText}>
              Add Method
            </Text>
          </Pressable>
        </View>

        {/* Payment method cards */}
        <View style={styles.grid}>
          {methods.map(method => {
            const selected =
              selectedMethodId === method.id;

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
                  {
                    width:
                      cardWidth ??
                      (columns === 2
                        ? '48%'
                        : columns === 3
                          ? '31%'
                          : '15.5%'),
                  },
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

        {/* Custom payment method */}
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
              returnKeyType="done"
              accessibilityLabel="Custom payment method name"
            />

            <Text style={styles.helperText}>
              Enter the payment method used for this transaction.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: '100%',
      minWidth: 0,
    },

    section: {
      width: '100%',
      minWidth: 0,
      alignSelf: 'flex-start',
    },

    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
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
      justifyContent: 'center',
      gap: spacing.xs,
    },

    addText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
      color: colors.primary,
    },

    grid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: GRID_GAP,
      rowGap: GRID_GAP,
    },

    methodCard: {
      minHeight: 96,
      minWidth: 0,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.sm,
      gap: spacing.sm,
      backgroundColor: colors.surface,
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
      width: '100%',
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
      width: '100%',
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
      lineHeight: 20,
    },
  });
}