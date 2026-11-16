import React, { useMemo, useRef, useState } from 'react';

import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Keyboard
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import AmountInput from '../components/AmountInput';
import CategorySelector from '../components/CategorySelector';
import PrimaryButton from '../components/PrimaryButton';
import TransactionDatePicker from '../components/TransactionDatePicker';

import { defaultIncomeCategories } from '../constants/incomeCategories';

import {
    saveIncome,
    updateIncome,
} from '../services/incomeStorage';

import type {
    Income,
    CreateIncomeInput,
} from '../types/income';

import {
    type ThemeColors,
    layout,
    radius,
    spacing,
    typography,
} from '../constants/theme';

import { useAppTheme } from '../context/ThemeContext';

interface AddIncomeScreenProps {
    incomeToEdit?: Income | null;
    onEditComplete?: () => void;
    onSaveComplete?: () => void;
}

function showMessage(title: string, message: string): void {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n\n${message}`);
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

function parseLocalDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);

    return new Date(year, month - 1, day);
}

export default function AddIncomeScreen({
    incomeToEdit = null,
    onEditComplete,
    onSaveComplete,
}: AddIncomeScreenProps) {
    const { colors } = useAppTheme();

    const styles = useMemo(
        () => createStyles(colors),
        [colors]
    );

    const isEditing = incomeToEdit !== null;

    const [amount, setAmount] = useState(
        incomeToEdit ? String(incomeToEdit.amount) : ''
    );

    const [categoryId, setCategoryId] =
        useState<string | null>(
            incomeToEdit?.categoryId ?? null
        );

    const [incomeName, setIncomeName] = useState(
        incomeToEdit?.incomeName ?? ''
    );

    const [transactionDate, setTransactionDate] =
        useState(
            incomeToEdit
                ? parseLocalDate(incomeToEdit.transactionDate)
                : new Date()
        );

    const [notes, setNotes] = useState(
        incomeToEdit?.notes ?? ''
    );

    const [saving, setSaving] = useState(false);

    const savingRef = useRef(false);

    const resetForm = (): void => {
        setAmount('');
        setCategoryId(null);
        setIncomeName('');
        setTransactionDate(new Date());
        setNotes('');
    };

    const handleSave = async (): Promise<void> => {
        if (savingRef.current) return;

        const numericAmount = Number(amount);

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

        if (!categoryId) {
            showMessage(
                'Category Required',
                'Please select an income category.'
            );
            return;
        }

        if (
            categoryId === 'other' &&
            !incomeName.trim()
        ) {
            showMessage(
                'Income Name Required',
                'Please enter a name for this income.'
            );
            return;
        }

        if (Number.isNaN(transactionDate.getTime())) {
            showMessage(
                'Invalid Date',
                'Please select a valid transaction date.'
            );
            return;
        }

        const selectedDate = formatLocalDate(transactionDate);

        if (selectedDate > formatLocalDate(new Date())) {
            showMessage(
                'Invalid Date',
                'Please select a date that is not in the future.'
            );
            return;
        }

        const input: CreateIncomeInput = {
            amount: numericAmount,
            categoryId,
            incomeName: incomeName.trim() || null,
            transactionDate: selectedDate,
            notes: notes.trim(),
        };

        savingRef.current = true;
        setSaving(true);

        try {
            if (incomeToEdit) {
                await updateIncome(incomeToEdit.id, input);

                showMessage(
                    'Success',
                    'Income updated successfully!'
                );

                onEditComplete?.();
            } else {
                await saveIncome(input);

                resetForm();

                showMessage(
                    'Success',
                    'Income saved successfully!'
                );

                onSaveComplete?.();
            }
        } catch (error) {
            console.error(
                isEditing
                    ? 'Income update failed:'
                    : 'Income save failed:',
                error
            );

            showMessage(
                isEditing ? 'Update Failed' : 'Save Failed',
                isEditing
                    ? 'Unable to update income. Please try again.'
                    : 'Unable to save income. Please try again.'
            );
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    return (
        <SafeAreaView 
            style={styles.safeArea}
            edges={['bottom', 'left', 'right']}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={
                    Platform.OS === 'ios' ? 'padding' : undefined
                }
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.heading}>
                        {isEditing ? 'Edit Income' : 'Add Income'}
                    </Text>

                    <AmountInput
                        value={amount}
                        onChangeValue={setAmount}
                    />

                    <View style={styles.section}>
                        <CategorySelector
                            categories={defaultIncomeCategories}
                            selectedCategoryId={categoryId}
                            onSelectCategory={setCategoryId}
                            onAddCategory={() =>
                                showMessage(
                                    'Coming Soon',
                                    'Custom income categories will be available soon.'
                                )
                            }
                            otherExpenseName={incomeName}
                            onOtherExpenseNameChange={setIncomeName}
                        />
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.label}>
                            Income name (optional)
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

                    <View style={styles.section}>
                        <TransactionDatePicker
                            value={transactionDate}
                            onChange={setTransactionDate}
                        />
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.label}>
                            Notes (optional)
                        </Text>

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

                    <View style={styles.saveContainer}>
                        <PrimaryButton
                            title={
                                isEditing
                                    ? 'Update Income'
                                    : 'Save Income'
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
            width: '100%',
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
            width: '100%',
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
            width: '100%',
            textAlignVertical: 'top',
        },

        saveContainer: {
            marginTop: spacing.xxl,
        },
    });
}