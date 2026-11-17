import React, { useEffect, useMemo, useState } from "react";

import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react-native";

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

import {
  type TransactionFilters,
  type TransactionSortOption,
  type TransactionTypeFilter,
  countActiveFilters,
  resetTransactionFilters,
} from "../utils/transactionFilters";

export interface FilterOption {
  id: string;
  name: string;
}

interface TransactionFilterPanelProps {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  availableYears: number[];
  categories: FilterOption[];
  paymentMethods: FilterOption[];
}

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

const SORT_OPTIONS: {
  id: TransactionSortOption;
  name: string;
}[] = [
  { id: "newest", name: "Newest first" },
  { id: "oldest", name: "Oldest first" },
  { id: "amount_high", name: "Highest amount" },
  { id: "amount_low", name: "Lowest amount" },
];

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  return (
    year >= 100 &&
    year <= 9999 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function formatAmountDraft(amount: number | null): string {
  return amount === null ? "" : String(amount);
}

function parseAmountDraft(value: string): number | null {
  const trimmed = value.trim();

  if (trimmed === "") {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

export default function TransactionFilterPanel({
  filters,
  onChange,
  availableYears,
  categories,
  paymentMethods,
}: TransactionFilterPanelProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [expanded, setExpanded] = useState(false);

  // Amount inputs retain their text while typing.
  const [minAmountInput, setMinAmountInput] = useState(
    formatAmountDraft(filters.minAmount),
  );

  const [maxAmountInput, setMaxAmountInput] = useState(
    formatAmountDraft(filters.maxAmount),
  );

  // Date inputs retain their text until applied.
  const [startDateInput, setStartDateInput] = useState(filters.startDate ?? "");

  const [endDateInput, setEndDateInput] = useState(filters.endDate ?? "");

  const [dateError, setDateError] = useState("");

  const activeCount = countActiveFilters(filters);

  // Synchronize amount inputs when applied filters
  // change externally or when Clear All is used.
  useEffect(() => {
    setMinAmountInput(formatAmountDraft(filters.minAmount));
  }, [filters.minAmount]);

  useEffect(() => {
    setMaxAmountInput(formatAmountDraft(filters.maxAmount));
  }, [filters.maxAmount]);

  useEffect(() => {
    setStartDateInput(filters.startDate ?? "");
  }, [filters.startDate]);

  useEffect(() => {
    setEndDateInput(filters.endDate ?? "");
  }, [filters.endDate]);

  // Validate the actual text visible in the inputs.
  const amountRangeInvalid = useMemo(() => {
    const minimumText = minAmountInput.trim();
    const maximumText = maxAmountInput.trim();

    if (
      minimumText === "" ||
      maximumText === "" ||
      minimumText === "." ||
      maximumText === "."
    ) {
      return false;
    }

    const minimum = Number(minimumText);
    const maximum = Number(maximumText);

    return (
      Number.isFinite(minimum) && Number.isFinite(maximum) && minimum > maximum
    );
  }, [minAmountInput, maxAmountInput]);

  const incompleteAmount =
    minAmountInput.trim() === "." || maxAmountInput.trim() === ".";

  // Tell the user when typed values have not
  // yet been applied to transaction filtering.
  const hasPendingAmountChanges =
    minAmountInput !== formatAmountDraft(filters.minAmount) ||
    maxAmountInput !== formatAmountDraft(filters.maxAmount);

  const updateFilters = (changes: Partial<TransactionFilters>): void => {
    onChange({
      ...filters,
      ...changes,
    });
  };

  const clearDateInputs = (): void => {
    setStartDateInput("");
    setEndDateInput("");
    setDateError("");
  };

  const clearAll = (): void => {
    onChange(resetTransactionFilters());

    setMinAmountInput("");
    setMaxAmountInput("");

    clearDateInputs();

    Keyboard.dismiss();
  };

  // Keep decimal characters while typing.
  // Do not change active financial filters here.
  const updateAmount = (
    field: "minAmount" | "maxAmount",
    text: string,
  ): void => {
    const cleaned = text.replace(/[^0-9.]/g, "");

    if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) {
      return;
    }

    if (field === "minAmount") {
      setMinAmountInput(cleaned);
    } else {
      setMaxAmountInput(cleaned);
    }
  };

  // Apply both limits together only if valid.
  const applyAmountRange = (): void => {
    if (amountRangeInvalid || incompleteAmount) {
      return;
    }

    const minimum = parseAmountDraft(minAmountInput);

    const maximum = parseAmountDraft(maxAmountInput);

    updateFilters({
      minAmount: minimum,
      maxAmount: maximum,
    });

    Keyboard.dismiss();
  };

  const updateMonth = (month: number | null): void => {
    clearDateInputs();

    updateFilters({
      month,
      startDate: null,
      endDate: null,
    });
  };

  const updateYear = (year: number | null): void => {
    clearDateInputs();

    updateFilters({
      year,
      startDate: null,
      endDate: null,
    });
  };

  const applyDateRange = (): void => {
    const start = startDateInput.trim();
    const end = endDateInput.trim();

    if (start && !isValidDate(start)) {
      setDateError("Enter a valid start date (YYYY-MM-DD).");
      return;
    }

    if (end && !isValidDate(end)) {
      setDateError("Enter a valid end date (YYYY-MM-DD).");
      return;
    }

    if (start && end && start > end) {
      setDateError("Start date cannot be after end date.");
      return;
    }

    setDateError("");

    // A custom date range replaces month/year.
    updateFilters({
      startDate: start || null,
      endDate: end || null,
      month: null,
      year: null,
    });

    Keyboard.dismiss();
  };

  const renderChip = (
    label: string,
    selected: boolean,
    onPress: () => void,
    key?: string,
  ) => (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.selectedChip]}
    >
      <Text style={[styles.chipText, selected && styles.selectedChipText]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* Search and filter toggle */}
      <View style={styles.topRow}>
        <View style={styles.searchContainer}>
          <Search size={19} color={colors.textSecondary} />

          <TextInput
            style={styles.searchInput}
            value={filters.search}
            onChangeText={(search) => updateFilters({ search })}
            placeholder="Search transactions"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            accessibilityLabel="Search transactions"
          />
        </View>

        <Pressable
          onPress={() => setExpanded((previous) => !previous)}
          style={[styles.filterButton, expanded && styles.filterButtonActive]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Close filters" : "Open filters"}
          accessibilityState={{ expanded }}
        >
          <SlidersHorizontal size={19} color={colors.primary} />

          <Text style={styles.filterButtonText}>
            Filters
            {activeCount > 0 ? ` (${activeCount})` : ""}
          </Text>

          {expanded ? (
            <ChevronUp size={16} color={colors.primary} />
          ) : (
            <ChevronDown size={16} color={colors.primary} />
          )}
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelHeading}>Filter transactions</Text>

            <Pressable
              onPress={clearAll}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
            >
              <RotateCcw size={16} color={colors.primary} />

              <Text style={styles.clearText}>Clear All</Text>
            </Pressable>
          </View>

          {/* Transaction type */}
          <View style={styles.section}>
            <Text style={styles.label}>Transaction Type</Text>

            <View style={styles.chipGrid}>
              {(
                [
                  ["ALL", "All"],
                  ["INCOME", "Income"],
                  ["EXPENSE", "Expenses"],
                ] as [TransactionTypeFilter, string][]
              ).map(([type, label]) =>
                renderChip(
                  label,
                  filters.type === type,
                  () => updateFilters({ type }),
                  type,
                ),
              )}
            </View>
          </View>

          {/* Month */}
          <View style={styles.section}>
            <Text style={styles.label}>Month</Text>

            <View style={styles.chipGrid}>
              {renderChip("All Months", filters.month === null, () =>
                updateMonth(null),
              )}

              {MONTHS.map((month, index) =>
                renderChip(
                  month,
                  filters.month === index + 1,
                  () =>
                    updateMonth(filters.month === index + 1 ? null : index + 1),
                  String(index + 1),
                ),
              )}
            </View>
          </View>

          {/* Year */}
          <View style={styles.section}>
            <Text style={styles.label}>Year</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.horizontalChips}
            >
              {renderChip("All Years", filters.year === null, () =>
                updateYear(null),
              )}

              {[...new Set(availableYears)]
                .sort((a, b) => b - a)
                .map((year) =>
                  renderChip(
                    String(year),
                    filters.year === year,
                    () => updateYear(filters.year === year ? null : year),
                    String(year),
                  ),
                )}
            </ScrollView>
          </View>

          {/* Custom date range */}
          <View style={styles.section}>
            <Text style={styles.label}>Custom Date Range</Text>

            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>From</Text>

                <TextInput
                  style={styles.input}
                  value={startDateInput}
                  onChangeText={(text) => {
                    setStartDateInput(text);
                    setDateError("");
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={10}
                  autoCapitalize="none"
                  accessibilityLabel="Start date"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>To</Text>

                <TextInput
                  style={styles.input}
                  value={endDateInput}
                  onChangeText={(text) => {
                    setEndDateInput(text);
                    setDateError("");
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={10}
                  autoCapitalize="none"
                  accessibilityLabel="End date"
                />
              </View>
            </View>

            {dateError ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {dateError}
              </Text>
            ) : null}

            <Pressable
              style={styles.applyButton}
              onPress={applyDateRange}
              accessibilityRole="button"
              accessibilityLabel="Apply date range"
            >
              <Text style={styles.applyButtonText}>Apply Date Range</Text>
            </Pressable>
          </View>

          {/* Category */}
          <View style={styles.section}>
            <Text style={styles.label}>Category</Text>

            <View style={styles.chipGrid}>
              {renderChip("All Categories", filters.categoryId === null, () =>
                updateFilters({
                  categoryId: null,
                }),
              )}

              {categories.map((category) =>
                renderChip(
                  category.name,
                  filters.categoryId === category.id,
                  () =>
                    updateFilters({
                      categoryId:
                        filters.categoryId === category.id ? null : category.id,
                    }),
                  category.id,
                ),
              )}
            </View>
          </View>

          {/* Payment method */}
          <View style={styles.section}>
            <Text style={styles.label}>Payment Method</Text>

            <Text style={styles.helperText}>Applies to expenses only.</Text>

            <View style={styles.chipGrid}>
              {renderChip("All Methods", filters.paymentMethodId === null, () =>
                updateFilters({
                  paymentMethodId: null,
                }),
              )}

              {paymentMethods.map((method) =>
                renderChip(
                  method.name,
                  filters.paymentMethodId === method.id,
                  () =>
                    updateFilters({
                      paymentMethodId:
                        filters.paymentMethodId === method.id
                          ? null
                          : method.id,
                    }),
                  method.id,
                ),
              )}
            </View>
          </View>

          {/* Amount range */}
          <View style={styles.section}>
            <Text style={styles.label}>Amount Range</Text>

            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Minimum (₹)</Text>

                <TextInput
                  style={[
                    styles.input,
                    amountRangeInvalid && styles.invalidInput,
                  ]}
                  value={minAmountInput}
                  onChangeText={(text) => updateAmount("minAmount", text)}
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  accessibilityLabel="Minimum amount"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Maximum (₹)</Text>

                <TextInput
                  style={[
                    styles.input,
                    amountRangeInvalid && styles.invalidInput,
                  ]}
                  value={maxAmountInput}
                  onChangeText={(text) => updateAmount("maxAmount", text)}
                  placeholder="Any"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  accessibilityLabel="Maximum amount"
                />
              </View>
            </View>

            {/* Visible validation below both inputs */}
            {amountRangeInvalid && (
              <View style={styles.amountErrorContainer}>
                <Text style={styles.errorText} accessibilityRole="alert">
                  Minimum amount cannot exceed maximum amount.
                </Text>
              </View>
            )}

            {incompleteAmount && (
              <Text style={styles.errorText}>
                Please complete the amount value.
              </Text>
            )}

            {hasPendingAmountChanges &&
              !amountRangeInvalid &&
              !incompleteAmount && (
                <Text style={styles.helperTextBelow}>
                  Press Apply Amount Range to update your results.
                </Text>
              )}

            <Pressable
              style={[
                styles.applyButton,
                (amountRangeInvalid || incompleteAmount) &&
                  styles.disabledButton,
              ]}
              onPress={applyAmountRange}
              disabled={amountRangeInvalid || incompleteAmount}
              accessibilityRole="button"
              accessibilityLabel="Apply amount range"
              accessibilityState={{
                disabled: amountRangeInvalid || incompleteAmount,
              }}
            >
              <Text style={styles.applyButtonText}>Apply Amount Range</Text>
            </Pressable>

            {hasPendingAmountChanges && (
              <Text style={styles.helperTextBelow}>
                Previously applied amount limits remain active until you apply
                valid changes.
              </Text>
            )}
          </View>

          {/* Sorting */}
          <View style={styles.section}>
            <Text style={styles.label}>Sort By</Text>

            <View style={styles.chipGrid}>
              {SORT_OPTIONS.map((option) =>
                renderChip(
                  option.name,
                  filters.sortBy === option.id,
                  () =>
                    updateFilters({
                      sortBy: option.id,
                    }),
                  option.id,
                ),
              )}
            </View>
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
      marginBottom: spacing.xl,
    },

    topRow: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: spacing.sm,
    },

    searchContainer: {
      flex: 1,
      minWidth: 190,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
    },

    searchInput: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      paddingVertical: spacing.sm,
    },

    filterButton: {
      minHeight: 48,
      paddingHorizontal: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
    },

    filterButtonActive: {
      borderColor: colors.primary,
    },

    filterButtonText: {
      color: colors.primary,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
    },

    panel: {
      width: "100%",
      marginTop: spacing.md,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      backgroundColor: colors.surface,
    },

    panelHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },

    panelHeading: {
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    clearButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },

    clearText: {
      color: colors.primary,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
    },

    section: {
      marginTop: spacing.lg,
      minWidth: 0,
    },

    label: {
      color: colors.text,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      marginBottom: spacing.md,
    },

    helperText: {
      color: colors.textSecondary,
      fontSize: typography.sizes.small,
      marginBottom: spacing.md,
    },

    helperTextBelow: {
      color: colors.textSecondary,
      fontSize: typography.sizes.small,
      marginTop: spacing.sm,
      lineHeight: 20,
    },

    chipGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },

    horizontalChips: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingRight: spacing.md,
    },

    chip: {
      minHeight: 42,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      backgroundColor: colors.background,
    },

    selectedChip: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },

    chipText: {
      color: colors.text,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
    },

    selectedChipText: {
      color: colors.primary,
      fontWeight: typography.weights.semibold,
    },

    fieldRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
    },

    field: {
      flex: 1,
      minWidth: 140,
    },

    fieldLabel: {
      color: colors.textSecondary,
      fontSize: typography.sizes.small,
      marginBottom: spacing.sm,
    },

    input: {
      width: "100%",
      minHeight: 48,
      paddingHorizontal: spacing.md,
      color: colors.text,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      fontSize: typography.sizes.body,
    },

    invalidInput: {
      borderColor: colors.error,
    },

    amountErrorContainer: {
      width: "100%",
      marginTop: spacing.sm,
    },

    errorText: {
      color: colors.error,
      fontSize: typography.sizes.small,
      marginTop: spacing.sm,
      lineHeight: 20,
    },

    applyButton: {
      alignSelf: "flex-start",
      minHeight: 44,
      marginTop: spacing.md,
      paddingHorizontal: spacing.lg,
      justifyContent: "center",
      backgroundColor: colors.primary,
      borderRadius: radius.medium,
    },

    disabledButton: {
      opacity: 0.45,
    },

    applyButtonText: {
      color: colors.background,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
    },
  });
}
