
import React, { useRef, useState } from 'react';

import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import AmountInput from '../components/AmountInput';
import CategorySelector from '../components/CategorySelector';
import PaymentMethodSelector from '../components/PaymentMethodSelector';
import PrimaryButton from '../components/PrimaryButton';
import TransactionDatePicker from '../components/TransactionDatePicker';

import {
  saveExpense,
  updateExpense,
} from '../services/expenseStorage';

import type {
  Expense,
  CreateExpenseInput,
} from '../types/expense';

import {
  colors,
  radius,
  spacing,
  typography,
  layout,
} from '../constants/theme';

interface AddExpenseScreenProps {
  expenseToEdit?: Expense | null;
  onEditComplete?: () => void;
}

function showMessage(
  title: string,
  message: string
): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    }
    return;
  }

  Alert.alert(title, message);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseTransactionDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, month - 1, day);
}

export default function AddExpenseScreen({
  expenseToEdit = null,
  onEditComplete,
}: AddExpenseScreenProps) {
  const isEditing = expenseToEdit !== null;

  const [amount, setAmount] = useState(
    expenseToEdit ? String(expenseToEdit.amount) : ''
  );

  const [categoryId, setCategoryId] =
    useState<string | null>(
      expenseToEdit?.categoryId ?? null
    );

  const [otherExpenseName, setOtherExpenseName] =
    useState(expenseToEdit?.expenseName ?? '');

  const [paymentMethodId, setPaymentMethodId] =
    useState<string | null>(
      expenseToEdit?.paymentMethodId ?? null
    );

  const [otherMethodName, setOtherMethodName] =
    useState(expenseToEdit?.otherMethodName ?? '');

  const [transactionDate, setTransactionDate] =
    useState<Date>(() =>
      expenseToEdit
        ? parseTransactionDate(expenseToEdit.transactionDate)
        : new Date()
    );

  const [notes, setNotes] = useState(
    expenseToEdit?.notes ?? ''
  );

  const [saving, setSaving] = useState(false);

  // Prevent duplicate submissions from rapid taps.
  const savingRef = useRef(false);

  const resetForm = (): void => {
    setAmount('');
    setCategoryId(null);
    setOtherExpenseName('');
    setPaymentMethodId(null);
    setOtherMethodName('');
    setTransactionDate(new Date());
    setNotes('');
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
        'Invalid Amount',
        'Please enter an amount greater than zero.'
      );
      return;
    }

    // Validate category.
    if (!categoryId) {
      showMessage(
        'Category Required',
        'Please select an expense category.'
      );
      return;
    }

    // Validate custom expense name.
    if (
      categoryId === 'other' &&
      !otherExpenseName.trim()
    ) {
      showMessage(
        'Expense Name Required',
        'Please enter a name for your expense.'
      );
      return;
    }

    // Validate payment method.
    if (!paymentMethodId) {
      showMessage(
        'Payment Method Required',
        'Please select a payment method.'
      );
      return;
    }

    // Validate custom payment type.
    if (
      paymentMethodId === 'other' &&
      !otherMethodName.trim()
    ) {
      showMessage(
        'Payment Type Required',
        'Please enter your payment type.'
      );
      return;
    }

    // Validate transaction date.
    if (Number.isNaN(transactionDate.getTime())) {
      showMessage(
        'Invalid Date',
        'Please select a valid transaction date.'
      );
      return;
    }

    const selectedDate = formatLocalDate(transactionDate);
    const today = formatLocalDate(new Date());

    if (selectedDate > today) {
      showMessage(
        'Invalid Date',
        'Future transaction dates are not allowed.'
      );
      return;
    }

    const input: CreateExpenseInput = {
      amount: numericAmount,
      categoryId,
      expenseName:
        categoryId === 'other'
          ? otherExpenseName.trim()
          : null,
      paymentMethodId,
      otherMethodName:
        paymentMethodId === 'other'
          ? otherMethodName.trim()
          : null,
      transactionDate: selectedDate,
      notes: notes.trim(),
    };

    savingRef.current = true;
    setSaving(true);

    try {
      if (expenseToEdit) {
        // Update the existing transaction.
        const updatedExpense = await updateExpense(
          expenseToEdit.id,
          input
        );

        console.log(
          'Expense updated:',
          updatedExpense
        );

        showMessage(
          'Success',
          'Expense updated successfully!'
        );

        onEditComplete?.();
      } else {
        // Create a new transaction.
        const savedExpense = await saveExpense(input);

        console.log(
          'Expense saved:',
          savedExpense
        );

        resetForm();

        showMessage(
          'Success',
          'Expense saved successfully!'
        );
      }
    } catch (error) {
      console.error(
        'Expense save/update failed:',
        error
      );

      showMessage(
        isEditing ? 'Update Failed' : 'Save Failed',
        isEditing
          ? 'Unable to update your expense. Please try again.'
          : 'Unable to save your expense. Please try again.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Heading */}
          <Text style={styles.heading}>
            {isEditing ? 'Edit Expense' : 'Add Expense'}
          </Text>

          {/* Amount */}
          <AmountInput
            value={amount}
            onChangeValue={setAmount}
          />

          {/* Category */}
          <View style={styles.section}>
            <CategorySelector
              selectedCategoryId={categoryId}
              onSelectCategory={setCategoryId}
              onAddCategory={() =>
                showMessage(
                  'Coming Soon',
                  'Creating reusable expense categories will be available soon.'
                )
              }
              otherExpenseName={otherExpenseName}
              onOtherExpenseNameChange={
                setOtherExpenseName
              }
            />
          </View>

          {/* Payment method */}
          <View style={styles.section}>
            <PaymentMethodSelector
              selectedMethodId={paymentMethodId}
              onSelectMethod={setPaymentMethodId}
              onAddMethod={() =>
                showMessage(
                  'Coming Soon',
                  'Creating reusable payment methods will be available soon.'
                )
              }
              otherMethodName={otherMethodName}
              onOtherMethodNameChange={
                setOtherMethodName
              }
            />
          </View>

          {/* Date */}
          <View style={styles.section}>
            <TransactionDatePicker
              value={transactionDate}
              onChange={setTransactionDate}
            />
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Notes (optional)
            </Text>

            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note about this expense"
              placeholderTextColor={
                colors.textSecondary
              }
              multiline
              maxLength={300}
              accessibilityLabel="Expense notes"
              textAlignVertical="top"
            />
          </View>

          {/* Save or Update */}
          <View style={styles.saveContainer}>
            <PrimaryButton
              title={
                isEditing
                  ? 'Update Expense'
                  : 'Save Expense'
              }
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  flex: {
    flex: 1,
  },

  content: {
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

  notesInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    padding: spacing.lg,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },

  saveContainer: {
    marginTop: spacing.xxl,
  },
});