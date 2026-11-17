import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  ReceiptText,
  SearchX,
  Wallet,
} from "lucide-react-native";

import { getExpenses } from "../services/expenseStorage";
import { getIncomes } from "../services/incomeStorage";

import {
  getCustomCategories,
  getCustomPaymentMethods,
} from "../services/customOptionsStorage";

import type { Expense } from "../types/expense";
import type { Income } from "../types/income";
import type { Transaction } from "../types/transaction";
import { sortTransactions } from "../types/transaction";

import {
  layout,
  radius,
  spacing,
  typography,
  type ThemeColors,
} from "../constants/theme";

import { calculateFinancialTotals, formatINR } from "../utils/money";

import {
  type TransactionFilters,
  defaultTransactionFilters,
  filterTransactions,
  countActiveFilters,
  resetTransactionFilters,
} from "../utils/transactionFilters";

import TransactionFilterPanel, {
  type FilterOption,
} from "../components/TransactionFilterPanel";

import { useAppTheme } from "../context/ThemeContext";

interface TransactionHistoryScreenProps {
  onAddExpense: () => void;
  onSelectExpense: (expense: Expense) => void;
  onSelectIncome: (income: Income) => void;
}

interface CustomNameMaps {
  incomeCategories: Record<string, string>;
  expenseCategories: Record<string, string>;
  paymentMethods: Record<string, string>;
}

const EMPTY_NAME_MAPS: CustomNameMaps = {
  incomeCategories: {},
  expenseCategories: {},
  paymentMethods: {},
};

const formatCurrency = formatINR;

function formatDate(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatName(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

// Expense category title.
function getCategoryName(expense: Expense, names: CustomNameMaps): string {
  if (expense.categoryId === "other" && expense.expenseName?.trim()) {
    return expense.expenseName.trim();
  }

  return (
    names.expenseCategories[expense.categoryId] ??
    formatName(expense.categoryId)
  );
}

// Shared payment-method label resolver.
//
// Used by both income and expense transactions.
function getPaymentMethodLabel(
  paymentMethodId: string | null | undefined,
  otherMethodName: string | null | undefined,
  names: CustomNameMaps,
): string {
  // Income saved before Received Via existed.
  if (!paymentMethodId?.trim()) {
    return "Not recorded";
  }

  // Manually entered Other method.
  if (paymentMethodId === "other") {
    return otherMethodName?.trim() || "Other";
  }

  // Preserve the correct abbreviation.
  if (paymentMethodId === "upi") {
    return "UPI";
  }

  // Resolve saved custom method IDs.
  const customName = names.paymentMethods[paymentMethodId];

  if (customName) {
    return customName;
  }

  // Handle built-in methods.
  return formatName(paymentMethodId);
}

// Expense payment method.
function getPaymentName(expense: Expense, names: CustomNameMaps): string {
  return getPaymentMethodLabel(
    expense.paymentMethodId,
    expense.otherMethodName,
    names,
  );
}

// New: Income Received Via.
function getIncomeReceivedVia(income: Income, names: CustomNameMaps): string {
  const method = getPaymentMethodLabel(
    income.paymentMethodId,
    income.otherMethodName,
    names,
  );

  return `Received via ${method}`;
}

// Income title: preserve existing income-name
// behavior and resolve custom categories.
function getIncomeCategoryName(income: Income, names: CustomNameMaps): string {
  if (income.incomeName?.trim()) {
    return income.incomeName.trim();
  }

  return (
    names.incomeCategories[income.categoryId] ?? formatName(income.categoryId)
  );
}

// Available category filter options.
// Preserve existing filter behavior.
function getAvailableCategories(
  transactions: Transaction[],
  names: CustomNameMaps,
): FilterOption[] {
  const categories = new Map<string, string>();

  transactions.forEach((transaction) => {
    const id = transaction.data.categoryId;

    const name =
      transaction.type === "INCOME"
        ? (names.incomeCategories[id] ?? formatName(id))
        : (names.expenseCategories[id] ?? formatName(id));

    if (!categories.has(id)) {
      categories.set(id, name);
    }
  });

  return Array.from(categories.entries())
    .map(([id, name]) => ({
      id,
      name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Keep existing expense-payment filtering.
// Income payment-method filtering will be
// handled in transactionFilters.ts separately.

function getAvailablePaymentMethods(
  transactions: Transaction[],
  names: CustomNameMaps,
): FilterOption[] {
  const methods = new Map<string, string>();

  transactions.forEach((transaction) => {
    const methodId = transaction.data.paymentMethodId;

    // Older income records may have no
    // recorded payment method.
    if (!methodId) {
      if (transaction.type === "INCOME") {
        methods.set("__not_recorded__", "Not recorded");
      }
      return;
    }

    const methodName = getPaymentMethodLabel(
      methodId,
      transaction.data.otherMethodName,
      names,
    );

    if (!methods.has(methodId)) {
      methods.set(methodId, methodName);
    }
  });

  return Array.from(methods.entries())
    .map(([id, name]) => ({
      id,
      name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getAvailableYears(transactions: Transaction[]): number[] {
  const years = new Set<number>();

  years.add(new Date().getFullYear());

  transactions.forEach((transaction) => {
    const year = Number(transaction.data.transactionDate.slice(0, 4));

    if (Number.isInteger(year) && year > 0) {
      years.add(year);
    }
  });

  return Array.from(years).sort((a, b) => b - a);
}

export default function TransactionHistoryScreen({
  onAddExpense,
  onSelectExpense,
  onSelectIncome,
}: TransactionHistoryScreenProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [customNames, setCustomNames] =
    useState<CustomNameMaps>(EMPTY_NAME_MAPS);

  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    ...defaultTransactionFilters,
  }));

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [nameWarning, setNameWarning] = useState<string | null>(null);

  // Load saved income and expenses.
  const loadTransactions = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setNameWarning(null);

    try {
      const [savedExpenses, savedIncomes] = await Promise.all([
        getExpenses(),
        getIncomes(),
      ]);

      const combined: Transaction[] = [
        ...savedExpenses.map(
          (expense): Transaction => ({
            type: "EXPENSE",
            data: expense,
          }),
        ),

        ...savedIncomes.map(
          (income): Transaction => ({
            type: "INCOME",
            data: income,
          }),
        ),
      ];

      setTransactions(sortTransactions(combined));

      // Load custom category and method names.
      // Failure here should not hide transactions.
      try {
        const [categories, methods] = await Promise.all([
          getCustomCategories(),
          getCustomPaymentMethods(),
        ]);

        const incomeCategories: Record<string, string> = {};

        const expenseCategories: Record<string, string> = {};

        const paymentMethods: Record<string, string> = {};

        categories.forEach((category) => {
          if (category.scope === "INCOME") {
            incomeCategories[category.id] = category.name;
          } else {
            expenseCategories[category.id] = category.name;
          }
        });

        methods.forEach((method) => {
          paymentMethods[method.id] = method.name;
        });

        setCustomNames({
          incomeCategories,
          expenseCategories,
          paymentMethods,
        });
      } catch (lookupError) {
        console.error("Unable to load custom names:", lookupError);

        setCustomNames(EMPTY_NAME_MAPS);

        setNameWarning(
          "Some custom names could not be loaded. Refresh to try again.",
        );
      }
    } catch (loadError) {
      console.error("Failed to load transactions:", loadError);

      setError("Unable to load transactions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const availableYears = useMemo(
    () => getAvailableYears(transactions),
    [transactions],
  );

  const categories = useMemo(
    () => getAvailableCategories(transactions, customNames),
    [transactions, customNames],
  );

  const paymentMethods = useMemo(
    () => getAvailablePaymentMethods(transactions, customNames),
    [transactions, customNames],
  );

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, filters),
    [transactions, filters],
  );

  const activeFilterCount = useMemo(
    () => countActiveFilters(filters),
    [filters],
  );

  const isFiltered = activeFilterCount > 0 || filters.sortBy !== "newest";

  // Calculate totals from filtered transactions.
  const { totalIncome, totalExpenses, netBalance } = useMemo(() => {
    const incomes: Income[] = [];
    const expenses: Expense[] = [];

    filteredTransactions.forEach((transaction) => {
      if (transaction.type === "INCOME") {
        incomes.push(transaction.data);
      } else {
        expenses.push(transaction.data);
      }
    });

    return calculateFinancialTotals(incomes, expenses);
  }, [filteredTransactions]);

  // Group transactions by date.
  const groupedTransactions = useMemo(() => {
    return filteredTransactions.reduce<Record<string, Transaction[]>>(
      (groups, transaction) => {
        const date = transaction.data.transactionDate;

        if (!groups[date]) {
          groups[date] = [];
        }

        groups[date].push(transaction);

        return groups;
      },
      {},
    );
  }, [filteredTransactions]);

  const clearFilters = (): void => {
    setFilters(resetTransactionFilters());
  };

  const hasTransactions = transactions.length > 0;

  const hasFilteredTransactions = filteredTransactions.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.heading}>Transactions</Text>

          <Pressable
            onPress={() => void loadTransactions()}
            accessibilityRole="button"
            accessibilityLabel="Refresh transactions"
            style={styles.refreshButton}
          >
            <RefreshCw size={20} color={colors.text} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />

            <Text style={styles.stateText}>Loading transactions...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <AlertCircle size={32} color={colors.error} />

            <Text style={styles.stateText}>{error}</Text>

            <Pressable
              onPress={() => void loadTransactions()}
              style={styles.actionButton}
              accessibilityRole="button"
            >
              <Text style={styles.actionButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* CUSTOM NAME WARNING */}
            {nameWarning && (
              <View style={styles.warningRow}>
                <Text style={styles.warningText}>{nameWarning}</Text>

                <Pressable
                  onPress={() => void loadTransactions()}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            )}

            {/* FILTERS */}
            <TransactionFilterPanel
              filters={filters}
              onChange={setFilters}
              availableYears={availableYears}
              categories={categories}
              paymentMethods={paymentMethods}
            />

            {/* FINANCIAL SUMMARY */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryLabel}>
                  {isFiltered ? "FILTERED NET BALANCE" : "NET BALANCE"}
                </Text>

                <Wallet size={22} color={colors.textSecondary} />
              </View>

              <Text
                style={[
                  styles.totalAmount,
                  netBalance < 0 && styles.negativeBalance,
                ]}
              >
                {netBalance < 0 ? "−" : ""}
                {formatCurrency(Math.abs(netBalance))}
              </Text>

              <Text style={styles.transactionCount}>
                {filteredTransactions.length}{" "}
                {filteredTransactions.length === 1
                  ? "transaction"
                  : "transactions"}
                {isFiltered ? ` of ${transactions.length}` : ""}
              </Text>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryTotals}>
                <View style={styles.summaryColumn}>
                  <Text style={styles.summaryLabel}>TOTAL INCOME</Text>

                  <Text style={styles.incomeTotal}>
                    {formatCurrency(totalIncome)}
                  </Text>
                </View>

                <View style={styles.summaryColumn}>
                  <Text style={styles.summaryLabel}>TOTAL EXPENSES</Text>

                  <Text style={styles.expenseTotal}>
                    {formatCurrency(totalExpenses)}
                  </Text>
                </View>
              </View>
            </View>

            {/* EMPTY STATE */}
            {!hasTransactions ? (
              <View style={styles.centerState}>
                <ReceiptText size={40} color={colors.textSecondary} />

                <Text style={styles.emptyTitle}>No transactions yet</Text>

                <Text style={styles.stateText}>
                  Your income and expenses will appear here.
                </Text>

                <Pressable
                  onPress={onAddExpense}
                  style={styles.actionButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionButtonText}>Add Expense</Text>
                </Pressable>
              </View>
            ) : !hasFilteredTransactions ? (
              <View style={styles.centerState}>
                <SearchX size={40} color={colors.textSecondary} />

                <Text style={styles.emptyTitle}>No matching transactions</Text>

                <Text style={styles.stateText}>
                  Try changing your search or removing some filters.
                </Text>

                <Pressable
                  onPress={clearFilters}
                  style={styles.actionButton}
                  accessibilityRole="button"
                  accessibilityLabel="Clear transaction filters"
                >
                  <Text style={styles.actionButtonText}>Clear Filters</Text>
                </Pressable>
              </View>
            ) : (
              /* TRANSACTION HISTORY */
              Object.entries(groupedTransactions).map(
                ([date, dateTransactions]) => (
                  <View key={date} style={styles.dateGroup}>
                    <Text style={styles.dateHeading}>{formatDate(date)}</Text>

                    {dateTransactions.map((transaction) => {
                      const isIncome = transaction.type === "INCOME";

                      const item = transaction.data;

                      const title =
                        transaction.type === "INCOME"
                          ? getIncomeCategoryName(transaction.data, customNames)
                          : getCategoryName(transaction.data, customNames);

                      // Income now displays
                      // Received Via instead
                      // of the generic "Income".
                      const subtitle =
                        transaction.type === "INCOME"
                          ? getIncomeReceivedVia(transaction.data, customNames)
                          : getPaymentName(transaction.data, customNames);

                      const amountLabel =
                        `${isIncome ? "+" : "−"}` + formatCurrency(item.amount);

                      return (
                        <Pressable
                          key={`${transaction.type}-` + item.id}
                          style={styles.transactionRow}
                          onPress={() => {
                            if (transaction.type === "INCOME") {
                              onSelectIncome(transaction.data);
                            } else {
                              onSelectExpense(transaction.data);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={
                            `${title}, ${subtitle}, ` + amountLabel
                          }
                        >
                          <View
                            style={[
                              styles.transactionIcon,
                              isIncome ? styles.incomeIcon : styles.expenseIcon,
                            ]}
                          >
                            {isIncome ? (
                              <ArrowDownLeft size={21} color={colors.success} />
                            ) : (
                              <ArrowUpRight size={21} color={colors.error} />
                            )}
                          </View>

                          <View style={styles.transactionDetails}>
                            <Text
                              style={styles.categoryName}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {title}
                            </Text>

                            <Text style={styles.paymentName}>{subtitle}</Text>

                            {item.notes ? (
                              <Text style={styles.notes} numberOfLines={2}>
                                {item.notes}
                              </Text>
                            ) : null}
                          </View>

                          <Text
                            style={[
                              styles.transactionAmount,
                              isIncome
                                ? styles.incomeAmount
                                : styles.expenseAmount,
                            ]}
                          >
                            {amountLabel}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ),
              )
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },

    content: {
      flexGrow: 1,
      width: "100%",
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxl,
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.xl,
    },

    heading: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.heading,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },

    refreshButton: {
      width: 44,
      height: 44,
      borderRadius: radius.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },

    summaryCard: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.large,
      padding: spacing.xl,
      marginBottom: spacing.xl,
    },

    summaryHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },

    summaryLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.caption,
      fontWeight: typography.weights.semibold,
      color: colors.textSecondary,
    },

    totalAmount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.amount,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },

    negativeBalance: {
      color: colors.error,
    },

    transactionCount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },

    summaryDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.lg,
    },

    summaryTotals: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.md,
    },

    summaryColumn: {
      flex: 1,
      minWidth: 0,
    },

    incomeTotal: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.bold,
      color: colors.success,
      marginTop: spacing.sm,
    },

    expenseTotal: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.bold,
      color: colors.error,
      marginTop: spacing.sm,
    },

    dateGroup: {
      marginBottom: spacing.xl,
    },

    dateHeading: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },

    transactionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: spacing.md,
    },

    transactionIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.medium,
      alignItems: "center",
      justifyContent: "center",
    },

    expenseIcon: {
      backgroundColor: colors.expenseIconBackground,
    },

    incomeIcon: {
      backgroundColor: colors.incomeIconBackground,
    },

    transactionDetails: {
      flex: 1,
      minWidth: 0,
    },

    categoryName: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    paymentName: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },

    notes: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },

    transactionAmount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      textAlign: "right",
      flexShrink: 1,
    },

    expenseAmount: {
      color: colors.error,
    },

    incomeAmount: {
      color: colors.success,
    },

    centerState: {
      flex: 1,
      minHeight: 260,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      paddingVertical: spacing.xxl,
    },

    emptyTitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    stateText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      textAlign: "center",
    },

    actionButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.xl,
      minHeight: 44,
      borderRadius: radius.medium,
      justifyContent: "center",
      alignItems: "center",
      marginTop: spacing.sm,
    },

    actionButtonText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.background,
    },

    warningRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      marginBottom: spacing.md,
    },

    warningText: {
      flex: 1,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.error,
    },

    retryText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
      color: colors.primary,
    },
  });
}
