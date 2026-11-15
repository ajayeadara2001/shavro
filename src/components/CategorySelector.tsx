
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
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
  colors,
  radius,
  spacing,
  typography,
} from '../constants/theme';

// Category structure
export interface ExpenseCategory {
  id: string;
  name: string;
  icon: LucideIcon;
}

// Default expense categories
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

// Component properties
interface CategorySelectorProps {
  selectedCategoryId: string | null;

  onSelectCategory: (categoryId: string) => void;

  onAddCategory: () => void;

  categories?: ExpenseCategory[];

  otherExpenseName?: string;

  onOtherExpenseNameChange?: (name: string) => void;
}

export default function CategorySelector({
  selectedCategoryId,
  onSelectCategory,
  onAddCategory,
  categories = defaultExpenseCategories,
  otherExpenseName = '',
  onOtherExpenseNameChange,
}: CategorySelectorProps) {
  const isOtherSelected = selectedCategoryId === 'other';

  return (
    <View style={styles.container}>

      {/* Category heading and Add Category button */}
      <View style={styles.header}>
        <Text style={styles.heading}>
          Category
        </Text>

        <Pressable
          onPress={onAddCategory}
          accessibilityRole="button"
          accessibilityLabel="Add a new expense category"
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

      {/* Category grid */}
      <View style={styles.grid}>
        {categories.map((category) => {
          const isSelected =
            selectedCategoryId === category.id;

          const Icon = category.icon;

          return (
            <Pressable
              key={category.id}
              onPress={() => onSelectCategory(category.id)}
              accessibilityRole="button"
              accessibilityLabel={`${category.name} category`}
              accessibilityState={{
                selected: isSelected,
              }}
              style={[
                styles.categoryCard,
                isSelected && styles.selectedCategoryCard,
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
                  isSelected && styles.selectedCategoryText,
                ]}
              >
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Custom expense name for Other category */}
      {isOtherSelected && (
        <View style={styles.otherInputContainer}>
          <Text style={styles.otherLabel}>
            Expense name
          </Text>

          <TextInput
            style={styles.otherInput}
            value={otherExpenseName}
            onChangeText={onOtherExpenseNameChange}
            placeholder="E.g., Haircut, Gift, Bike repair"
            placeholderTextColor={colors.textSecondary}
            maxLength={60}
            autoCapitalize="sentences"
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="Other expense name"
            accessibilityHint="Enter a name for this expense"
          />

          <Text style={styles.helperText}>
            Enter a name to identify this expense
            in your transaction history.
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

  // Header
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
    color: colors.primary,
    fontSize: typography.sizes.small,
    fontWeight: typography.weights.medium,
  },

  // Category grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    rowGap: spacing.sm,
  },

  categoryCard: {
    width: '23%',
    minHeight: 90,
    marginHorizontal: '1%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    gap: spacing.sm,
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

  // Other expense input
  otherInputContainer: {
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