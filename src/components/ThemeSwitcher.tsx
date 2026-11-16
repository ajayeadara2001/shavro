
import React, { useState } from 'react';

import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    Check,
    Monitor,
    Moon,
    Sun,
} from 'lucide-react-native';

import { useAppTheme } from '../context/ThemeContext';

import {
    radius,
    spacing,
    typography,
    type ThemePreference,
} from '../constants/theme';

const OPTIONS: {
    value: ThemePreference;
    label: string;
    description: string;
}[] = [
        {
            value: 'light',
            label: 'Light',
            description: 'Always use light mode',
        },
        {
            value: 'dark',
            label: 'Dark',
            description: 'Always use dark mode',
        },
        {
            value: 'system',
            label: 'System',
            description: 'Follow device appearance',
        },
    ];

export default function ThemeSwitcher() {
    const {
        colors,
        preference,
        setPreference,
    } = useAppTheme();

    const [visible, setVisible] = useState(false);

    const closeModal = () => setVisible(false);

    return (
        <>
            <Pressable
                onPress={() => setVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Change app appearance"
                style={[
                    styles.trigger,
                    {
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                    },
                ]}
            >
                {preference === 'light' ? (
                    <Sun size={21} color={colors.text} />
                ) : preference === 'dark' ? (
                    <Moon size={21} color={colors.text} />
                ) : (
                    <Monitor size={21} color={colors.text} />
                )}
            </Pressable>

            <Modal
                visible={visible}
                transparent
                animationType="fade"
                onRequestClose={closeModal}
            >
                <View style={styles.overlay}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={closeModal}
                        accessibilityRole="button"
                        accessibilityLabel="Close appearance settings"
                    />
                    <View
                        style={[
                            styles.modalCard,
                            {
                                backgroundColor: colors.surface,
                                borderColor: colors.border,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.title,
                                { color: colors.text },
                            ]}
                        >
                            Appearance
                        </Text>

                        <Text
                            style={[
                                styles.subtitle,
                                { color: colors.textSecondary },
                            ]}
                        >
                            Choose how Shavro looks.
                        </Text>

                        {OPTIONS.map((option) => {
                            const selected =
                                preference === option.value;

                            return (
                                <Pressable
                                    key={option.value}
                                    onPress={() => {
                                        setPreference(option.value);
                                        closeModal();
                                    }}
                                    accessibilityRole="radio"
                                    accessibilityState={{
                                        selected,
                                    }}
                                    style={[
                                        styles.option,
                                        {
                                            borderColor: selected
                                                ? colors.primary
                                                : colors.border,
                                            backgroundColor: selected
                                                ? colors.primaryLight
                                                : colors.surface,
                                        },
                                    ]}
                                >
                                    <View style={styles.optionIcon}>
                                        {option.value === 'light' ? (
                                            <Sun
                                                size={21}
                                                color={colors.text}
                                            />
                                        ) : option.value === 'dark' ? (
                                            <Moon
                                                size={21}
                                                color={colors.text}
                                            />
                                        ) : (
                                            <Monitor
                                                size={21}
                                                color={colors.text}
                                            />
                                        )}
                                    </View>

                                    <View style={styles.optionText}>
                                        <Text
                                            style={[
                                                styles.optionLabel,
                                                { color: colors.text },
                                            ]}
                                        >
                                            {option.label}
                                        </Text>

                                        <Text
                                            style={[
                                                styles.optionDescription,
                                                {
                                                    color: colors.textSecondary,
                                                },
                                            ]}
                                        >
                                            {option.description}
                                        </Text>
                                    </View>

                                    {selected && (
                                        <Check
                                            size={20}
                                            color={colors.primary}
                                        />
                                    )}
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    trigger: {
        width: 44,
        height: 44,
        borderRadius: radius.medium,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },

    modalCard: {
        borderWidth: 1,
        borderRadius: radius.extraLarge,
        padding: spacing.xl,
        gap: spacing.md,
    },

    title: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.heading,
        fontWeight: typography.weights.bold,
    },

    subtitle: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.small,
        marginBottom: spacing.sm,
    },

    option: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 68,
        padding: spacing.md,
        borderWidth: 1,
        borderRadius: radius.medium,
        gap: spacing.md,
    },

    optionIcon: {
        width: 28,
        alignItems: 'center',
    },

    optionText: {
        flex: 1,
        gap: 4,
    },

    optionLabel: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.body,
        fontWeight: typography.weights.semibold,
    },

    optionDescription: {
        fontFamily: typography.fontFamily,
        fontSize: typography.sizes.caption,
    },
});
