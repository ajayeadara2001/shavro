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

import { saveExpense, updateExpense } from "../services/expenseStorage";

import type { Expense, CreateExpenseInput } from "../types/expense";

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
  layout,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

interface AddExpenseScreenProps {
  expenseToEdit?: Expense | null;
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

function parseTransactionDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

export default function AddExpenseScreen({
  expenseToEdit = null,
  onEditComplete,
  onSaveComplete,
}: AddExpenseScreenProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const isEditing = expenseToEdit !== null;

  const [amount, setAmount] = useState(
    expenseToEdit ? String(expenseToEdit.amount) : "",
  );

  const [categoryId, setCategoryId] = useState<string | null>(
    expenseToEdit?.categoryId ?? null,
  );

  const [otherExpenseName, setOtherExpenseName] = useState(
    expenseToEdit?.expenseName ?? "",
  );

  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(
    expenseToEdit?.paymentMethodId ?? null,
  );

  const [otherMethodName, setOtherMethodName] = useState(
    expenseToEdit?.otherMethodName ?? "",
  );

  const [transactionDate, setTransactionDate] = useState<Date>(() =>
    expenseToEdit
      ? parseTransactionDate(expenseToEdit.transactionDate)
      : new Date(),
  );

  const [notes, setNotes] = useState(expenseToEdit?.notes ?? "");

  const [saving, setSaving] = useState(false);

  // Prevent duplicate save requests.
  const savingRef = useRef(false);

  const resetForm = (): void => {
    setAmount("");
    setCategoryId(null);
    setOtherExpenseName("");
    setPaymentMethodId(null);
    setOtherMethodName("");
    setTransactionDate(new Date());
    setNotes("");
  };

  const handleSave = async (): Promise<void> => {
    if (savingRef.current) {
      return;
    }

    const numericAmount = Number(amount);

    // Validate amount.
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

    // Validate selected category.
    // Both built-in and custom IDs are valid.
    if (!categoryId) {
      showMessage("Category Required", "Please select an expense category.");
      return;
    }

    // The manual name is required only
    // when the built-in Other option is used.
    if (categoryId === "other" && !otherExpenseName.trim()) {
      showMessage(
        "Expense Name Required",
        "Please enter a name for your expense.",
      );
      return;
    }

    // Validate selected payment method.
    // Both built-in and saved custom IDs
    // are valid.
    if (!paymentMethodId) {
      showMessage("Payment Method Required", "Please select a payment method.");
      return;
    }

    // Require a manually entered method
    // name only for the Other option.
    if (paymentMethodId === "other" && !otherMethodName.trim()) {
      showMessage("Payment Type Required", "Please enter your payment type.");
      return;
    }

    // Validate transaction date.
    if (Number.isNaN(transactionDate.getTime())) {
      showMessage("Invalid Date", "Please select a valid transaction date.");
      return;
    }

    const selectedDate = formatLocalDate(transactionDate);

    const today = formatLocalDate(new Date());

    if (selectedDate > today) {
      showMessage("Invalid Date", "Future transaction dates are not allowed.");
      return;
    }

    // Preserve custom category and payment IDs.
    // Manual names apply only to Other.
    const input: CreateExpenseInput = {
      amount: numericAmount,

      categoryId,

      expenseName: categoryId === "other" ? otherExpenseName.trim() : null,

      paymentMethodId,

      otherMethodName:
        paymentMethodId === "other" ? otherMethodName.trim() : null,

      transactionDate: selectedDate,

      notes: notes.trim(),
    };

    savingRef.current = true;
    setSaving(true);

    try {
      if (expenseToEdit) {
        // Update existing expense.
        const updatedExpense = await updateExpense(expenseToEdit.id, input);

        console.log("Expense updated:", updatedExpense);

        showMessage("Success", "Expense updated successfully!");

        onEditComplete?.();
      } else {
        // Save new expense.
        const savedExpense = await saveExpense(input);

        console.log("Expense saved:", savedExpense);

        resetForm();

        showMessage("Success", "Expense saved successfully!");

        onSaveComplete?.();
      }
    } catch (error) {
      console.error("Expense save/update failed:", error);

      showMessage(
        isEditing ? "Update Failed" : "Save Failed",
        isEditing
          ? "Unable to update your expense. Please try again."
          : "Unable to save your expense. Please try again.",
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
          {/* Heading */}
          <Text style={styles.heading}>
            {isEditing ? "Edit Expense" : "Add Expense"}
          </Text>

          {/* Amount */}
          <AmountInput value={amount} onChangeValue={setAmount} />

          {/* Expense category */}
          <View style={styles.section}>
            <CategorySelector
              selectedCategoryId={categoryId}
              onSelectCategory={setCategoryId}
              otherExpenseName={otherExpenseName}
              onOtherExpenseNameChange={setOtherExpenseName}
            />
          </View>

          {/* Payment method */}
          <View style={styles.section}>
            <PaymentMethodSelector
              selectedMethodId={paymentMethodId}
              onSelectMethod={setPaymentMethodId}
              otherMethodName={otherMethodName}
              onOtherMethodNameChange={setOtherMethodName}
            />
          </View>

          {/* Transaction date */}
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
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note about this expense"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={300}
              accessibilityLabel="Expense notes"
              textAlignVertical="top"
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>

          {/* Save / Update */}
          <View style={styles.saveContainer}>
            <PrimaryButton
              title={isEditing ? "Update Expense" : "Save Expense"}
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

// Theme-aware styles.
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
      width: "100%",
      minWidth: 0,
      marginTop: spacing.xl,
    },

    label: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
      marginBottom: spacing.sm,
    },

    notesInput: {
      width: "100%",
      minWidth: 0,
      minHeight: 110,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      padding: spacing.lg,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.text,
      backgroundColor: colors.surface,
      textAlignVertical: "top",
    },

    saveContainer: {
      width: "100%",
      marginTop: spacing.xxl,
      paddingBottom: spacing.md,
    },
  });
}
