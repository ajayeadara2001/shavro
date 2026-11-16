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
  CarFront,
  CirclePlay,
  Ellipsis,
  HeartPulse,
  House,
  Plus,
  ReceiptText,
  ShoppingBag,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native';

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from '../constants/theme';

import { useAppTheme } from '../context/ThemeContext';

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: LucideIcon;
}

export const defaultExpenseCategories: ExpenseCategory[] = [
  {
    id: 'food',
    name: 'Food',
    icon: Utensils,
  },
  {
    id: 'transport',
    name: 'Transport',
    icon: CarFront,
  },
  {
    id: 'bills',
    name: 'Bills',
    icon: ReceiptText,
  },
  {
    id: 'shopping',
    name: 'Shopping',
    icon: ShoppingBag,
  },
  {
    id: 'health',
    name: 'Health',
    icon: HeartPulse,
  },
  {
    id: 'housing',
    name: 'Housing',
    icon: House,
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    icon: CirclePlay,
  },
  {
    id: 'other',
    name: 'Other',
    icon: Ellipsis,
  },
];

interface CategorySelectorProps {
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: () => void;
  categories?: ExpenseCategory[];
  otherExpenseName?: string;
  onOtherExpenseNameChange?: (name: string) => void;
}

const GRID_GAP = 12;
const MOBILE_BREAKPOINT = 420;

export default function CategorySelector({
  selectedCategoryId,
  onSelectCategory,
  onAddCategory,
  categories = defaultExpenseCategories,
  otherExpenseName = '',
  onOtherExpenseNameChange,
}: CategorySelectorProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(
    () => createStyles(colors),
    [colors]
  );

  // Width of the actual constrained section.
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

  // Two columns on mobile.
  // Four columns when enough space is available.
  const columns =
    sectionWidth >= 1100
      ? 8
      : sectionWidth >= MOBILE_BREAKPOINT
        ? 4
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
    selectedCategoryId === 'other';

  // Preserve the existing expense-only
  // custom category input behavior.
  const showExpenseName =
    isOtherSelected &&
    !categories.some(
      category => category.id === 'salary'
    );

  return (
    <View style={styles.container}>
      {/* Shared constrained section */}
      <View
        style={styles.section}
        onLayout={handleLayout}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.heading}>
            Category
          </Text>

          <Pressable
            onPress={onAddCategory}
            accessibilityRole="button"
            accessibilityLabel="Add a new category"
            style={styles.addButton}
          >
            <Plus
              size={18}
              color={colors.primary}
              strokeWidth={2}
            />

            <Text style={styles.addText}>
              Add Category
            </Text>
          </Pressable>
        </View>

        {/* Responsive category grid */}
        <View style={styles.grid}>
          {categories.map(category => {
            const isSelected =
              selectedCategoryId === category.id;

            const Icon = category.icon;

            return (
              <Pressable
                key={category.id}
                onPress={() =>
                  onSelectCategory(category.id)
                }
                accessibilityRole="button"
                accessibilityLabel={
                  `${category.name} category`
                }
                accessibilityState={{
                  selected: isSelected,
                }}
                style={[
                  styles.categoryCard,
                  {
                    width:
                      cardWidth ??
                      (columns === 2
                        ? '48%'
                        : columns === 4
                          ? '23%'
                          : '11%'),
                  },
                  isSelected &&
                  styles.selectedCategoryCard,
                ]}
              >
                <Icon
                  size={24}
                  strokeWidth={1.8}
                  color={
                    isSelected
                      ? colors.primary
                      : colors.text
                  }
                />

                <Text
                  numberOfLines={2}
                  style={[
                    styles.categoryText,
                    isSelected &&
                    styles.selectedCategoryText,
                  ]}
                >
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Custom expense name */}
        {showExpenseName && (
          <View style={styles.otherInputContainer}>
            <Text style={styles.otherLabel}>
              Expense name
            </Text>

            <TextInput
              style={styles.otherInput}
              value={otherExpenseName}
              onChangeText={
                onOtherExpenseNameChange
              }
              placeholder="E.g., Haircut, Gift, Bike repair"
              placeholderTextColor={
                colors.textSecondary
              }
              maxLength={60}
              autoCapitalize="sentences"
              autoCorrect={false}
              returnKeyType="done"
              accessibilityLabel="Other expense name"
              accessibilityHint={
                'Enter a name for this expense'
              }
            />

            <Text style={styles.helperText}>
              Enter a name to identify this expense
              in your transaction history.
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

    // Header, cards and custom field share
    // the same responsive width.
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
      color: colors.primary,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
    },

    grid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: GRID_GAP,
      rowGap: GRID_GAP,
    },

    categoryCard: {
      minHeight: 94,
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

    selectedCategoryCard: {
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },

    categoryText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.text,
      textAlign: 'center',
    },

    selectedCategoryText: {
      color: colors.primary,
      fontWeight: typography.weights.medium,
    },

    otherInputContainer: {
      width: '100%',
      marginTop: spacing.lg,
    },

    otherLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
      marginBottom: spacing.sm,
    },

    otherInput: {
      width: '100%',
      minHeight: 56,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      paddingHorizontal: spacing.lg,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.text,
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