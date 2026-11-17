import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";

import {
  CarFront,
  CirclePlay,
  Ellipsis,
  HeartPulse,
  House,
  Plus,
  ReceiptText,
  ShoppingBag,
  Tag,
  Utensils,
  Settings2,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  X,
  Check,
  type LucideIcon,
} from "lucide-react-native";

import {
  getCustomCategories,
  renameCustomCategory,
  setCustomCategoryArchived,
  deleteCustomCategory,
  type CategoryScope,
  type CustomCategory,
} from "../services/customOptionsStorage";

import AddCustomCategoryModal from "./AddCustomCategoryModal";

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: LucideIcon;
}

export const defaultExpenseCategories: ExpenseCategory[] = [
  { id: "food", name: "Food", icon: Utensils },
  { id: "transport", name: "Transport", icon: CarFront },
  { id: "bills", name: "Bills", icon: ReceiptText },
  { id: "shopping", name: "Shopping", icon: ShoppingBag },
  { id: "health", name: "Health", icon: HeartPulse },
  { id: "housing", name: "Housing", icon: House },
  { id: "entertainment", name: "Entertainment", icon: CirclePlay },
  { id: "other", name: "Other", icon: Ellipsis },
];

interface CategorySelectorProps {
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory?: () => void;
  categories?: ExpenseCategory[];
  otherExpenseName?: string;
  onOtherExpenseNameChange?: (name: string) => void;
  scope?: CategoryScope;
}

const GRID_GAP = 12;
const MOBILE_BREAKPOINT = 420;

function confirmDelete(name: string): Promise<boolean> {
  const message =
    `Permanently delete "${name}"?\n\n` +
    "This cannot be undone. Categories used by saved transactions cannot be deleted.";

  if (Platform.OS === "web") {
    return Promise.resolve(
      typeof window !== "undefined" && window.confirm(message),
    );
  }

  return new Promise((resolve) => {
    Alert.alert(
      "Delete Category",
      message,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      },
    );
  });
}

export default function CategorySelector({
  selectedCategoryId,
  onSelectCategory,
  categories = defaultExpenseCategories,
  otherExpenseName = "",
  onOtherExpenseNameChange,
  scope,
}: CategorySelectorProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [sectionWidth, setSectionWidth] = useState(0);

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(
    [],
  );

  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);

  const categoryScope: CategoryScope =
    scope ??
    (categories.some((category) => category.id === "salary")
      ? "INCOME"
      : "EXPENSE");

  // Load all custom categories, including archived
  // records needed for existing transactions.
  const loadCustomCategories = useCallback(async (): Promise<void> => {
    try {
      const saved = await getCustomCategories(categoryScope);
      setCustomCategories(saved);
      setLoadError(null);
    } catch (error) {
      console.error("Failed to load custom categories:", error);
      setLoadError("Unable to load saved categories.");
    }
  }, [categoryScope]);

  useEffect(() => {
    void loadCustomCategories();
  }, [loadCustomCategories]);

  const displayedCategories = useMemo(() => {
    const existingIds = new Set(categories.map((item) => item.id));

    const customOptions: ExpenseCategory[] = customCategories
      .filter(
        (item) =>
          (!item.archived || item.id === selectedCategoryId) &&
          !existingIds.has(item.id),
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        icon: Tag,
      }));

    const otherIndex = categories.findIndex((item) => item.id === "other");

    if (otherIndex === -1) {
      return [...categories, ...customOptions];
    }

    return [
      ...categories.slice(0, otherIndex),
      ...customOptions,
      ...categories.slice(otherIndex),
    ];
  }, [categories, customCategories, selectedCategoryId]);

  const existingCategoryNames = useMemo(
    () => [
      ...categories.map((item) => item.name),
      ...customCategories.map((item) => item.name),
    ],
    [categories, customCategories],
  );

  const handleCreated = (category: CustomCategory): void => {
    setCustomCategories((previous) =>
      previous.some((item) => item.id === category.id)
        ? previous
        : [...previous, category],
    );

    onSelectCategory(category.id);
    setShowAddModal(false);
  };

  const openManage = (): void => {
    setEditingId(null);
    setEditingName("");
    setManageError(null);
    setShowManageModal(true);
    void loadCustomCategories();
  };

  const closeManage = (): void => {
    if (busyId !== null) return;
    setShowManageModal(false);
    setEditingId(null);
    setManageError(null);
  };

  const startRename = (category: CustomCategory): void => {
    setEditingId(category.id);
    setEditingName(category.name);
    setManageError(null);
  };

  const saveRename = async (id: string): Promise<void> => {
    if (busyId) return;

    setBusyId(id);
    setManageError(null);

    try {
      await renameCustomCategory(id, editingName);
      await loadCustomCategories();
      setEditingId(null);
      setEditingName("");
    } catch (error) {
      setManageError(
        error instanceof Error ? error.message : "Unable to rename category.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleArchived = async (category: CustomCategory): Promise<void> => {
    if (busyId) return;

    setBusyId(category.id);
    setManageError(null);

    try {
      await setCustomCategoryArchived(category.id, !category.archived);
      await loadCustomCategories();
    } catch (error) {
      setManageError(
        error instanceof Error ? error.message : "Unable to update category.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const removeCategory = async (category: CustomCategory): Promise<void> => {
    if (busyId) return;

    // Avoid leaving the form with a deleted selection.
    if (selectedCategoryId === category.id) {
      setManageError("Choose a different category before deleting this one.");
      return;
    }

    const confirmed = await confirmDelete(category.name);
    if (!confirmed) return;

    setBusyId(category.id);
    setManageError(null);

    try {
      await deleteCustomCategory(category.id);
      await loadCustomCategories();
    } catch (error) {
      setManageError(
        error instanceof Error ? error.message : "Unable to delete category.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleLayout = (event: LayoutChangeEvent): void => {
    const width = event.nativeEvent.layout.width;
    setSectionWidth((previous) =>
      Math.abs(previous - width) > 1 ? width : previous,
    );
  };

  // Preserve original 2 / 4 / 8-column grid.
  const columns =
    sectionWidth >= 1100 ? 8 : sectionWidth >= MOBILE_BREAKPOINT ? 4 : 2;

  const cardWidth =
    sectionWidth > 0
      ? Math.max(0, (sectionWidth - GRID_GAP * (columns - 1)) / columns)
      : undefined;

  const showExpenseName =
    selectedCategoryId === "other" && categoryScope === "EXPENSE";

  return (
    <View style={styles.container}>
      <View style={styles.section} onLayout={handleLayout}>
        <View style={styles.header}>
          <Text style={styles.heading}>Category</Text>

          <View style={styles.headerActions}>
            <Pressable
              onPress={openManage}
              accessibilityRole="button"
              accessibilityLabel="Manage custom categories"
              style={styles.addButton}
            >
              <Settings2 size={17} color={colors.textSecondary} />
              <Text style={styles.manageText}>Manage</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowAddModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Add a new category"
              style={styles.addButton}
            >
              <Plus size={18} color={colors.primary} />
              <Text style={styles.addText}>Add Category</Text>
            </Pressable>
          </View>
        </View>

        {loadError && (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable
              onPress={() => void loadCustomCategories()}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.grid}>
          {displayedCategories.map((category) => {
            const selected = selectedCategoryId === category.id;
            const archived = customCategories.some(
              (item) => item.id === category.id && item.archived,
            );
            const Icon = category.icon;

            return (
              <Pressable
                key={category.id}
                onPress={() => {
                  if (!archived) onSelectCategory(category.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${category.name} category${
                  archived ? ", archived" : ""
                }`}
                accessibilityState={{
                  selected,
                  disabled: archived,
                }}
                disabled={archived}
                style={[
                  styles.categoryCard,
                  {
                    width:
                      cardWidth ??
                      (columns === 2 ? "48%" : columns === 4 ? "23%" : "11%"),
                  },
                  selected && styles.selectedCategoryCard,
                  archived && styles.archivedCard,
                ]}
              >
                <Icon
                  size={24}
                  strokeWidth={1.8}
                  color={selected ? colors.primary : colors.text}
                />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.categoryText,
                    selected && styles.selectedCategoryText,
                  ]}
                >
                  {category.name}
                </Text>
                {archived && <Text style={styles.archivedLabel}>Archived</Text>}
              </Pressable>
            );
          })}
        </View>

        {showExpenseName && (
          <View style={styles.otherInputContainer}>
            <Text style={styles.otherLabel}>Expense name</Text>

            <TextInput
              style={styles.otherInput}
              value={otherExpenseName}
              onChangeText={onOtherExpenseNameChange}
              placeholder="E.g., Haircut, Gift, Bike repair"
              placeholderTextColor={colors.textSecondary}
              maxLength={60}
              autoCapitalize="sentences"
              autoCorrect={false}
              returnKeyType="done"
              accessibilityLabel="Other expense name"
            />

            <Text style={styles.helperText}>
              Enter a name to identify this expense in your transaction history.
            </Text>
          </View>
        )}
      </View>

      <AddCustomCategoryModal
        visible={showAddModal}
        scope={categoryScope}
        existingNames={existingCategoryNames}
        onClose={() => setShowAddModal(false)}
        onCreated={handleCreated}
      />

      {/* Manage Categories dialog */}
      <Modal
        visible={showManageModal}
        transparent
        animationType="fade"
        onRequestClose={closeManage}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Manage {categoryScope === "INCOME" ? "Income" : "Expense"}{" "}
                Categories
              </Text>

              <Pressable
                onPress={closeManage}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel="Close category management"
                style={styles.closeButton}
              >
                <X size={22} color={colors.text} />
              </Pressable>
            </View>

            <Text style={styles.helperText}>
              Rename, archive, restore or delete your custom categories.
              Built-in categories cannot be changed.
            </Text>

            {manageError && <Text style={styles.errorText}>{manageError}</Text>}

            <ScrollView
              style={styles.manageList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {customCategories.length === 0 ? (
                <Text style={styles.emptyText}>
                  No custom categories added yet.
                </Text>
              ) : (
                customCategories.map((category) => (
                  <View key={category.id} style={styles.manageItem}>
                    {editingId === category.id ? (
                      <>
                        <TextInput
                          style={styles.otherInput}
                          value={editingName}
                          onChangeText={setEditingName}
                          placeholder="Category name"
                          placeholderTextColor={colors.textSecondary}
                          maxLength={40}
                          autoFocus
                          editable={busyId === null}
                          accessibilityLabel="Rename category"
                        />
                        <View style={styles.manageActions}>
                          <Pressable
                            style={styles.smallButton}
                            onPress={() => void saveRename(category.id)}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                          >
                            <Check size={16} color={colors.primary} />
                            <Text style={styles.addText}>Save</Text>
                          </Pressable>

                          <Pressable
                            style={styles.smallButton}
                            onPress={() => setEditingId(null)}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                          >
                            <Text style={styles.manageText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.manageNameRow}>
                          <Text style={styles.manageName}>{category.name}</Text>
                          {category.archived && (
                            <Text style={styles.archivedLabel}>Archived</Text>
                          )}
                        </View>

                        <View style={styles.manageActions}>
                          <Pressable
                            style={styles.smallButton}
                            onPress={() => startRename(category)}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`Rename ${category.name}`}
                          >
                            <Pencil size={15} color={colors.primary} />
                            <Text style={styles.addText}>Rename</Text>
                          </Pressable>

                          <Pressable
                            style={styles.smallButton}
                            onPress={() => void toggleArchived(category)}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`${category.archived ? "Restore" : "Archive"} ${category.name}`}
                          >
                            {category.archived ? (
                              <ArchiveRestore
                                size={15}
                                color={colors.textSecondary}
                              />
                            ) : (
                              <Archive size={15} color={colors.textSecondary} />
                            )}
                            <Text style={styles.manageText}>
                              {category.archived ? "Restore" : "Archive"}
                            </Text>
                          </Pressable>

                          <Pressable
                            style={styles.smallButton}
                            onPress={() => void removeCategory(category)}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${category.name}`}
                          >
                            <Trash2 size={15} color={colors.error} />
                            <Text style={styles.deleteText}>Delete</Text>
                          </Pressable>
                        </View>

                        {busyId === category.id && (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                        )}
                      </>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      minWidth: 0,
    },
    section: {
      width: "100%",
      minWidth: 0,
      alignSelf: "flex-start",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    heading: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.md,
    },
    addButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
    },
    addText: {
      fontFamily: typography.fontFamily,
      color: colors.primary,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
    },
    manageText: {
      fontFamily: typography.fontFamily,
      color: colors.textSecondary,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
    },
    grid: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: GRID_GAP,
      rowGap: GRID_GAP,
    },
    categoryCard: {
      minHeight: 94,
      minWidth: 0,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.large,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.sm,
      gap: spacing.sm,
      backgroundColor: colors.surface,
    },
    selectedCategoryCard: {
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    archivedCard: {
      opacity: 0.65,
    },
    archivedLabel: {
      fontFamily: typography.fontFamily,
      color: colors.textSecondary,
      fontSize: typography.sizes.caption,
    },
    categoryText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.text,
      textAlign: "center",
    },
    selectedCategoryText: {
      color: colors.primary,
      fontWeight: typography.weights.medium,
    },
    otherInputContainer: {
      width: "100%",
      marginTop: spacing.lg,
    },
    otherLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    otherInput: {
      width: "100%",
      minHeight: 56,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      paddingHorizontal: spacing.lg,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.text,
    },
    helperText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 20,
    },
    errorRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    errorText: {
      flex: 1,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.error,
      marginTop: spacing.sm,
    },
    retryText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.semibold,
      color: colors.primary,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    modalCard: {
      width: "100%",
      maxWidth: 480,
      maxHeight: "85%",
      alignSelf: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.large,
      padding: spacing.xl,
      gap: spacing.md,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.md,
    },
    modalTitle: {
      flex: 1,
      color: colors.text,
      fontSize: typography.sizes.subtitle,
      fontFamily: typography.fontFamily,
      fontWeight: typography.weights.bold,
    },
    closeButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    manageList: {
      flexGrow: 0,
    },
    manageItem: {
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: spacing.sm,
    },
    manageNameRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    manageName: {
      color: colors.text,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
    },
    manageActions: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    smallButton: {
      minHeight: 44,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
    },
    deleteText: {
      color: colors.error,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
    },
    emptyText: {
      fontFamily: typography.fontFamily,
      color: colors.textSecondary,
      paddingVertical: spacing.lg,
    },
  });
}
