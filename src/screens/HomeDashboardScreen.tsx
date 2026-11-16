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
    useWindowDimensions,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
    ArrowDownLeft,
    ArrowUpRight,
    ChevronRight,
    Plus,
    Minus,
    Wallet,
    UserRound,
} from 'lucide-react-native';

import ThemeSwitcher from '../components/ThemeSwitcher';
import { useAppTheme } from '../context/ThemeContext';

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
    type ThemeColors,
} from '../constants/theme';

import {
    calculateFinancialTotals,
    formatINR,
} from '../utils/money';

interface HomeDashboardScreenProps {
    onAddIncome: () => void;
    onAddExpense: () => void;
    onViewAll: () => void;
    onSelectExpense: (expense: Expense) => void;
    onSelectIncome: (income: Income) => void;
}

function displayName(value: string): string {
    return value
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function HomeDashboardScreen({
    onAddIncome,
    onAddExpense,
    onViewAll,
    onSelectExpense,
    onSelectIncome,
}: HomeDashboardScreenProps) {
    const { colors } = useAppTheme();
    const { width } = useWindowDimensions();

    const isCompact = width < 360;
    const isSmallScreen = width < 420;

    const styles = useMemo(
        () => createStyles(colors, isSmallScreen),
        [colors, isSmallScreen]
    );

    const [transactions, setTransactions] =
        useState<Transaction[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(false);

        try {
            const [expenses, incomes] = await Promise.all([
                getExpenses(),
                getIncomes(),
            ]);

            const combined: Transaction[] = [
                ...expenses.map(
                    (data): Transaction => ({
                        type: 'EXPENSE',
                        data,
                    })
                ),

                ...incomes.map(
                    (data): Transaction => ({
                        type: 'INCOME',
                        data,
                    })
                ),
            ];

            setTransactions(sortTransactions(combined));
        } catch (loadError) {
            console.error(
                'Failed to load dashboard:',
                loadError
            );

            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    // Shared integer-paise financial calculation.
    const { income, expenses, balance } = useMemo(() => {
        const incomeRecords = transactions
            .filter(
                transaction => transaction.type === 'INCOME'
            )
            .map(transaction => transaction.data);

        const expenseRecords = transactions
            .filter(
                transaction => transaction.type === 'EXPENSE'
            )
            .map(transaction => transaction.data);

        const totals = calculateFinancialTotals(
            incomeRecords,
            expenseRecords
        );

        return {
            income: totals.totalIncome,
            expenses: totals.totalExpenses,
            balance: totals.netBalance,
        };
    }, [transactions]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* SHAVRO BRAND HEADER */}
                <View style={styles.header}>
                    <View style={styles.headerText}>
                        <View style={styles.brandRow}>
                            <Text style={styles.appName}>
                                Shavro
                            </Text>

                            <View style={styles.brandDot} />
                        </View>

                        <Text style={styles.tagline}>
                            Your Money, Made Simple.
                        </Text>
                    </View>

                    <View style={styles.headerActions}>
                        <ThemeSwitcher />

                        <View style={styles.profileIcon}>
                            <UserRound
                                size={22}
                                color={colors.text}
                            />
                        </View>
                    </View>
                </View>

                {loading ? (
                    <View style={styles.emptyState}>
                        <ActivityIndicator
                            size="large"
                            color={colors.primary}
                        />
                    </View>
                ) : error ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.secondaryText}>
                            Unable to load your dashboard.
                        </Text>

                        <Pressable
                            onPress={() => void load()}
                            accessibilityRole="button"
                        >
                            <Text style={styles.link}>
                                Try Again
                            </Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        {/* NET BALANCE CARD */}
                        <View style={styles.balanceCard}>
                            <View style={styles.balanceHeader}>
                                <Text style={styles.balanceLabel}>
                                    NET BALANCE
                                </Text>

                                <Wallet
                                    size={23}
                                    color={colors.textSecondary}
                                />
                            </View>

                            <Text
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.65}
                                style={[
                                    styles.balanceAmount,
                                    balance < 0 &&
                                    styles.negativeBalance,
                                ]}
                            >
                                {balance < 0 ? '−' : ''}
                                {formatINR(Math.abs(balance))}
                            </Text>

                            <Text style={styles.secondaryText}>
                                Income minus recorded expenses
                            </Text>

                            <View style={styles.divider} />

                            <View style={styles.totalsRow}>
                                {/* Income */}
                                <View style={styles.totalColumn}>
                                    <View style={styles.totalHeading}>
                                        <ArrowDownLeft
                                            size={17}
                                            color={colors.success}
                                        />

                                        <Text style={styles.balanceLabel}>
                                            Income
                                        </Text>
                                    </View>

                                    <Text
                                        style={styles.incomeAmount}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.7}
                                    >
                                        {formatINR(income)}
                                    </Text>
                                </View>

                                {/* Expenses */}
                                <View style={styles.totalColumn}>
                                    <View style={styles.totalHeading}>
                                        <ArrowUpRight
                                            size={17}
                                            color={colors.error}
                                        />

                                        <Text style={styles.balanceLabel}>
                                            Expenses
                                        </Text>
                                    </View>

                                    <Text
                                        style={styles.expenseAmount}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.7}
                                    >
                                        {formatINR(expenses)}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* QUICK ACTION CARDS */}
                        <View style={styles.actionsRow}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.actionCard,
                                    styles.incomeActionCard,
                                    pressed && styles.pressedCard,
                                ]}
                                onPress={onAddIncome}
                                accessibilityRole="button"
                                accessibilityLabel="Add Income"
                                accessibilityHint="Record money received"
                            >
                                <View style={styles.actionCardTop}>
                                    <View style={styles.incomeActionIcon}>
                                        <Plus
                                            size={26}
                                            color={colors.success}
                                            strokeWidth={2.3}
                                        />
                                    </View>

                                    <ChevronRight
                                        size={19}
                                        color={colors.textSecondary}
                                    />
                                </View>

                                <Text
                                    style={styles.actionText}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                >
                                    Add Income
                                </Text>
                            </Pressable>

                            <Pressable
                                style={({ pressed }) => [
                                    styles.actionCard,
                                    styles.expenseActionCard,
                                    pressed && styles.pressedCard,
                                ]}
                                onPress={onAddExpense}
                                accessibilityRole="button"
                                accessibilityLabel="Add Expense"
                                accessibilityHint="Record money spent"
                            >
                                <View style={styles.actionCardTop}>
                                    <View style={styles.expenseActionIcon}>
                                        <Minus
                                            size={26}
                                            color={colors.error}
                                            strokeWidth={2.3}
                                        />
                                    </View>

                                    <ChevronRight
                                        size={19}
                                        color={colors.textSecondary}
                                    />
                                </View>

                                <Text
                                    style={styles.actionText}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                >
                                    Add Expense
                                </Text>
                            </Pressable>
                        </View>

                        {/* RECENT TRANSACTIONS HEADER */}
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>
                                Recent Transactions
                            </Text>

                            <Pressable
                                onPress={onViewAll}
                                accessibilityRole="button"
                                accessibilityLabel="See all transactions"
                                style={styles.seeAllButton}
                            >
                                <Text style={styles.link}>
                                    See all
                                </Text>
                            </Pressable>
                        </View>

                        {/* RECENT TRANSACTIONS */}
                        <View style={styles.recentCard}>
                            {transactions.length === 0 ? (
                                <Text style={styles.secondaryText}>
                                    No transactions yet. Add your first
                                    income or expense to get started.
                                </Text>
                            ) : (
                                transactions
                                    .slice(0, 5)
                                    .map(transaction => {
                                        const isIncome =
                                            transaction.type === 'INCOME';

                                        const data = transaction.data;

                                        const title =
                                            transaction.type === 'INCOME'
                                                ? transaction.data.incomeName?.trim() ||
                                                displayName(
                                                    transaction.data.categoryId
                                                )
                                                : transaction.data.expenseName?.trim() ||
                                                displayName(
                                                    transaction.data.categoryId
                                                );

                                        return (
                                            <Pressable
                                                key={`${transaction.type}-${data.id}`}
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
                                                    `${title}, ` +
                                                    `${isIncome ? 'income' : 'expense'}, ` +
                                                    formatINR(data.amount)
                                                }
                                            >
                                                <View
                                                    style={[
                                                        styles.transactionIcon,
                                                        isIncome
                                                            ? styles.incomeActionIcon
                                                            : styles.expenseActionIcon,
                                                    ]}
                                                >
                                                    {isIncome ? (
                                                        <ArrowDownLeft
                                                            size={20}
                                                            color={colors.success}
                                                        />
                                                    ) : (
                                                        <ArrowUpRight
                                                            size={20}
                                                            color={colors.error}
                                                        />
                                                    )}
                                                </View>

                                                <View style={styles.transactionInfo}>
                                                    <Text
                                                        style={styles.transactionTitle}
                                                        numberOfLines={1}
                                                        ellipsizeMode="tail"
                                                    >
                                                        {title}
                                                    </Text>

                                                    <Text style={styles.secondaryText}>
                                                        {isIncome
                                                            ? 'Income'
                                                            : 'Expense'}
                                                    </Text>
                                                </View>

                                                <Text
                                                    style={
                                                        isIncome
                                                            ? styles.recentIncome
                                                            : styles.recentExpense
                                                    }
                                                    numberOfLines={1}
                                                    adjustsFontSizeToFit
                                                    minimumFontScale={0.7}
                                                >
                                                    {isIncome ? '+' : '−'}
                                                    {formatINR(data.amount)}
                                                </Text>
                                            </Pressable>
                                        );
                                    })
                            )}
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(
    colors: ThemeColors,
    isSmallScreen: boolean
) {
    return StyleSheet.create({
        safeArea: {
            flex: 1,
            minHeight: 0,
            width: '100%',
            backgroundColor: colors.background,
        },

        scrollView: {
            flex: 1,
            width: '100%',
        },

        content: {
            flexGrow: 1,
            width: '100%',
            paddingHorizontal: isSmallScreen
                ? spacing.md
                : layout.screenPadding,
            paddingTop: spacing.lg,
            paddingBottom: spacing.xxl,
        },

        // HEADER
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: spacing.xl,
            gap: spacing.sm,
        },

        headerText: {
            flex: 1,
            minWidth: 0,
        },

        headerActions: {
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 0,
            gap: spacing.sm,
        },

        brandRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },

        appName: {
            fontFamily: typography.fontFamily,
            fontSize: isSmallScreen ? 28 : 32,
            fontWeight: typography.weights.bold,
            letterSpacing: -1.2,
            color: colors.text,
        },

        brandDot: {
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: colors.primary,
            alignSelf: 'flex-end',
            marginBottom: 8,
        },

        tagline: {
            fontFamily: typography.fontFamily,
            fontSize: 13,
            fontWeight: typography.weights.medium,
            color: colors.textSecondary,
            marginTop: 2,
        },

        profileIcon: {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },

        // BALANCE CARD
        balanceCard: {
            width: '100%',
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.large,
            padding: isSmallScreen
                ? spacing.lg
                : spacing.xl,
            marginBottom: spacing.lg,
        },

        balanceHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },

        balanceLabel: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.small,
            color: colors.textSecondary,
            fontWeight: typography.weights.medium,
        },

        balanceAmount: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.amount,
            fontWeight: typography.weights.bold,
            color: colors.text,
            marginTop: spacing.lg,
            marginBottom: spacing.sm,
        },

        negativeBalance: {
            color: colors.error,
        },

        secondaryText: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.small,
            color: colors.textSecondary,
        },

        divider: {
            height: 1,
            backgroundColor: colors.border,
            marginVertical: spacing.xl,
        },

        totalsRow: {
            flexDirection: isSmallScreen
                ? 'column'
                : 'row',
            gap: spacing.md,
        },

        totalColumn: {
            flex: 1,
            minWidth: 0,
        },

        totalHeading: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
        },

        incomeAmount: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.subtitle,
            fontWeight: typography.weights.bold,
            color: colors.success,
            marginTop: spacing.md,
        },

        expenseAmount: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.subtitle,
            fontWeight: typography.weights.bold,
            color: colors.error,
            marginTop: spacing.md,
        },

        // QUICK ACTION CARDS
        actionsRow: {
            flexDirection: 'row',
            gap: spacing.md,
            marginBottom: spacing.xxl,
        },

        actionCard: {
            flex: 1,
            minWidth: 0,
            minHeight: isSmallScreen ? 112 : 126,
            borderRadius: radius.large,
            borderWidth: 1,
            padding: isSmallScreen
                ? spacing.md
                : spacing.lg,
            justifyContent: 'space-between',
            gap: spacing.lg,
        },

        incomeActionCard: {
            backgroundColor: colors.incomeSurface,
            borderColor: colors.incomeBorder,
        },

        expenseActionCard: {
            backgroundColor: colors.expenseSurface,
            borderColor: colors.expenseBorder,
        },

        actionCardTop: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
        },

        incomeActionIcon: {
            backgroundColor: colors.incomeIconBackground,
            width: 46,
            height: 46,
            borderRadius: radius.medium,
            alignItems: 'center',
            justifyContent: 'center',
        },

        expenseActionIcon: {
            backgroundColor: colors.expenseIconBackground,
            width: 46,
            height: 46,
            borderRadius: radius.medium,
            alignItems: 'center',
            justifyContent: 'center',
        },

        actionText: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            fontWeight: typography.weights.semibold,
            color: colors.text,
        },

        pressedCard: {
            opacity: 0.75,
        },

        // RECENT TRANSACTIONS
        sectionHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: spacing.md,
            gap: spacing.md,
        },

        sectionTitle: {
            flexShrink: 1,
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.subtitle,
            fontWeight: typography.weights.semibold,
            color: colors.text,
        },

        seeAllButton: {
            minHeight: 44,
            justifyContent: 'center',
        },

        link: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            fontWeight: typography.weights.semibold,
            color: colors.primary,
        },

        recentCard: {
            width: '100%',
            backgroundColor: colors.surface,
            borderRadius: radius.large,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
        },

        transactionRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: isSmallScreen
                ? spacing.sm
                : spacing.md,
            minHeight: 76,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },

        transactionIcon: {
            width: 44,
            height: 44,
            borderRadius: radius.medium,
            alignItems: 'center',
            justifyContent: 'center',
        },

        transactionInfo: {
            flex: 1,
            minWidth: 0,
            gap: spacing.xs,
        },

        transactionTitle: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            fontWeight: typography.weights.semibold,
            color: colors.text,
        },

        recentIncome: {
            flexShrink: 1,
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            fontWeight: typography.weights.semibold,
            color: colors.success,
            textAlign: 'right',
        },

        recentExpense: {
            flexShrink: 1,
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            fontWeight: typography.weights.semibold,
            color: colors.error,
            textAlign: 'right',
        },

        emptyState: {
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 220,
            gap: spacing.md,
        },
    });
}