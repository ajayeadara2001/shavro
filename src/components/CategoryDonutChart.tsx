import React, { useMemo } from "react";

import { StyleSheet, Text, View } from "react-native";

import Svg, { Circle } from "react-native-svg";

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

import type { CategoryReport } from "../utils/financialReports";

import { formatINR, toPaise, toRupees } from "../utils/money";

interface CategoryDonutChartProps {
  title: string;
  subtitle?: string;
  data: CategoryReport[];
}

interface ChartSegment {
  id: string;
  name: string;
  amount: number;
  percentage: number;
  color: string;
  dashLength: number;
  dashOffset: number;
}

const CHART_SIZE = 220;
const CENTER = CHART_SIZE / 2;
const RADIUS = 78;
const STROKE_WIDTH = 28;

const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Consistent category colors across reports.
const CHART_COLORS = [
  "#2563EB",
  "#16A34A",
  "#F59E0B",
  "#A855F7",
  "#EF4444",
  "#06B6D4",
  "#EC4899",
  "#64748B",
  "#84CC16",
  "#F97316",
];

export default function CategoryDonutChart({
  title,
  subtitle,
  data,
}: CategoryDonutChartProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const totalPaise = useMemo(() => {
    return data.reduce(
      (total, category) => total + Math.max(0, toPaise(category.totalAmount)),
      0,
    );
  }, [data]);

  const totalAmount = toRupees(totalPaise);

  const segments = useMemo(() => {
    const result: ChartSegment[] = [];

    let accumulatedLength = 0;

    const validCategories = data.filter((category) => category.totalAmount > 0);

    validCategories.forEach((category, index) => {
      const amountPaise = toPaise(category.totalAmount);

      const share = totalPaise > 0 ? amountPaise / totalPaise : 0;

      const dashLength = share * CIRCUMFERENCE;

      result.push({
        id: category.categoryId,
        name: category.categoryName,
        amount: category.totalAmount,
        percentage: share * 100,
        color: CHART_COLORS[index % CHART_COLORS.length],
        dashLength,
        dashOffset: -accumulatedLength,
      });

      accumulatedLength += dashLength;
    });

    return result;
  }, [data, totalPaise]);

  const hasExpenses = totalPaise > 0 && segments.length > 0;

  return (
    <View style={styles.container}>
      {/* Heading */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>

        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {!hasExpenses ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No expenses recorded</Text>

          <Text style={styles.emptyDescription}>
            Your spending breakdown will appear here when you add expenses for
            this period.
          </Text>
        </View>
      ) : (
        <View style={styles.chartContent}>
          {/* Circular spending chart */}
          <View
            style={styles.chartWrapper}
            accessible
            accessibilityLabel={
              `Category spending chart. Total expenses: ` +
              formatINR(totalAmount)
            }
          >
            <Svg
              width={CHART_SIZE}
              height={CHART_SIZE}
              viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`}
            >
              {/* Background circle */}
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={colors.border}
                strokeWidth={STROKE_WIDTH}
              />

              {/* Spending segments */}
              {segments.map((segment) => (
                <Circle
                  key={segment.id}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={
                    `${segment.dashLength} ` + `${CIRCUMFERENCE}`
                  }
                  strokeDashoffset={segment.dashOffset}
                  rotation={-90}
                  originX={CENTER}
                  originY={CENTER}
                />
              ))}
            </Svg>

            {/* Center text */}
            <View style={styles.centerContent} pointerEvents="none">
              <Text style={styles.centerLabel}>Total Spent</Text>

              <Text
                style={styles.centerAmount}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {formatINR(totalAmount)}
              </Text>
            </View>
          </View>

          {/* Category legend */}
          <View style={styles.legend}>
            {segments.map((segment) => (
              <View key={segment.id} style={styles.legendItem}>
                <View style={styles.legendTopRow}>
                  <View
                    style={[
                      styles.colorIndicator,
                      {
                        backgroundColor: segment.color,
                      },
                    ]}
                  />

                  <Text style={styles.categoryName} numberOfLines={2}>
                    {segment.name}
                  </Text>

                  <Text style={styles.percentage}>
                    {segment.percentage.toFixed(1)}%
                  </Text>
                </View>

                <Text style={styles.categoryAmount}>
                  {formatINR(segment.amount)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      minWidth: 0,
      padding: spacing.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
    },

    header: {
      marginBottom: spacing.lg,
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

    chartContent: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xl,
    },

    chartWrapper: {
      width: CHART_SIZE,
      height: CHART_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },

    centerContent: {
      position: "absolute",
      left: 48,
      right: 48,
      top: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
    },

    centerLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      textAlign: "center",
    },

    centerAmount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.bold,
      color: colors.text,
      textAlign: "center",
      marginTop: spacing.xs,
    },

    legend: {
      flex: 1,
      minWidth: 180,
      gap: spacing.md,
    },

    legendItem: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: spacing.sm,
    },

    legendTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },

    colorIndicator: {
      width: 12,
      height: 12,
      borderRadius: 4,
      flexShrink: 0,
    },

    categoryName: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.text,
    },

    percentage: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    categoryAmount: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      marginLeft: 20,
    },

    emptyContainer: {
      minHeight: 170,
      justifyContent: "center",
      alignItems: "center",
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
