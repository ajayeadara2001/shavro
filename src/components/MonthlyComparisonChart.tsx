import React, { useMemo } from "react";

import { ScrollView, StyleSheet, Text, View } from "react-native";

import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

import type { MonthlyReport } from "../utils/financialReports";

import { formatINR } from "../utils/money";

interface MonthlyComparisonChartProps {
  title?: string;
  subtitle?: string;
  data: MonthlyReport[];
}

const MONTH_WIDTH = 70;
const CHART_HEIGHT = 250;
const GRAPH_TOP = 16;
const GRAPH_BOTTOM = 204;
const GRAPH_HEIGHT = GRAPH_BOTTOM - GRAPH_TOP;
const BAR_WIDTH = 19;

const MONTH_NAMES = [
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

function formatAxisAmount(value: number): string {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(1)}L`;
  }

  if (value >= 1000) {
    return `₹${(value / 1000).toFixed(0)}k`;
  }

  return `₹${Math.round(value)}`;
}

export default function MonthlyComparisonChart({
  title = "Income vs Expenses",
  subtitle = "Monthly financial comparison",
  data,
}: MonthlyComparisonChartProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Use the selected year's data.
  // Generate empty entries for months without transactions.
  const months = useMemo(() => {
    return MONTH_NAMES.map((name, index) => {
      const monthNumber = index + 1;

      const report = data.find((item) => item.month === monthNumber);

      return {
        month: monthNumber,
        name,
        income: Math.max(0, report?.totalIncome ?? 0),
        expenses: Math.max(0, report?.totalExpenses ?? 0),
      };
    });
  }, [data]);

  const highestAmount = useMemo(() => {
    return Math.max(
      0,
      ...months.flatMap((month) => [month.income, month.expenses]),
    );
  }, [months]);

  const totalIncome = months.reduce((sum, month) => sum + month.income, 0);

  const totalExpenses = months.reduce((sum, month) => sum + month.expenses, 0);

  const hasTransactions = months.some(
    (month) => month.income > 0 || month.expenses > 0,
  );

  const chartWidth = MONTH_WIDTH * 12;

  // Keep bars within chart bounds.
  const maxValue = highestAmount > 0 ? highestAmount : 1;

  const getBarHeight = (amount: number): number => {
    return (amount / maxValue) * GRAPH_HEIGHT;
  };

  return (
    <View style={styles.container}>
      {/* Chart header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>

        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {/* Income / Expense legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendIndicator,
              {
                backgroundColor: colors.success,
              },
            ]}
          />

          <Text style={styles.legendText}>Income</Text>
        </View>

        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendIndicator,
              {
                backgroundColor: colors.error,
              },
            ]}
          />

          <Text style={styles.legendText}>Expenses</Text>
        </View>
      </View>

      {!hasTransactions ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No transactions for this year</Text>

          <Text style={styles.emptyDescription}>
            Your monthly income and expenses will appear here when you add
            transactions.
          </Text>
        </View>
      ) : (
        <>
          {/* Scroll horizontally on narrow screens */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chartScrollContent}
            accessibilityLabel={"Monthly income versus expenses chart"}
          >
            <Svg
              width={chartWidth}
              height={CHART_HEIGHT}
              viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
            >
              {/* Horizontal guide lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = GRAPH_BOTTOM - ratio * GRAPH_HEIGHT;

                return (
                  <Line
                    key={ratio}
                    x1={0}
                    y1={y}
                    x2={chartWidth}
                    y2={y}
                    stroke={colors.border}
                    strokeWidth={1}
                    strokeDasharray={ratio === 0 ? undefined : "4 4"}
                  />
                );
              })}

              {/* Monthly bar pairs */}
              {months.map((month, index) => {
                const groupX = index * MONTH_WIDTH;

                const incomeHeight = getBarHeight(month.income);

                const expenseHeight = getBarHeight(month.expenses);

                return (
                  <React.Fragment key={month.month}>
                    {/* Income bar */}
                    <Rect
                      x={groupX + 14}
                      y={GRAPH_BOTTOM - incomeHeight}
                      width={BAR_WIDTH}
                      height={incomeHeight}
                      rx={4}
                      fill={colors.success}
                    />

                    {/* Expense bar */}
                    <Rect
                      x={groupX + 37}
                      y={GRAPH_BOTTOM - expenseHeight}
                      width={BAR_WIDTH}
                      height={expenseHeight}
                      rx={4}
                      fill={colors.error}
                    />

                    {/* Month label */}
                    <SvgText
                      x={groupX + MONTH_WIDTH / 2}
                      y={GRAPH_BOTTOM + 25}
                      fontSize={12}
                      textAnchor="middle"
                      fill={colors.textSecondary}
                    >
                      {month.name}
                    </SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
          </ScrollView>

          <Text style={styles.scrollHint}>
            Swipe left or right to view all months.
          </Text>

          {/* Yearly totals */}
          <View style={styles.totalsRow}>
            <View style={styles.totalColumn}>
              <Text style={styles.totalLabel}>Total Income</Text>

              <Text
                style={[
                  styles.totalValue,
                  {
                    color: colors.success,
                  },
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {formatINR(totalIncome)}
              </Text>
            </View>

            <View style={styles.totalColumn}>
              <Text style={styles.totalLabel}>Total Expenses</Text>

              <Text
                style={[
                  styles.totalValue,
                  {
                    color: colors.error,
                  },
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {formatINR(totalExpenses)}
              </Text>
            </View>
          </View>

          {/* Accessible month-by-month data */}
          <View style={styles.monthlyDetails}>
            <Text style={styles.detailsTitle}>Monthly Details</Text>

            {months.map((month) => (
              <View key={month.month} style={styles.monthRow}>
                <Text style={styles.monthName}>{month.name}</Text>

                <View style={styles.monthAmounts}>
                  <Text style={styles.monthIncome}>
                    +{formatINR(month.income)}
                  </Text>

                  <Text style={styles.monthExpense}>
                    −{formatINR(month.expenses)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      minWidth: 0,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      padding: spacing.xl,
    },

    header: {
      marginBottom: spacing.md,
    },

    title: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    subtitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },

    legendRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: spacing.xl,
      marginBottom: spacing.lg,
    },

    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },

    legendIndicator: {
      width: 12,
      height: 12,
      borderRadius: 3,
    },

    legendText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.text,
    },

    chartScrollContent: {
      paddingBottom: spacing.sm,
    },

    scrollHint: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },

    totalsRow: {
      flexDirection: "row",
      gap: spacing.md,
      paddingVertical: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },

    totalColumn: {
      flex: 1,
      minWidth: 0,
    },

    totalLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },

    totalValue: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.bold,
    },

    monthlyDetails: {
      marginTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.lg,
    },

    detailsTitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.text,
      marginBottom: spacing.md,
    },

    monthRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },

    monthName: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
      color: colors.text,
      minWidth: 36,
    },

    monthAmounts: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: spacing.lg,
      flex: 1,
    },

    monthIncome: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
      color: colors.success,
    },

    monthExpense: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
      color: colors.error,
    },

    emptyContainer: {
      minHeight: 180,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },

    emptyTitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.text,
      textAlign: "center",
    },

    emptyDescription: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 21,
    },
  });
}
