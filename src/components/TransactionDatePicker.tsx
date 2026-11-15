
import React, { useRef, useState } from 'react';

import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';

import {
  colors,
  radius,
  spacing,
  typography,
} from '../constants/theme';

interface TransactionDatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

// Example: 15 Nov 2026
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Example: 2026-11-15
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export default function TransactionDatePicker({
  value,
  onChange,
}: TransactionDatePickerProps) {
  const [showPicker, setShowPicker] = useState(false);

  const webInputRef = useRef<any>(null);

  const today = new Date();

  const handleNativeChange = (
    _event: unknown,
    selectedDate?: Date,
  ) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }

    if (
      selectedDate &&
      !Number.isNaN(selectedDate.getTime()) &&
      toLocalDateString(selectedDate) <=
        toLocalDateString(new Date())
    ) {
      onChange(selectedDate);
    }
  };

  const handleWebDateChange = (event: any) => {
    const dateString = event.target.value;

    if (!dateString) {
      return;
    }

    const [year, month, day] = dateString
      .split('-')
      .map(Number);

    const selected = new Date(
      year,
      month - 1,
      day,
    );

    if (
      !Number.isNaN(selected.getTime()) &&
      toLocalDateString(selected) === dateString &&
      dateString <= toLocalDateString(new Date())
    ) {
      onChange(selected);
    }
  };

  const openWebCalendar = () => {
    const input = webInputRef.current;

    if (!input) {
      return;
    }

    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // Fall back to focusing the input.
      }
    }

    input.focus();
    input.click();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Date</Text>

      {Platform.OS === 'web' ? (
        <View style={styles.webContainer}>
          <Pressable
            style={styles.webField}
            onPress={openWebCalendar}
            accessibilityRole="button"
            accessibilityLabel={`Select transaction date, ${formatDate(value)}`}
          >
            <CalendarDays
              size={20}
              color={colors.textSecondary}
            />

            <Text style={styles.dateText}>
              {formatDate(value)}
            </Text>
          </Pressable>

          {React.createElement('input', {
            ref: webInputRef,
            type: 'date',
            value: toLocalDateString(value),
            max: toLocalDateString(today),
            'aria-label': 'Choose transaction date',
            onChange: handleWebDateChange,
            style: {
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 1,
              height: 1,
              opacity: 0,
              border: 'none',
              padding: 0,
              pointerEvents: 'none',
            },
          })}
        </View>
      ) : (
        <>
          <Pressable
            style={styles.dateField}
            onPress={() => setShowPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Transaction date ${formatDate(value)}`}
          >
            <CalendarDays
              size={20}
              color={colors.textSecondary}
            />

            <Text style={styles.dateText}>
              {formatDate(value)}
            </Text>
          </Pressable>

          {showPicker && (
            <DateTimePicker
              value={value}
              mode="date"
              display={
                Platform.OS === 'ios'
                  ? 'spinner'
                  : 'default'
              }
              maximumDate={today}
              onChange={handleNativeChange}
            />
          )}

          {showPicker && Platform.OS === 'ios' && (
            <Pressable
              onPress={() => setShowPicker(false)}
              accessibilityRole="button"
              style={styles.doneButton}
            >
              <Text style={styles.doneText}>
                Done
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  label: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium,
    color: colors.text,
    marginBottom: spacing.sm,
  },

  webContainer: {
    width: '100%',
    position: 'relative',
  },

  webField: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },

  dateField: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },

  dateText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    color: colors.text,
  },

  doneButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },

  doneText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
    color: colors.primary,
  },
});
