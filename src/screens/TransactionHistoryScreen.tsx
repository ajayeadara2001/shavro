
import React, { useCallback, useEffect, useState } from 'react';

import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
    AlertCircle,
    ArrowDownRight,
    RefreshCw,
    ReceiptText,
    Wallet,
} from 'lucide-react-native';

import { getExpenses } from '../services/expenseStorage';

import type { Expense } from '../types/expense';

import {
    colors,
    layout,
    radius,
    spacing,
    typography,
} from '../constants/theme';

interface TransactionHistoryScreenProps {
    onAddExpense: () => void;
    onSelectExpense: (expense: Expense) => void;
}

function formatCurrency(amount: number): string {
    return `₹${amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatDate(dateString: string): string {
    const [year, month, day] = dateString.split('-').map(Number);

    const date = new Date(year, month - 1, day);

    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function formatName(value: string): string {
    return value
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getCategoryName(expense: Expense): string {
    if (expense.categoryId === 'other' && expense.expenseName) {
        return expense.expenseName;
    }

    return formatName(expense.categoryId);
}

function getPaymentName(expense: Expense): string {
    if (expense.paymentMethodId === 'other' && expense.otherMethodName) {
        return expense.otherMethodName;
    }

    if (expense.paymentMethodId === 'upi') {
        return 'UPI';
    }

    return formatName(expense.paymentMethodId);
}

export default function TransactionHistoryScreen({
    onAddExpense,
    onSelectExpense,
}: TransactionHistoryScreenProps) {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadExpenses = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const savedExpenses = await getExpenses();

            const sortedExpenses = [...savedExpenses].sort((a, b) => {
                const dateComparison = b.transactionDate.localeCompare(
                    a.transactionDate
                );

                if (dateComparison !== 0) {
                    return dateComparison;
                }

                return b.createdAt.localeCompare(a.createdAt);
            });

            setExpenses(sortedExpenses);
        } catch (loadError) {
            console.error('Failed to load expenses:', loadError);

            setError('Unable to load transactions. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadExpenses();
    }, [loadExpenses]);

    const totalExpenses = expenses.reduce(
        (total, expense) => total + expense.amount,
        0
    );

    const groupedExpenses = expenses.reduce<
        Record<string, Expense[]>
    >((groups, expense) => {
        if (!groups[expense.transactionDate]) {
            groups[expense.transactionDate] = [];
        }

        groups[expense.transactionDate].push(expense);

        return groups;
    }, {});

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={styles.heading}>Transactions</Text>

                    <Pressable
                        onPress={() => void loadExpenses()}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh transactions"
                        style={styles.refreshButton}
                    >
                        <RefreshCw size={20} color={colors.text} />
                    </Pressable>
                </View>

                {loading ? (
                    <View style={styles.centerState}>
                        <ActivityIndicator
                            size="large"
                            color={colors.primary}
                        />
                        <Text style={styles.stateText}>
                            Loading transactions...
                        </Text>
                    </View>
                ) : error ? (
                    <View style={styles.centerState}>
                        <AlertCircle
                            size={32}
                            color={colors.error}
                        />

                        <Text style={styles.stateText}>{error}</Text>

                        <Pressable
                            onPress={() => void loadExpenses()}
                            style={styles.actionButton}
                        >
                            <Text style={styles.actionButtonText}>
                                Try Again
                            </Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        <View style={styles.summaryCard}>
                            <View style={styles.summaryHeader}>
                                <Text style={styles.summaryLabel}>
                                    TOTAL EXPENSES
                                </Text>

                                <Wallet
                                    size={22}
                                    color={colors.textSecondary}
                                />
                            </View>

                            <Text style={styles.totalAmount}>
                                {formatCurrency(totalExpenses)}
                            </Text>

                            <Text style={styles.transactionCount}>
                                {expenses.length}{' '}
                                {expenses.length === 1
                                    ? 'transaction'
                                    : 'transactions'}
                            </Text>
                        </View>

                        {expenses.length === 0 ? (
                            <View style={styles.centerState}>
                                <ReceiptText
                                    size={40}
                                    color={colors.textSecondary}
                                />

                                <Text style={styles.emptyTitle}>
                                    No expenses yet
                                </Text>

                                <Text style={styles.stateText}>
                                    Your saved expenses will appear here.
                                </Text>

                                <Pressable
                                    onPress={onAddExpense}
                                    style={styles.actionButton}
                                >
                                    <Text style={styles.actionButtonText}>
                                        Add Expense
                                    </Text>
                                </Pressable>
                            </View>
                        ) : (
                            Object.entries(groupedExpenses).map(
                                ([date, transactions]) => (
                                    <View key={date} style={styles.dateGroup}>
                                        <Text style={styles.dateHeading}>
                                            {formatDate(date)}
                                        </Text>


                                        {transactions.map((expense) => (
                                            <Pressable
                                                key={expense.id}
                                                style={styles.transactionRow}
                                                onPress={() => onSelectExpense(expense)}
                                                accessibilityRole="button"
                                                accessibilityLabel={`View ${getCategoryName(expense)} expense of ${formatCurrency(expense.amount)}`}
                                            >
                                                <View style={styles.transactionIcon}>
                                                    <ArrowDownRight
                                                        size={21}
                                                        color={colors.primary}
                                                    />
                                                </View>

                                                <View style={styles.transactionDetails}>
                                                    <Text style={styles.categoryName}>
                                                        {getCategoryName(expense)}
                                                    </Text>

                                                    <Text style={styles.paymentName}>
                                                        {getPaymentName(expense)}
                                                    </Text>

                                                    {expense.notes ? (
                                                        <Text
                                                            style={styles.notes}
                                                            numberOfLines={2}
                                                        >
                                                            {expense.notes}
                                                        </Text>
                                                    ) : null}
                                                </View>

                                                <Text style={styles.expenseAmount}>
                                                    −{formatCurrency(expense.amount)}
                                                </Text>
                                            </Pressable>
                                        ))}

                                    </View>
                                )
                            )
                        )}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },

    content: {
        flexGrow: 1,
        paddingHorizontal: layout.screenPadding,
        paddingTop: spacing.xl,
        paddingBottom: spacing.xxl,
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.xl,
    },

    heading: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.heading,
        fontWeight: typography.weights.bold,
        color: colors.text,
    },

    refreshButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.medium,
        borderWidth: 1,
        borderColor: colors.border,
    },

    summaryCard: {
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.large,
        padding: spacing.xl,
        marginBottom: spacing.xl,
    },

    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },

    summaryLabel: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.caption,
        fontWeight: typography.weights.semibold,
        color: colors.textSecondary,
    },

    totalAmount: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.amount,
        fontWeight: typography.weights.bold,
        color: colors.text,
    },

    transactionCount: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.small,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },

    dateGroup: {
        marginBottom: spacing.xl,
    },

    dateHeading: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.small,
        fontWeight: typography.weights.semibold,
        color: colors.textSecondary,
        marginBottom: spacing.md,
    },

    transactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        gap: spacing.md,
    },

    transactionIcon: {
        width: 44,
        height: 44,
        borderRadius: radius.medium,
        backgroundColor: colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
    },

    transactionDetails: {
        flex: 1,
    },

    categoryName: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.body,
        fontWeight: typography.weights.semibold,
        color: colors.text,
    },

    paymentName: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.small,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },

    notes: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.small,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },

    expenseAmount: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.body,
        fontWeight: typography.weights.semibold,
        color: colors.text,
    },

    centerState: {
        flex: 1,
        minHeight: 260,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        paddingVertical: spacing.xxl,
    },

    emptyTitle: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.subtitle,
        fontWeight: typography.weights.semibold,
        color: colors.text,
    },

    stateText: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.small,
        color: colors.textSecondary,
        textAlign: 'center',
    },

    actionButton: {
        backgroundColor: colors.primary,
        paddingHorizontal: spacing.xl,
        minHeight: 44,
        borderRadius: radius.medium,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: spacing.sm,
    },

    actionButtonText: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.body,
        fontWeight: typography.weights.semibold,
        color: colors.background,
    },
});
