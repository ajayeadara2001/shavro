import React, { useMemo, useState } from 'react';

import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
    ArrowLeft,
    Pencil,
    Trash2,
} from 'lucide-react-native';

import type { Income } from '../types/income';

import { deleteIncome } from '../services/incomeStorage';

import {
    type ThemeColors,
    layout,
    radius,
    spacing,
    typography,
} from '../constants/theme';

import { useAppTheme } from '../context/ThemeContext';
import { formatINR } from '../utils/money';

interface IncomeDetailsScreenProps {
    income: Income;
    onBack: () => void;
    onEdit: (income: Income) => void;
    onDeleted: () => void;
}



function formatName(value: string): string {
    return value
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (character) =>
            character.toUpperCase()
        );
}

function formatDate(value: string): string {
    const [year, month, day] = value
        .split('-')
        .map(Number);

    const date = new Date(year, month - 1, day);

    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
}

function confirmDelete(): Promise<boolean> {
    if (Platform.OS === 'web') {
        return Promise.resolve(
            window.confirm(
                'Delete this income?\n\nThis action cannot be undone.'
            )
        );
    }

    return new Promise((resolve) => {
        Alert.alert(
            'Delete Income',
            'Are you sure you want to delete this income?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => resolve(false),
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => resolve(true),
                },
            ],
            {
                cancelable: true,
                onDismiss: () => resolve(false),
            }
        );
    });
}

type DetailStyles = ReturnType<typeof createStyles>;

interface DetailRowProps {
    label: string;
    value: string;
    styles: DetailStyles;
}

function DetailRow({
    label,
    value,
    styles,
}: DetailRowProps) {
    return (
        <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
                {label}
            </Text>

            <Text style={styles.detailValue}>
                {value}
            </Text>
        </View>
    );
}

export default function IncomeDetailsScreen({
    income,
    onBack,
    onEdit,
    onDeleted,
}: IncomeDetailsScreenProps) {
    // Get active Light/Dark theme colors.
    const { colors } = useAppTheme();

    // Regenerate styles when theme changes.
    const styles = useMemo(
        () => createStyles(colors),
        [colors]
    );

    const [deleting, setDeleting] = useState(false);

    const category = formatName(income.categoryId);

    const handleDelete = async (): Promise<void> => {
        if (deleting) {
            return;
        }

        const confirmed = await confirmDelete();

        if (!confirmed) {
            return;
        }

        setDeleting(true);

        try {
            await deleteIncome(income.id);

            onDeleted();
        } catch (error) {
            console.error(
                'Income deletion failed:',
                error
            );

            if (Platform.OS === 'web') {
                window.alert(
                    'Unable to delete income.'
                );
            } else {
                Alert.alert(
                    'Delete Failed',
                    'Unable to delete income. Please try again.'
                );
            }
        } finally {
            setDeleting(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Pressable
                        onPress={onBack}
                        accessibilityRole="button"
                        accessibilityLabel="Back to transactions"
                        style={styles.backButton}
                    >
                        <ArrowLeft
                            size={24}
                            color={colors.text}
                        />
                    </Pressable>

                    <Text style={styles.heading}>
                        Income Details
                    </Text>
                </View>

                {/* Income Amount Card */}
                <View style={styles.amountCard}>
                    <Text style={styles.amountLabel}>
                        INCOME
                    </Text>

                    <Text style={styles.amount}>
                        +{formatINR(income.amount)}
                    </Text>

                    <Text style={styles.subtitle}>
                        {income.incomeName || category}
                    </Text>
                </View>

                {/* Income Information */}
                <View style={styles.detailsCard}>
                    <DetailRow
                        styles={styles}
                        label="Category"
                        value={category}
                    />

                    {income.incomeName ? (
                        <DetailRow
                            styles={styles}
                            label="Income Name"
                            value={income.incomeName}
                        />
                    ) : null}

                    <DetailRow
                        styles={styles}
                        label="Transaction Date"
                        value={formatDate(
                            income.transactionDate
                        )}
                    />

                    <DetailRow
                        styles={styles}
                        label="Notes"
                        value={
                            income.notes || 'No notes added'
                        }
                    />

                    <DetailRow
                        styles={styles}
                        label="Recorded On"
                        value={new Date(
                            income.createdAt
                        ).toLocaleString('en-IN')}
                    />
                </View>

                {/* Action Buttons */}
                <View style={styles.actions}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.editButton,
                            pressed && styles.pressed,
                            deleting && styles.disabled,
                        ]}
                        onPress={() => onEdit(income)}
                        disabled={deleting}
                        accessibilityRole="button"
                        accessibilityLabel="Edit income"
                    >
                        <Pencil
                            size={19}
                            color={colors.primary}
                        />

                        <Text style={styles.editText}>
                            Edit Income
                        </Text>
                    </Pressable>

                    <Pressable
                        style={({ pressed }) => [
                            styles.deleteButton,
                            pressed && styles.pressed,
                            deleting && styles.disabled,
                        ]}
                        onPress={() => void handleDelete()}
                        disabled={deleting}
                        accessibilityRole="button"
                        accessibilityLabel="Delete income"
                    >
                        <Trash2
                            size={19}
                            color={colors.error}
                        />

                        <Text style={styles.deleteText}>
                            {deleting
                                ? 'Deleting...'
                                : 'Delete Income'}
                        </Text>
                    </Pressable>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

// Dynamic styles for Light, Dark and System themes.
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
            gap: spacing.lg,
            marginBottom: spacing.xl,
        },

        backButton: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.medium,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
        },

        heading: {
            flexShrink: 1,
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.heading,
            fontWeight: typography.weights.bold,
            color: colors.text,
        },

        amountCard: {
            backgroundColor: colors.incomeSurface,
            borderWidth: 1,
            borderColor: colors.incomeBorder,
            padding: spacing.xl,
            borderRadius: radius.large,
            marginBottom: spacing.xl,
        },

        amountLabel: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.small,
            fontWeight: typography.weights.semibold,
            color: colors.success,
        },

        amount: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.amount,
            fontWeight: typography.weights.bold,
            color: colors.success,
            marginTop: spacing.sm,
        },

        subtitle: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            color: colors.textSecondary,
            marginTop: spacing.sm,
        },

        detailsCard: {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.large,
            paddingHorizontal: spacing.lg,
        },

        detailRow: {
            paddingVertical: spacing.lg,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
            gap: spacing.xs,
        },

        detailLabel: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.small,
            color: colors.textSecondary,
        },

        detailValue: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            fontWeight: typography.weights.medium,
            color: colors.text,
        },

        actions: {
            gap: spacing.md,
            marginTop: spacing.xl,
        },

        editButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            minHeight: 48,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
            borderRadius: radius.medium,
            paddingHorizontal: spacing.lg,
        },

        editText: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            color: colors.primary,
            fontWeight: typography.weights.semibold,
        },

        deleteButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            minHeight: 48,
            borderWidth: 1,
            borderColor: colors.error,
            backgroundColor: colors.surface,
            borderRadius: radius.medium,
            paddingHorizontal: spacing.lg,
        },

        deleteText: {
            fontFamily: typography.fontFamily,
            fontSize: typography.sizes.body,
            color: colors.error,
            fontWeight: typography.weights.semibold,
        },

        pressed: {
            opacity: 0.8,
        },

        disabled: {
            opacity: 0.5,
        },
    });
}