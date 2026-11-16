
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

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
    ArrowDownLeft,
    ArrowUpRight,
    RefreshCw,
    ReceiptText,
    Wallet,
} from 'lucide-react-native';

import { getExpenses } from '../services/expenseStorage';
import { getIncomes } from '../services/incomeStorage';

import type { Expense } from '../types/expense';
import type { Income } from '../types/income';
import type { Transaction } from '../types/transaction';
import { sortTransactions } from '../types/transaction';

import {
    layout,
    radius,
    spacing,
    typography,
} from '../constants/theme';

import {
    calculateFinancialTotals,
    formatINR,
} from '../utils/money';
import type { ThemeColors } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';

interface TransactionHistoryScreenProps {
    onAddExpense: () => void;
    onSelectExpense: (expense: Expense) => void;
    onSelectIncome: (income: Income) => void;
}

// Shared currency formatter used across Shavro.
const formatCurrency = formatINR;

function formatDate(dateString: string): string {
    const [year, month, day] = dateString
        .split('-')
        .map(Number);

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
        .replace(/\b\w/g, character =>
            character.toUpperCase()
        );
}

function getCategoryName(expense: Expense): string {
    if (
        expense.categoryId === 'other' &&
        expense.expenseName
    ) {
        return expense.expenseName;
    }

    return formatName(expense.categoryId);
}

function getPaymentName(expense: Expense): string {
    if (
        expense.paymentMethodId === 'other' &&
        expense.otherMethodName
    ) {
        return expense.otherMethodName;
    }

    if (expense.paymentMethodId === 'upi') {
        return 'UPI';
    }

    return formatName(expense.paymentMethodId);
}

function getIncomeCategoryName(income: Income): string {
    if (income.incomeName?.trim()) {
        return income.incomeName;
    }

    return formatName(income.categoryId);
}

export default function TransactionHistoryScreen({
    onAddExpense,
    onSelectExpense,
    onSelectIncome,
}: TransactionHistoryScreenProps) {
    const { colors } = useAppTheme();

    const styles = useMemo(
        () => createStyles(colors),
        [colors]
    );

    const [transactions, setTransactions] = useState<
        Transaction[]
    >([]);

    const [loading, setLoading] = useState(true);

    const [error, setError] = useState<string | null>(
        null
    );

    const loadTransactions = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [savedExpenses, savedIncomes] =
                await Promise.all([
                    getExpenses(),
                    getIncomes(),
                ]);

            const combined: Transaction[] = [
                ...savedExpenses.map(
                    (expense): Transaction => ({
                        type: 'EXPENSE',
                        data: expense,
                    })
                ),

                ...savedIncomes.map(
                    (income): Transaction => ({
                        type: 'INCOME',
                        data: income,
                    })
                ),
            ];

            setTransactions(sortTransactions(combined));
        } catch (loadError) {
            console.error(
                'Failed to load transactions:',
                loadError
            );

            setError(
                'Unable to load transactions. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadTransactions();
    }, [loadTransactions]);

    // Calculate totals using the same utility as
    // HomeDashboardScreen.tsx.
    const {
        totalIncome,
        totalExpenses,
        netBalance,
    } = useMemo(() => {
        const incomes = transactions
            .filter(
                (transaction) => transaction.type === 'INCOME'
            )
            .map((transaction) => transaction.data);

        const expenses = transactions
            .filter(
                (transaction) => transaction.type === 'EXPENSE'
            )
            .map((transaction) => transaction.data);

        return calculateFinancialTotals(
            incomes,
            expenses
        );
    }, [transactions]);
    const groupedTransactions = transactions.reduce<
        Record<string, Transaction[]>
    >((groups, transaction) => {
        const date = transaction.data.transactionDate;

        if (!groups[date]) {
            groups[date] = [];
        }

        groups[date].push(transaction);

        return groups;
    }, {});

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={styles.heading}>
                        Transactions
                    </Text>

                    <Pressable
                        onPress={() => void loadTransactions()}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh transactions"
                        style={styles.refreshButton}
                    >
                        <RefreshCw
                            size={20}
                            color={colors.text}
                        />
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

                        <Text style={styles.stateText}>
                            {error}
                        </Text>

                        <Pressable
                            onPress={() => void loadTransactions()}
                            style={styles.actionButton}
                            accessibilityRole="button"
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
                                    NET BALANCE
                                </Text>

                                <Wallet
                                    size={22}
                                    color={colors.textSecondary}
                                />
                            </View>

                            <Text
                                style={[
                                    styles.totalAmount,
                                    netBalance < 0 &&
                                    styles.negativeBalance,
                                ]}
                            >
                                {netBalance < 0 ? '−' : ''}
                                {formatCurrency(Math.abs(netBalance))}
                            </Text>

                            <Text style={styles.transactionCount}>
                                {transactions.length}{' '}
                                {transactions.length === 1
                                    ? 'transaction'
                                    : 'transactions'}
                            </Text>

                            <View style={styles.summaryDivider} />

                            <View style={styles.summaryTotals}>
                                <View style={styles.summaryColumn}>
                                    <Text style={styles.summaryLabel}>
                                        TOTAL INCOME
                                    </Text>

                                    <Text style={styles.incomeTotal}>
                                        {formatCurrency(totalIncome)}
                                    </Text>
                                </View>

                                <View style={styles.summaryColumn}>
                                    <Text style={styles.summaryLabel}>
                                        TOTAL EXPENSES
                                    </Text>

                                    <Text style={styles.expenseTotal}>
                                        {formatCurrency(totalExpenses)}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {transactions.length === 0 ? (
                            <View style={styles.centerState}>
                                <ReceiptText
                                    size={40}
                                    color={colors.textSecondary}
                                />

                                <Text style={styles.emptyTitle}>
                                    No transactions yet
                                </Text>

                                <Text style={styles.stateText}>
                                    Your income and expenses will appear here.
                                </Text>

                                <Pressable
                                    onPress={onAddExpense}
                                    style={styles.actionButton}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.actionButtonText}>
                                        Add Expense
                                    </Text>
                                </Pressable>
                            </View>
                        ) : (
                            Object.entries(groupedTransactions).map(
                                ([date, dateTransactions]) => (
                                    <View
                                        key={date}
                                        style={styles.dateGroup}
                                    >
                                        <Text style={styles.dateHeading}>
                                            {formatDate(date)}
                                        </Text>

                                        {dateTransactions.map(transaction => {
                                            const isIncome =
                                                transaction.type === 'INCOME';

                                            const item = transaction.data;

                                            const title = isIncome
                                                ? getIncomeCategoryName(
                                                    transaction.data
                                                )
                                                : getCategoryName(
                                                    transaction.data
                                                );

                                            const subtitle = isIncome
                                                ? 'Income'
                                                : getPaymentName(
                                                    transaction.data
                                                );

                                            const amountLabel = `${isIncome ? '+' : '−'
                                                }${formatCurrency(item.amount)}`;

                                            return (
                                                <Pressable
                                                    key={`${transaction.type}-${item.id}`}
                                                    style={styles.transactionRow}
                                                    onPress={() => {
                                                        if (
                                                            transaction.type === 'INCOME'
                                                        ) {
                                                            onSelectIncome(
                                                                transaction.data
                                                            );
                                                        } else {
                                                            onSelectExpense(
                                                                transaction.data
                                                            );
                                                        }
                                                    }}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={
                                                        `${title}, ${subtitle}, ` +
                                                        amountLabel
                                                    }
                                                >
                                                    <View
                                                        style={[
                                                            styles.transactionIcon,
                                                            isIncome
                                                                ? styles.incomeIcon
                                                                : styles.expenseIcon,
                                                        ]}
                                                    >
                                                        {isIncome ? (
                                                            <ArrowDownLeft
                                                                size={21}
                                                                color={colors.success}
                                                            />
                                                        ) : (
                                                            <ArrowUpRight
                                                                size={21}
                                                                color={colors.error}
                                                            />
                                                        )}
                                                    </View>

                                                    <View
                                                        style={styles.transactionDetails}
                                                    >
                                                        <Text
                                                            style={styles.categoryName}
                                                            numberOfLines={1}
                                                            ellipsizeMode="tail"
                                                        >
                                                            {title}
                                                        </Text>

                                                        <Text style={styles.paymentName}>
                                                            {subtitle}
                                                        </Text>

                                                        {item.notes ? (
                                                            <Text
                                                                style={styles.notes}
                                                                numberOfLines={2}
                                                            >
                                                                {item.notes}
                                                            </Text>
                                                        ) : null}
                                                    </View>

                                                    <Text
                                                        style={[
                                                            styles.transactionAmount,
                                                            isIncome
                                                                ? styles.incomeAmount
                                                                : styles.expenseAmount,
                                                        ]}
                                                    >
                                                        {amountLabel}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
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

function createStyles(colors: ThemeColors) {
    return StyleSheet.create({
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
            backgroundColor: colors.surface,
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

        negativeBalance: {
            color: colors.error,
        },

        transactionCount: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.small,
            color: colors.textSecondary,
            marginTop: spacing.xs,
        },

        summaryDivider: {
            height: 1,
            backgroundColor: colors.border,
            marginVertical: spacing.lg,
        },

        summaryTotals: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            gap: spacing.md,
        },

        summaryColumn: {
            flex: 1,
            minWidth: 0,
        },

        incomeTotal: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.subtitle,
            fontWeight: typography.weights.bold,
            color: colors.success,
            marginTop: spacing.sm,
        },

        expenseTotal: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.subtitle,
            fontWeight: typography.weights.bold,
            color: colors.error,
            marginTop: spacing.sm,
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
            alignItems: 'center',
            justifyContent: 'center',
        },

        expenseIcon: {
            backgroundColor: colors.expenseIconBackground,
        },

        incomeIcon: {
            backgroundColor: colors.incomeIconBackground,
        },

        transactionDetails: {
            flex: 1,
            minWidth: 0,
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

        transactionAmount: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            fontWeight: typography.weights.semibold,
            textAlign: 'right',
            flexShrink: 1,
        },

        expenseAmount: {
            color: colors.error,
        },

        incomeAmount: {
            color: colors.success,
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
}
