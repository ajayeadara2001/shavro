import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { X } from "lucide-react-native";

import { useAppTheme } from "../context/ThemeContext";

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import {
  addCustomCategory,
  getCustomCategories,
  normalizeOptionName,
  type CategoryScope,
  type CustomCategory,
} from "../services/customOptionsStorage";

interface AddCustomCategoryModalProps {
  visible: boolean;
  scope: CategoryScope;
  existingNames: string[];
  onClose: () => void;
  onCreated: (category: CustomCategory) => void;
}

const MAX_CATEGORY_NAME_LENGTH = 40;

// Clean the name for display and storage.
//
// "  Pet   Care  " -> "Pet Care"
function cleanCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export default function AddCustomCategoryModal({
  visible,
  scope,
  existingNames,
  onClose,
  onCreated,
}: AddCustomCategoryModalProps) {
  const { colors } = useAppTheme();

  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Ref protects against repeated taps
  // before the loading state updates.
  const savingRef = useRef(false);

  const cleanName = cleanCategoryName(name);

  // Reset form whenever the modal opens.
  useEffect(() => {
    if (visible) {
      setName("");
      setError(null);
    }
  }, [visible, scope]);

  const closeModal = (): void => {
    if (savingRef.current) {
      return;
    }

    Keyboard.dismiss();

    setName("");
    setError(null);

    onClose();
  };

  const handleSave = async (): Promise<void> => {
    if (savingRef.current) {
      return;
    }

    // 1. Required name validation.
    if (!cleanName) {
      setError("Please enter a category name.");
      return;
    }

    // 2. Character limit validation.
    if (cleanName.length > MAX_CATEGORY_NAME_LENGTH) {
      setError("Category name must be 40 characters or fewer.");
      return;
    }

    // 3. Normalize for duplicate detection.
    //
    // Gift Card = giftCard = gift_card
    // = GIFT-CARD
    const normalizedName = normalizeOptionName(cleanName);

    // 4. Check names already known
    // to CategorySelector.
    //
    // This includes displayed built-in
    // and saved custom category names.
    const existingDuplicate = existingNames.some(
      (existing) => normalizeOptionName(existing) === normalizedName,
    );

    if (existingDuplicate) {
      setError("This category already exists.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      // 5. Check the latest saved categories.
      //
      // getCustomCategories includes archived
      // records, protecting historical names.
      const stored = await getCustomCategories(scope);

      const storedDuplicate = stored.some(
        (category) => normalizeOptionName(category.name) === normalizedName,
      );

      if (storedDuplicate) {
        setError("This category already exists.");
        return;
      }

      // 6. Save the category.
      //
      // The storage service performs
      // the final validation, including
      // built-in category names.
      const category = await addCustomCategory(cleanName, scope);

      // 7. Clear form and dismiss keyboard.
      Keyboard.dismiss();

      setName("");
      setError(null);

      // 8. Parent will add the category to
      // the grid, select it and close modal.
      onCreated(category);
    } catch (saveError) {
      console.error("Unable to save custom category:", saveError);

      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save category. Try again.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeModal}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headingContent}>
              <Text style={styles.title}>Add Category</Text>

              <Text style={styles.subtitle}>
                {scope === "INCOME"
                  ? "Create a new income category."
                  : "Create a new expense category."}
              </Text>
            </View>

            <Pressable
              onPress={closeModal}
              disabled={saving}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityState={{
                disabled: saving,
              }}
            >
              <X size={22} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Category Name */}
            <Text style={styles.label}>Category Name</Text>

            <TextInput
              value={name}
              onChangeText={(value) => {
                setName(value);

                if (error !== null) {
                  setError(null);
                }
              }}
              placeholder={
                scope === "INCOME" ? "e.g. Freelance Work" : "e.g. Pet Care"
              }
              placeholderTextColor={colors.textSecondary}
              maxLength={MAX_CATEGORY_NAME_LENGTH}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                void handleSave();
              }}
              editable={!saving}
              accessibilityLabel="Category Name"
              style={[styles.input, error !== null && styles.inputError]}
            />

            {/* Character Counter */}
            <Text style={styles.helpText}>
              {cleanName.length}/{MAX_CATEGORY_NAME_LENGTH} characters
            </Text>

            {/* Validation Error */}
            {error !== null && (
              <Text style={styles.errorText} accessibilityRole="alert">
                {error}
              </Text>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable
                onPress={closeModal}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel category creation"
                accessibilityState={{
                  disabled: saving,
                }}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleSave()}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Save category"
                accessibilityState={{
                  disabled: saving,
                }}
                style={[styles.saveButton, saving && styles.disabledButton]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveText}>Save Category</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
    },

    dialog: {
      width: "100%",
      maxWidth: 420,
      maxHeight: "85%",
      backgroundColor: colors.surface,
      borderRadius: radius.large,
      padding: spacing.lg,
    },

    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
      marginBottom: spacing.lg,
    },

    headingContent: {
      flex: 1,
    },

    title: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },

    subtitle: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      lineHeight: 20,
    },

    closeButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },

    content: {
      gap: spacing.sm,
    },

    label: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
    },

    input: {
      minHeight: 54,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      backgroundColor: colors.background,
      color: colors.text,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
    },

    inputError: {
      borderColor: colors.error,
    },

    helpText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      textAlign: "right",
    },

    errorText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.error,
    },

    actions: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.lg,
    },

    cancelButton: {
      flex: 1,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
    },

    cancelText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
    },

    saveButton: {
      flex: 1.5,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      borderRadius: radius.medium,
    },

    saveText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: "#FFFFFF",
    },

    disabledButton: {
      opacity: 0.6,
    },
  });
}
