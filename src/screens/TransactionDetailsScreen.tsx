import React, { useMemo, useState } from 'react';

import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  FileText,
  Pencil,
  Tag,
  Trash2,
} from 'lucide-react-native';

import type { Expense } from '../types/expense';
import { deleteExpense } from '../services/expenseStorage';
import { formatINR } from '../utils/money';
import {
  type ThemeColors,
  layout,
  radius,
  spacing,
  typography,
} from '../constants/theme';

import { useAppTheme } from '../context/ThemeContext';

interface TransactionDetailsScreenProps {
  expense: Expense;
  onBack: () => void;
  onEdit: (expense: Expense) => void;
  onDeleted: () => void;
}

function showMessage(title: string, message: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    }
    return;
  }

  Alert.alert(title, message);
}

function confirmDeletion(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(
      typeof window !== 'undefined' &&
      window.confirm(
        'Delete this expense?\n\nThis action cannot be undone.'
      )
    );
  }

  return new Promise((resolve) => {
    Alert.alert(
      'Delete Expense',
      'Are you sure you want to delete this expense? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      }
    );
  });
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatName(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function getCategory(expense: Expense): string {
  return expense.categoryId === 'other' &&
    expense.expenseName
    ? expense.expenseName
    : formatName(expense.categoryId);
}

function getPaymentMethod(expense: Expense): string {
  if (
    expense.paymentMethodId === 'other' &&
    expense.otherMethodName
  ) {
    return expense.otherMethodName;
  }

  if (expense.paymentMethodId === 'upi') {
    return 'UPI';
  }

  return formatName(expense.paymentMethodId);
}

type DetailStyles = ReturnType<typeof createStyles>;

interface DetailRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  styles: DetailStyles;
}

function DetailRow({
  icon,
  label,
  value,
  styles,
}: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        {icon}
      </View>

      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>
          {label}
        </Text>

        <Text style={styles.detailValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function TransactionDetailsScreen({
  expense,
  onBack,
  onEdit,
  onDeleted,
}: TransactionDetailsScreenProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(
    () => createStyles(colors),
    [colors]
  );

  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (): Promise<void> => {
    if (deleting) return;

    const confirmed = await confirmDeletion();

    if (!confirmed) return;

    setDeleting(true);

    try {
      await deleteExpense(expense.id);

      onDeleted();

      showMessage(
        'Expense Deleted',
        'The expense was deleted successfully.'
      );
    } catch (error) {
      console.error('Expense deletion failed:', error);

      showMessage(
        'Delete Failed',
        'Unable to delete the expense. Please try again.'
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back to transactions"
            style={styles.backButton}
          >
            <ArrowLeft
              size={22}
              color={colors.text}
            />
          </Pressable>

          <Text style={styles.heading}>
            Transaction Details
          </Text>
        </View>

        {/* Expense amount */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>
            EXPENSE
          </Text>

          <Text style={styles.amount}>
            −{formatINR(expense.amount)}
          </Text>

          <Text style={styles.categorySubtitle}>
            {getCategory(expense)}
          </Text>
        </View>

        {/* Transaction information */}
        <View style={styles.detailsCard}>
          <DetailRow
            styles={styles}
            icon={
              <Tag
                size={20}
                color={colors.primary}
              />
            }
            label="Category"
            value={getCategory(expense)}
          />

          <DetailRow
            styles={styles}
            icon={
              <CreditCard
                size={20}
                color={colors.primary}
              />
            }
            label="Payment Method"
            value={getPaymentMethod(expense)}
          />

          <DetailRow
            styles={styles}
            icon={
              <CalendarDays
                size={20}
                color={colors.primary}
              />
            }
            label="Transaction Date"
            value={formatDate(expense.transactionDate)}
          />

          <DetailRow
            styles={styles}
            icon={
              <FileText
                size={20}
                color={colors.primary}
              />
            }
            label="Notes"
            value={expense.notes || 'No notes added'}
          />
        </View>

        {/* Recorded timestamp */}
        <View style={styles.metadata}>
          <Text style={styles.metadataLabel}>
            Recorded on
          </Text>

          <Text style={styles.metadataValue}>
            {new Date(expense.createdAt).toLocaleString(
              'en-IN',
              {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }
            )}
          </Text>
        </View>

        {/* Edit and Delete buttons */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => onEdit(expense)}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Edit expense"
            style={[
              styles.actionButton,
              styles.editButton,
            ]}
          >
            <Pencil
              size={19}
              color={colors.primary}
            />

            <Text style={styles.editButtonText}>
              Edit Expense
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void handleDelete()}
            disabled={deleting}
            accessibilityRole="button"
            accessibilityLabel="Delete expense"
            style={[
              styles.actionButton,
              styles.deleteButton,
            ]}
          >
            <Trash2
              size={19}
              color={colors.error}
            />

            <Text style={styles.deleteButtonText}>
              {deleting
                ? 'Deleting...'
                : 'Delete Expense'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Theme-aware styles
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },

    content: {
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxl,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },

    backButton: {
      width: 44,
      height: 44,
      borderRadius: radius.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },

    heading: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.heading,
      fontWeight: typography.weights.bold,
      color: colors.text,
      flexShrink: 1,
    },

    amountCard: {
      backgroundColor: colors.expenseSurface,
      borderWidth: 1,
      borderColor: colors.expenseBorder,
      borderRadius: radius.large,
      padding: spacing.xl,
      alignItems: 'center',
      marginBottom: spacing.xl,
    },

    amountLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.caption,
      fontWeight: typography.weights.semibold,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },

    amount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.amount,
      fontWeight: typography.weights.bold,
      color: colors.error,
    },

    categorySubtitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.textSecondary,
      marginTop: spacing.sm,
    },

    detailsCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      paddingHorizontal: spacing.lg,
    },

    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },

    detailIcon: {
      width: 44,
      height: 44,
      backgroundColor: colors.primaryLight,
      borderRadius: radius.medium,
      alignItems: 'center',
      justifyContent: 'center',
    },

    detailContent: {
      flex: 1,
    },

    detailLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },

    detailValue: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
    },

    metadata: {
      alignItems: 'center',
      marginTop: spacing.xl,
      gap: spacing.xs,
    },

    metadataLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.caption,
      color: colors.textSecondary,
    },

    metadataValue: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
    },

    actions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xxl,
    },

    actionButton: {
      flex: 1,
      minHeight: 54,
      borderRadius: radius.medium,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
    },

    editButton: {
      backgroundColor: colors.primaryLight,
      borderWidth: 1,
      borderColor: colors.primary,
    },

    editButtonText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
      color: colors.primary,
    },

    deleteButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.error,
    },

    deleteButtonText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
      color: colors.error,
    },
  });
}