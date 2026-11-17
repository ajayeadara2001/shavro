import React, { useMemo, useState } from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  ArrowLeft,
  CalendarDays,
  Download,
  FileSpreadsheet,
} from "lucide-react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "../context/ThemeContext";

import { loadCustomOptionLabels } from "../utils/customOptionLabels";
import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import type { Transaction } from "../types/transaction";

import ReportDatePicker from "../components/ReportDatePicker";

import {
  getReportTransactions,
  validateReportDateRange,
  type ReportDateRange,
} from "../utils/reportDateRange";

import {
  generateExcelReport,
  type ExcelReportResult,
} from "../utils/excelReport";

import { formatINR, toPaise, toRupees } from "../utils/money";

type PeriodOption = "MONTH" | "YEAR" | "CUSTOM";

interface ExportReportScreenProps {
  transactions: Transaction[];
  onBack: () => void;
  onExport: (report: ExcelReportResult) => Promise<void> | void;
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function initialRange(period: PeriodOption): ReportDateRange {
  const today = new Date();

  const year = today.getFullYear();
  const month = today.getMonth();

  return {
    fromDate:
      period === "MONTH"
        ? formatDate(new Date(year, month, 1))
        : `${year}-01-01`,

    toDate: formatDate(today),
  };
}

const PERIOD_OPTIONS: {
  label: string;
  value: PeriodOption;
}[] = [
  {
    label: "This Month",
    value: "MONTH",
  },
  {
    label: "This Year",
    value: "YEAR",
  },
  {
    label: "Custom Dates",
    value: "CUSTOM",
  },
];

export default function ExportReportScreen({
  transactions,
  onBack,
  onExport,
}: ExportReportScreenProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [period, setPeriod] = useState<PeriodOption>("MONTH");

  const [range, setRange] = useState<ReportDateRange>(() =>
    initialRange("MONTH"),
  );

  const [exporting, setExporting] = useState(false);

  const [exportError, setExportError] = useState<string | null>(null);

  const validation = useMemo(() => validateReportDateRange(range), [range]);

  // Only transactions inside the selected dates.
  const filteredTransactions = useMemo(() => {
    if (!validation.valid) {
      return [];
    }

    return getReportTransactions(transactions, range);
  }, [transactions, range, validation.valid]);

  // Calculate summary in paise to avoid
  // floating-point rounding errors.
  const summary = useMemo(() => {
    let incomePaise = 0;
    let expensePaise = 0;

    let incomeCount = 0;
    let expenseCount = 0;

    for (const transaction of filteredTransactions) {
      const amount = toPaise(transaction.data.amount);

      if (transaction.type === "INCOME") {
        incomePaise += amount;
        incomeCount++;
      } else {
        expensePaise += amount;
        expenseCount++;
      }
    }

    return {
      income: toRupees(incomePaise),
      expenses: toRupees(expensePaise),
      balance: toRupees(incomePaise - expensePaise),
      incomeCount,
      expenseCount,
    };
  }, [filteredTransactions]);

  // Quick date-range selection.
  const selectPeriod = (nextPeriod: PeriodOption): void => {
    setPeriod(nextPeriod);
    setExportError(null);

    if (nextPeriod !== "CUSTOM") {
      setRange(initialRange(nextPeriod));
    }
  };

  // Selecting either calendar date automatically
  // changes the selection to Custom Dates.
  const changeDate = (field: keyof ReportDateRange, value: string): void => {
    setPeriod("CUSTOM");
    setExportError(null);

    setRange((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  // Generate Excel and use the existing
  // platform-specific saving function.
  const handleExport = async (): Promise<void> => {
    if (!validation.valid || exporting) {
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const labels = await loadCustomOptionLabels();

      const report = generateExcelReport(transactions, range, labels);

      await onExport(report);
    } catch (error) {
      console.error("Excel export failed:", error);

      setExportError("Unable to export the report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back navigation */}
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Reports"
          style={styles.backButton}
        >
          <ArrowLeft size={20} color={colors.text} />

          <Text style={styles.backText}>Reports</Text>
        </Pressable>

        {/* Page heading */}
        <View style={styles.headingRow}>
          <FileSpreadsheet size={26} color={colors.primary} />

          <View style={styles.headingContent}>
            <Text style={styles.heading}>Export Report</Text>

            <Text style={styles.subtitle}>
              Download your income and expenses in one Excel file.
            </Text>
          </View>
        </View>

        {/* Quick period options */}
        <Text style={styles.sectionTitle}>Choose a time period</Text>

        <View style={styles.periodOptions}>
          {PERIOD_OPTIONS.map((option) => {
            const selected = period === option.value;

            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: selected,
                }}
                onPress={() => selectPeriod(option.value)}
                style={[
                  styles.periodButton,
                  selected && styles.selectedPeriodButton,
                ]}
              >
                <View
                  style={[
                    styles.radioOuter,
                    selected && styles.radioOuterSelected,
                  ]}
                >
                  {selected && <View style={styles.radioInner} />}
                </View>

                <Text style={styles.periodLabel}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Calendar-based date selection */}
        <View style={styles.dateCard}>
          <View style={styles.dateHeading}>
            <CalendarDays size={20} color={colors.primary} />

            <Text style={styles.sectionTitle}>Report dates</Text>
          </View>

          <Text style={styles.dateHelp}>
            Tap a date to choose it from the calendar.
          </Text>

          <ReportDatePicker
            label="From Date"
            value={range.fromDate}
            onChange={(value: string) => changeDate("fromDate", value)}
          />

          <ReportDatePicker
            label="To Date"
            value={range.toDate}
            onChange={(value: string) => changeDate("toDate", value)}
          />

          {!validation.valid && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {validation.error}
            </Text>
          )}
        </View>

        {/* Financial preview */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Your Report Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Income</Text>

            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {formatINR(summary.income)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Expenses</Text>

            <Text style={[styles.summaryValue, { color: colors.error }]}>
              {formatINR(summary.expenses)}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Net Balance</Text>

            <Text style={styles.summaryValue}>
              {summary.balance < 0 ? "−" : ""}
              {formatINR(Math.abs(summary.balance))}
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.transactionCount}>
            {validation.valid
              ? `${filteredTransactions.length} transactions`
              : "Select a valid date range"}
          </Text>

          <Text style={styles.detailText}>
            {summary.incomeCount} income · {summary.expenseCount} expenses
          </Text>
        </View>

        {/* Excel information */}
        <View style={styles.infoCard}>
          <FileSpreadsheet size={22} color={colors.success} />

          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Excel (.xlsx)</Text>

            <Text style={styles.infoDescription}>
              Includes financial summary, all transactions, income details,
              expense details, monthly comparison, and category breakdown.
            </Text>
          </View>
        </View>

        {/* Export error */}
        {exportError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {exportError}
          </Text>
        )}

        {/* Export button */}
        <Pressable
          disabled={!validation.valid || exporting}
          onPress={() => void handleExport()}
          accessibilityRole="button"
          accessibilityLabel="Export Excel report"
          accessibilityState={{
            disabled: !validation.valid || exporting,
          }}
          style={[
            styles.exportButton,
            (!validation.valid || exporting) && styles.disabledButton,
          ]}
        >
          {exporting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Download size={20} color="#FFFFFF" />

              <Text style={styles.exportButtonText}>Export Excel</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.footerText}>
          Your report includes transactions from both selected dates.
        </Text>
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
      width: "100%",
      padding: spacing.xl,
      paddingBottom: spacing.xxl,
      gap: spacing.lg,
    },

    backButton: {
      minHeight: 44,
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },

    backText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.text,
    },

    headingRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
    },

    headingContent: {
      flex: 1,
      minWidth: 0,
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
      lineHeight: 21,
    },

    sectionTitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    periodOptions: {
      gap: spacing.sm,
    },

    periodButton: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 52,
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      backgroundColor: colors.surface,
    },

    selectedPeriodButton: {
      borderColor: colors.primary,
      borderWidth: 2,
    },

    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },

    radioOuterSelected: {
      borderColor: colors.primary,
    },

    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },

    periodLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.text,
    },

    dateCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      padding: spacing.lg,
      gap: spacing.md,
    },

    dateHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },

    dateHelp: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
    },

    errorText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.error,
    },

    summaryCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      padding: spacing.lg,
      gap: spacing.md,
    },

    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.sm,
    },

    summaryLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.textSecondary,
    },

    summaryValue: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    divider: {
      height: 1,
      backgroundColor: colors.border,
    },

    transactionCount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
    },

    detailText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
    },

    infoCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      backgroundColor: colors.surface,
    },

    infoContent: {
      flex: 1,
      minWidth: 0,
    },

    infoTitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    infoDescription: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      lineHeight: 21,
      marginTop: spacing.xs,
    },

    exportButton: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.medium,
    },

    disabledButton: {
      opacity: 0.5,
    },

    exportButtonText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: "#FFFFFF",
    },

    footerText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      textAlign: "center",
    },
  });
}
