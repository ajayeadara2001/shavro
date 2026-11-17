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
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react-native";

import { getExpenses } from "../services/expenseStorage";
import { getIncomes } from "../services/incomeStorage";

import {
  loadCustomOptionLabels,
  EMPTY_CUSTOM_OPTION_LABELS,
  type CustomOptionLabels,
} from "../utils/customOptionLabels";

import { generateCustomCategoryReport } from "../utils/customCategoryReports";

import type { Transaction } from "../types/transaction";

import {
  generateMonthlyReport,
  generateYearlyReports,
  getTransactionsForMonth,
} from "../utils/financialReports";

import { calculateFinancialTotals, formatINR } from "../utils/money";

import { saveExcelReport } from "../utils/saveExcelReport";

import CategoryDonutChart from "../components/CategoryDonutChart";
import MonthlyComparisonChart from "../components/MonthlyComparisonChart";

import ExportReportScreen from "./ExportReportScreen";

import {
  type ThemeColors,
  layout,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const currentDate = new Date();

export default function ReportsScreen() {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const [selectedMonth, setSelectedMonth] = useState(
    currentDate.getMonth() + 1,
  );

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Phase 16: Saved category/payment labels.
  const [customLabels, setCustomLabels] = useState<CustomOptionLabels>(
    EMPTY_CUSTOM_OPTION_LABELS,
  );

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [labelWarning, setLabelWarning] = useState<string | null>(null);

  // Controls whether the export screen is visible.
  const [showExportScreen, setShowExportScreen] = useState(false);

  // Load all income and expense transactions
  // and their saved custom category names.
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLabelWarning(null);

    try {
      const [expenses, incomes] = await Promise.all([
        getExpenses(),
        getIncomes(),
      ]);

      const combined: Transaction[] = [
        ...expenses.map(
          (expense): Transaction => ({
            type: "EXPENSE",
            data: expense,
          }),
        ),

        ...incomes.map(
          (income): Transaction => ({
            type: "INCOME",
            data: income,
          }),
        ),
      ];

      setTransactions(combined);

      // Loading names is independent from loading
      // financial transactions. Do not hide reports
      // if the labels cannot be retrieved.
      try {
        const labels = await loadCustomOptionLabels();

        setCustomLabels(labels);
      } catch (labelError) {
        console.error("Failed to load custom category names:", labelError);

        setCustomLabels(EMPTY_CUSTOM_OPTION_LABELS);

        setLabelWarning(
          "Some custom category names could not be loaded. Refresh to try again.",
        );
      }
    } catch (loadError) {
      console.error("Failed to load financial reports:", loadError);

      setError("Unable to load reports. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  // All transactions for the selected month.
  const monthlyTransactions = useMemo(
    () => getTransactionsForMonth(transactions, selectedYear, selectedMonth),
    [transactions, selectedYear, selectedMonth],
  );

  // All transactions for the selected year.
  const yearlyTransactions = useMemo(
    () =>
      transactions.filter((transaction) =>
        transaction.data.transactionDate.startsWith(`${selectedYear}-`),
      ),
    [transactions, selectedYear],
  );

  // Monthly financial summary.
  const monthlyReport = useMemo(
    () => generateMonthlyReport(transactions, selectedYear, selectedMonth),
    [transactions, selectedYear, selectedMonth],
  );

  // Full 12-month financial comparison.
  const yearlyReports = useMemo(
    () => generateYearlyReports(transactions, selectedYear),
    [transactions, selectedYear],
  );

  // Phase 16: Resolve custom category names
  // for the monthly spending chart.
  const monthlyCategories = useMemo(
    () => generateCustomCategoryReport(monthlyTransactions, customLabels),
    [monthlyTransactions, customLabels],
  );

  // Phase 16: Resolve custom category names
  // for the yearly spending chart.
  const yearlyCategories = useMemo(
    () => generateCustomCategoryReport(yearlyTransactions, customLabels),
    [yearlyTransactions, customLabels],
  );

  // Yearly totals use the existing
  // shared Shavro calculation utility.
  const yearlyTotals = useMemo(() => {
    const incomes = [];
    const expenses = [];

    for (const transaction of yearlyTransactions) {
      if (transaction.type === "INCOME") {
        incomes.push(transaction.data);
      } else {
        expenses.push(transaction.data);
      }
    }

    return calculateFinancialTotals(incomes, expenses);
  }, [yearlyTransactions]);

  const changeYear = (direction: number): void => {
    setSelectedYear((previous) => previous + direction);
  };

  const selectedMonthName = MONTHS[selectedMonth - 1];

  // Open the existing Excel export screen.
  const openExportScreen = (): void => {
    if (loading || error) {
      return;
    }

    setShowExportScreen(true);
  };

  // Preserve reporting month and year
  // when returning from Excel export.
  const closeExportScreen = (): void => {
    setShowExportScreen(false);
  };

  // Web: download.
  // Android/iOS: native share sheet.
  if (showExportScreen) {
    return (
      <ExportReportScreen
        transactions={transactions}
        onBack={closeExportScreen}
        onExport={saveExcelReport}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Page header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.heading}>Reports</Text>

            <Text style={styles.subtitle}>
              Understand your money at a glance
            </Text>
          </View>

          {/* Export and Refresh actions */}
          <View style={styles.headerActions}>
            <Pressable
              onPress={openExportScreen}
              disabled={loading || error !== null}
              style={[
                styles.exportHeaderButton,
                (loading || error !== null) && styles.disabledAction,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Export Excel report"
              accessibilityState={{
                disabled: loading || error !== null,
              }}
            >
              <FileSpreadsheet size={19} color={colors.primary} />

              <Text style={styles.exportHeaderText}>Export</Text>
            </Pressable>

            <Pressable
              onPress={() => void loadReports()}
              disabled={loading}
              style={[styles.refreshButton, loading && styles.disabledAction]}
              accessibilityRole="button"
              accessibilityLabel="Refresh financial reports"
              accessibilityState={{
                disabled: loading,
              }}
            >
              <RefreshCw size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.primary} />

            <Text style={styles.stateText}>Loading your reports...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <AlertCircle size={32} color={colors.error} />

            <Text style={styles.stateText}>{error}</Text>

            <Pressable
              style={styles.retryButton}
              onPress={() => void loadReports()}
              accessibilityRole="button"
              accessibilityLabel="Try loading reports again"
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Show label-loading warning if needed */}
            {labelWarning !== null && (
              <View style={styles.warningRow}>
                <Text style={styles.warningText}>{labelWarning}</Text>

                <Pressable
                  onPress={() => void loadReports()}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading custom category names"
                >
                  <Text style={styles.retryLink}>Retry</Text>
                </Pressable>
              </View>
            )}

            {/* Reporting year selector */}
            <View style={styles.yearSelector}>
              <Pressable
                style={styles.yearArrow}
                onPress={() => changeYear(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous year"
              >
                <ChevronLeft size={22} color={colors.text} />
              </Pressable>

              <View style={styles.yearCenter}>
                <Text style={styles.selectorLabel}>REPORTING YEAR</Text>

                <Text style={styles.yearText}>{selectedYear}</Text>
              </View>

              <Pressable
                style={styles.yearArrow}
                onPress={() => changeYear(1)}
                accessibilityRole="button"
                accessibilityLabel="Next year"
              >
                <ChevronRight size={22} color={colors.text} />
              </Pressable>
            </View>

            {/* Month selector */}
            <View style={styles.monthSection}>
              <Text style={styles.sectionTitle}>Choose a month</Text>

              <View style={styles.monthGrid}>
                {MONTHS.map((month, index) => {
                  const monthNumber = index + 1;

                  const selected = selectedMonth === monthNumber;

                  return (
                    <Pressable
                      key={month}
                      style={[
                        styles.monthButton,
                        selected && styles.selectedMonthButton,
                      ]}
                      onPress={() => setSelectedMonth(monthNumber)}
                      accessibilityRole="button"
                      accessibilityLabel={month}
                      accessibilityState={{
                        selected,
                      }}
                    >
                      <Text
                        style={[
                          styles.monthText,
                          selected && styles.selectedMonthText,
                        ]}
                      >
                        {month}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Monthly financial summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>
                {selectedMonthName} {selectedYear}
              </Text>

              <Text style={styles.summarySubtitle}>
                Monthly financial summary
              </Text>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Income</Text>

                  <Text
                    style={[
                      styles.summaryAmount,
                      {
                        color: colors.success,
                      },
                    ]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                  >
                    {formatINR(monthlyReport.totalIncome)}
                  </Text>
                </View>

                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Expenses</Text>

                  <Text
                    style={[
                      styles.summaryAmount,
                      {
                        color: colors.error,
                      },
                    ]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                  >
                    {formatINR(monthlyReport.totalExpenses)}
                  </Text>
                </View>
              </View>

              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Remaining Balance</Text>

                <Text
                  style={[
                    styles.balanceAmount,
                    monthlyReport.netBalance < 0 && {
                      color: colors.error,
                    },
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {monthlyReport.netBalance < 0 ? "−" : ""}
                  {formatINR(Math.abs(monthlyReport.netBalance))}
                </Text>
              </View>

              <Text style={styles.transactionCount}>
                {monthlyReport.transactionCount}{" "}
                {monthlyReport.transactionCount === 1
                  ? "transaction"
                  : "transactions"}{" "}
                this month
              </Text>
            </View>

            {/* Monthly category doughnut chart */}
            <View style={styles.reportSection}>
              <CategoryDonutChart
                title="Where Your Money Went"
                subtitle={`${selectedMonthName} ${selectedYear}`}
                data={monthlyCategories}
              />
            </View>

            {/* Yearly report heading */}
            <View style={styles.sectionHeading}>
              <Text style={styles.yearlyHeading}>Your Year in Review</Text>

              <Text style={styles.yearlyDescription}>
                See how your finances changed throughout {selectedYear}.
              </Text>
            </View>

            {/* Yearly income and expenses */}
            <View style={styles.yearlySummary}>
              <View style={styles.yearlySummaryItem}>
                <Text style={styles.summaryLabel}>Yearly Income</Text>

                <Text
                  style={[styles.yearlyAmount, { color: colors.success }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {formatINR(yearlyTotals.totalIncome)}
                </Text>
              </View>

              <View style={styles.yearlySummaryItem}>
                <Text style={styles.summaryLabel}>Yearly Expenses</Text>

                <Text
                  style={[styles.yearlyAmount, { color: colors.error }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {formatINR(yearlyTotals.totalExpenses)}
                </Text>
              </View>
            </View>

            {/* Income vs Expenses bar graph */}
            <View style={styles.reportSection}>
              <MonthlyComparisonChart
                title="Income vs Expenses"
                subtitle={`Monthly comparison for ${selectedYear}`}
                data={yearlyReports}
              />
            </View>

            {/* Yearly category doughnut chart */}
            <View style={styles.reportSection}>
              <CategoryDonutChart
                title="Yearly Spending by Category"
                subtitle={`January – December ${selectedYear}`}
                data={yearlyCategories}
              />
            </View>

            <Text style={styles.footerNote}>
              Reports are calculated from your saved income and expense
              transactions.
            </Text>
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
      flexWrap: "wrap",
      gap: spacing.md,
      marginBottom: spacing.xl,
    },

    headerText: {
      flex: 1,
      minWidth: 160,
    },

    heading: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.heading,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },

    subtitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },

    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: spacing.sm,
    },

    exportHeaderButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.medium,
    },

    exportHeaderText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
      color: colors.primary,
    },

    disabledAction: {
      opacity: 0.5,
    },

    refreshButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      backgroundColor: colors.surface,
    },

    yearSelector: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      padding: spacing.md,
      marginBottom: spacing.xl,
    },

    yearArrow: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.medium,
    },

    yearCenter: {
      flex: 1,
      alignItems: "center",
    },

    selectorLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.caption,
      fontWeight: typography.weights.medium,
      color: colors.textSecondary,
    },

    yearText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.heading,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginTop: spacing.xs,
    },

    monthSection: {
      marginBottom: spacing.xl,
    },

    sectionTitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.text,
      marginBottom: spacing.md,
    },

    monthGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },

    monthButton: {
      minWidth: 64,
      minHeight: 46,
      paddingHorizontal: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.medium,
    },

    selectedMonthButton: {
      backgroundColor: colors.primaryLight,
      borderColor: colors.primary,
      borderWidth: 2,
    },

    monthText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
      color: colors.text,
    },

    selectedMonthText: {
      color: colors.primary,
      fontWeight: typography.weights.semibold,
    },

    summaryCard: {
      width: "100%",
      padding: spacing.xl,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.large,
      marginBottom: spacing.xl,
    },

    summaryTitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },

    summarySubtitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },

    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
    },

    summaryItem: {
      flex: 1,
      minWidth: 130,
    },

    summaryLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },

    summaryAmount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.bold,
    },

    balanceRow: {
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.sm,
    },

    balanceLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.text,
    },

    balanceAmount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },

    transactionCount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.md,
    },

    reportSection: {
      width: "100%",
      marginBottom: spacing.xl,
    },

    sectionHeading: {
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },

    yearlyHeading: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.heading,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },

    yearlyDescription: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.sm,
    },

    yearlySummary: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      padding: spacing.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      marginBottom: spacing.xl,
    },

    yearlySummaryItem: {
      flex: 1,
      minWidth: 130,
    },

    yearlyAmount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.bold,
    },

    centerState: {
      flex: 1,
      minHeight: 280,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
      paddingVertical: spacing.xxl,
    },

    stateText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      textAlign: "center",
    },

    retryButton: {
      minHeight: 44,
      paddingHorizontal: spacing.xl,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      borderRadius: radius.medium,
    },

    retryButtonText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.background,
    },

    footerNote: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: spacing.md,
      lineHeight: 21,
    },

    // Phase 16: Non-blocking custom-label warning.
    warningRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      marginBottom: spacing.lg,
    },

    warningText: {
      flex: 1,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.error,
    },

    retryLink: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
      color: colors.primary,
    },
  });
}
