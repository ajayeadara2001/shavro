import React, { useMemo, useState } from "react";

import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react-native";

import { useAppTheme } from "../context/ThemeContext";

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from "../constants/theme";

interface ReportDatePickerProps {
  label: string;
  value: string;
  onChange: (date: string) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day)
  ) {
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(12, 0, 0, 0);

    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  return new Date();
}

function displayDate(value: string): string {
  return parseDate(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ReportDatePicker({
  label,
  value,
  onChange,
}: ReportDatePickerProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [visible, setVisible] = useState(false);

  const [viewYear, setViewYear] = useState(parseDate(value).getFullYear());

  const [viewMonth, setViewMonth] = useState(parseDate(value).getMonth());

  const openCalendar = () => {
    const date = parseDate(value);

    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
    setVisible(true);
  };

  const changeMonth = (offset: number) => {
    const next = new Date(viewYear, viewMonth + offset, 1);

    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const selectDay = (day: number) => {
    onChange(formatDate(viewYear, viewMonth, day));
    setVisible(false);
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    "en-GB",
    {
      month: "long",
      year: "numeric",
    },
  );

  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const numberOfCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const days = Array.from(
    { length: numberOfCells },
    (_, index) => index - firstWeekday + 1,
  );

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>

        <Pressable
          onPress={openCalendar}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${displayDate(value)}`}
          style={styles.dateButton}
        >
          <Text style={styles.dateText}>{displayDate(value)}</Text>

          <CalendarDays size={20} color={colors.primary} />
        </Pressable>
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.calendar}>
            <View style={styles.header}>
              <Text style={styles.title}>{label}</Text>

              <Pressable
                onPress={() => setVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close calendar"
                style={styles.iconButton}
              >
                <X size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.monthRow}>
              <Pressable
                onPress={() => changeMonth(-1)}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={styles.iconButton}
              >
                <ChevronLeft size={22} color={colors.text} />
              </Pressable>

              <Text style={styles.monthTitle}>{monthLabel}</Text>

              <Pressable
                onPress={() => changeMonth(1)}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={styles.iconButton}
              >
                <ChevronRight size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.grid}>
              {WEEKDAYS.map((day) => (
                <View key={day} style={styles.dayCell}>
                  <Text style={styles.weekday}>{day}</Text>
                </View>
              ))}

              {days.map((day, index) => {
                if (day < 1 || day > daysInMonth) {
                  return <View key={`empty-${index}`} style={styles.dayCell} />;
                }

                const dateString = formatDate(viewYear, viewMonth, day);

                const selected = dateString === value;

                return (
                  <View key={dateString} style={styles.dayCell}>
                    <Pressable
                      onPress={() => selectDay(day)}
                      accessibilityRole="button"
                      accessibilityLabel={displayDate(dateString)}
                      accessibilityState={{ selected }}
                      style={[styles.dayButton, selected && styles.selectedDay]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          selected && styles.selectedDayText,
                        ]}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    field: {
      width: "100%",
      gap: spacing.sm,
    },

    label: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
      color: colors.text,
    },

    dateButton: {
      minHeight: 54,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },

    dateText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.text,
    },

    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
    },

    calendar: {
      width: "100%",
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: radius.large,
      padding: spacing.lg,
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },

    title: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    monthRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },

    monthTitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    iconButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },

    dayCell: {
      width: "14.2857%",
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },

    weekday: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.caption,
      color: colors.textSecondary,
    },

    dayButton: {
      width: 39,
      height: 39,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.medium,
    },

    selectedDay: {
      backgroundColor: colors.primary,
    },

    dayText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.text,
    },

    selectedDayText: {
      fontWeight: typography.weights.bold,
      color: "#FFFFFF",
    },
  });
}
