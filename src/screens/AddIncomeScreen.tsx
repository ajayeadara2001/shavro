import React, { useMemo, useRef, useState } from "react";

import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import AmountInput from "../components/AmountInput";
import CategorySelector from "../components/CategorySelector";
import PaymentMethodSelector from "../components/PaymentMethodSelector";
import PrimaryButton from "../components/PrimaryButton";
import TransactionDatePicker from "../components/TransactionDatePicker";

import { defaultIncomeCategories } from "../constants/incomeCategories";

import { saveIncome, updateIncome } from "../services/incomeStorage";

import type { Income, CreateIncomeInput } from "../types/income";

import {
  type ThemeColors,
  layout,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

interface AddIncomeScreenProps {
  incomeToEdit?: Income | null;
  onEditComplete?: () => void;
  onSaveComplete?: () => void;
}

function showMessage(title: string, message: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.alert(`${title}\n\n${message}`);
    }
    return;
  }

  Alert.alert(title, message);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

export default function AddIncomeScreen({
  incomeToEdit = null,
  onEditComplete,
  onSaveComplete,
}: AddIncomeScreenProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const isEditing = incomeToEdit !== null;

  const [amount, setAmount] = useState(
    incomeToEdit ? String(incomeToEdit.amount) : "",
  );

  // Supports built-in and custom income categories.
  const [categoryId, setCategoryId] = useState<string | null>(
    incomeToEdit?.categoryId ?? null,
  );

  // Received Via: shared with expense payment methods.
  // Older income records may not have this value.
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(
    incomeToEdit?.paymentMethodId ?? null,
  );

  // Manual name when "Other" is selected.
  const [otherMethodName, setOtherMethodName] = useState(
    incomeToEdit?.otherMethodName ?? "",
  );

  // Independent income description.
  const [incomeName, setIncomeName] = useState(incomeToEdit?.incomeName ?? "");

  const [transactionDate, setTransactionDate] = useState(
    incomeToEdit ? parseLocalDate(incomeToEdit.transactionDate) : new Date(),
  );

  const [notes, setNotes] = useState(incomeToEdit?.notes ?? "");

  const [saving, setSaving] = useState(false);

  const savingRef = useRef(false);

  // Clear the form after a successful new income.
  const resetForm = (): void => {
    setAmount("");
    setCategoryId(null);
    setPaymentMethodId(null);
    setOtherMethodName("");
    setIncomeName("");
    setTransactionDate(new Date());
    setNotes("");
  };

  const handleSave = async (): Promise<void> => {
    if (savingRef.current) {
      return;
    }

    const numericAmount = Number(amount);

    // Amount must be positive.
    if (
      !amount.trim() ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      showMessage(
        "Invalid Amount",
        "Please enter an amount greater than zero.",
      );
      return;
    }

    // Income category is required.
    if (!categoryId) {
      showMessage("Category Required", "Please select an income category.");
      return;
    }

    // A name is required for built-in Other category.
    if (categoryId === "other" && !incomeName.trim()) {
      showMessage(
        "Income Name Required",
        "Please enter a name for this income.",
      );
      return;
    }

    // Require Received Via for new income records.
    //
    // Older records can still be edited without
    // choosing a method, preserving historical data.
    if (!paymentMethodId && !isEditing) {
      showMessage(
        "Received Via Required",
        "Please select how you received this income.",
      );
      return;
    }

    // Manual method name is required for Other.
    if (paymentMethodId === "other" && !otherMethodName.trim()) {
      showMessage(
        "Payment Method Name Required",
        "Please enter how you received this income.",
      );
      return;
    }

    // Check date validity.
    if (Number.isNaN(transactionDate.getTime())) {
      showMessage("Invalid Date", "Please select a valid transaction date.");
      return;
    }

    const selectedDate = formatLocalDate(transactionDate);

    if (selectedDate > formatLocalDate(new Date())) {
      showMessage(
        "Invalid Date",
        "Please select a date that is not in the future.",
      );
      return;
    }

    // Preserve custom IDs exactly.
    // Save manual method name only for "Other".
    const input: CreateIncomeInput = {
      amount: numericAmount,
      categoryId,
      incomeName: incomeName.trim() || null,

      paymentMethodId: paymentMethodId ?? null,

      otherMethodName:
        paymentMethodId === "other" ? otherMethodName.trim() : null,

      transactionDate: selectedDate,
      notes: notes.trim(),
    };

    savingRef.current = true;
    setSaving(true);

    try {
      if (incomeToEdit) {
        await updateIncome(incomeToEdit.id, input);

        showMessage("Success", "Income updated successfully!");

        onEditComplete?.();
      } else {
        await saveIncome(input);

        resetForm();

        showMessage("Success", "Income saved successfully!");

        onSaveComplete?.();
      }
    } catch (error) {
      console.error(
        isEditing ? "Income update failed:" : "Income save failed:",
        error,
      );

      showMessage(
        isEditing ? "Update Failed" : "Save Failed",
        isEditing
          ? "Unable to update income. Please try again."
          : "Unable to save income. Please try again.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.heading}>
            {isEditing ? "Edit Income" : "Add Income"}
          </Text>

          {/* Amount */}
          <AmountInput value={amount} onChangeValue={setAmount} />

          {/* Income Category */}
          <View style={styles.section}>
            <CategorySelector
              scope="INCOME"
              categories={defaultIncomeCategories}
              selectedCategoryId={categoryId}
              onSelectCategory={setCategoryId}
            />
          </View>

          {/* Received Via */}
          <View style={styles.section}>
            <PaymentMethodSelector
              title="Received Via"
              selectedMethodId={paymentMethodId}
              onSelectMethod={setPaymentMethodId}
              otherMethodName={otherMethodName}
              onOtherMethodNameChange={setOtherMethodName}
            />

            {/* Inform users editing historical income */}
            {isEditing && !paymentMethodId && (
              <Text style={styles.helperText}>
                No payment method was recorded for this income. You can add one
                now or leave it unchanged.
              </Text>
            )}
          </View>

          {/* Income Name */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Income name {categoryId === "other" ? "(required)" : "(optional)"}
            </Text>

            <TextInput
              style={styles.input}
              value={incomeName}
              onChangeText={setIncomeName}
              placeholder="E.g., November salary"
              placeholderTextColor={colors.textSecondary}
              maxLength={60}
              accessibilityLabel="Income name"
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>

          {/* Transaction Date */}
          <View style={styles.section}>
            <TransactionDatePicker
              value={transactionDate}
              onChange={setTransactionDate}
            />
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>Notes (optional)</Text>

            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note about this income"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={300}
              textAlignVertical="top"
              accessibilityLabel="Income notes"
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>

          {/* Save / Update */}
          <View style={styles.saveContainer}>
            <PrimaryButton
              title={isEditing ? "Update Income" : "Save Income"}
              onPress={handleSave}
              loading={saving}
              disabled={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },

    flex: {
      flex: 1,
    },

    content: {
      flexGrow: 1,
      width: "100%",
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xxl,
    },

    heading: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.heading,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginBottom: spacing.xl,
    },

    section: {
      marginTop: spacing.xl,
    },

    label: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
      marginBottom: spacing.sm,
    },

    input: {
      width: "100%",
      minWidth: 0,
      minHeight: 56,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      padding: spacing.lg,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },

    notesInput: {
      minHeight: 110,
      width: "100%",
      textAlignVertical: "top",
    },

    helperText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 20,
    },

    saveContainer: {
      marginTop: spacing.xxl,
    },
  });
}
