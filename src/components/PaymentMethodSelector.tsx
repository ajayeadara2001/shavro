import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
  Banknote,
  Building2,
  CreditCard,
  Ellipsis,
  Plus,
  Smartphone,
  Tag,
  Wallet,
  X,
  Settings2,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Check,
  type LucideIcon,
} from "lucide-react-native";

import {
  addCustomPaymentMethod,
  getCustomPaymentMethods,
  renameCustomPaymentMethod,
  setCustomPaymentMethodArchived,
  deleteCustomPaymentMethod,
  normalizeOptionName,
  type CustomPaymentMethod,
} from "../services/customOptionsStorage";

import {
  type ThemeColors,
  radius,
  spacing,
  typography,
} from "../constants/theme";

import { useAppTheme } from "../context/ThemeContext";

export interface PaymentMethod {
  id: string;
  name: string;
  icon: LucideIcon;
}

export const defaultPaymentMethods: PaymentMethod[] = [
  { id: "cash", name: "Cash", icon: Banknote },
  { id: "upi", name: "UPI", icon: Smartphone },
  { id: "debit_card", name: "Debit Card", icon: Wallet },
  { id: "credit_card", name: "Credit Card", icon: CreditCard },
  { id: "bank_transfer", name: "Bank Transfer", icon: Building2 },
  { id: "other", name: "Other", icon: Ellipsis },
];

interface PaymentMethodSelectorProps {
  selectedMethodId: string | null;
  onSelectMethod: (methodId: string) => void;
  title?: string;
  onAddMethod?: () => void;
  methods?: PaymentMethod[];
  otherMethodName?: string;
  onOtherMethodNameChange?: (name: string) => void;
}

const GRID_GAP = 12;
const MOBILE_BREAKPOINT = 420;
const MAX_METHOD_NAME_LENGTH = 40;

function confirmDelete(name: string): Promise<boolean> {
  const message =
    `Permanently delete "${name}"?\n\n` +
    "This cannot be undone. Methods used by saved transactions cannot be deleted.";

  if (Platform.OS === "web") {
    return Promise.resolve(
      typeof window !== "undefined" && window.confirm(message),
    );
  }

  return new Promise((resolve) => {
    Alert.alert(
      "Delete Payment Method",
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

export default function PaymentMethodSelector({
  selectedMethodId,
  onSelectMethod,
  title = "Payment Method",
  methods = defaultPaymentMethods,
  otherMethodName = "",
  onOtherMethodNameChange,
}: PaymentMethodSelectorProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isIncome = title === "Received Via";

  const [sectionWidth, setSectionWidth] = useState(0);
  const [customMethods, setCustomMethods] = useState<CustomPaymentMethod[]>([]);

  const [loadingMethods, setLoadingMethods] = useState(true);
  const [methodsError, setMethodsError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);

  const [newMethodName, setNewMethodName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadMethods = useCallback(async (): Promise<void> => {
    setLoadingMethods(true);
    setMethodsError(null);

    try {
      // Includes archived methods for management and history.
      const saved = await getCustomPaymentMethods();
      setCustomMethods(saved);
    } catch (error) {
      console.error("Failed to load custom payment methods:", error);
      setMethodsError("Unable to load saved payment methods.");
    } finally {
      setLoadingMethods(false);
    }
  }, []);

  useEffect(() => {
    void loadMethods();
  }, [loadMethods]);

  const displayedMethods = useMemo(() => {
    const existingIds = new Set(methods.map((method) => method.id));

    const extraMethods: PaymentMethod[] = customMethods
      .filter(
        (method) =>
          (!method.archived || method.id === selectedMethodId) &&
          !existingIds.has(method.id),
      )
      .map((method) => ({
        id: method.id,
        name: method.name,
        icon: Tag,
      }));

    const regular = methods.filter((method) => method.id !== "other");
    const other = methods.filter((method) => method.id === "other");

    return [...regular, ...extraMethods, ...other];
  }, [methods, customMethods, selectedMethodId]);

  const handleLayout = (event: LayoutChangeEvent): void => {
    const width = event.nativeEvent.layout.width;
    setSectionWidth((previous) =>
      Math.abs(previous - width) > 1 ? width : previous,
    );
  };

  // Preserve 2 / 3 / 6-column layout.
  const columns =
    sectionWidth >= 1100 ? 6 : sectionWidth >= MOBILE_BREAKPOINT ? 3 : 2;

  const cardWidth =
    sectionWidth > 0
      ? Math.max(0, (sectionWidth - GRID_GAP * (columns - 1)) / columns)
      : undefined;

  const openAdd = (): void => {
    setNewMethodName("");
    setAddError(null);
    setShowAddModal(true);
  };

  const closeAdd = (): void => {
    if (saving) return;

    setShowAddModal(false);
    setNewMethodName("");
    setAddError(null);
  };

  const handleAdd = async (): Promise<void> => {
    if (saving) return;

    const name = newMethodName.trim().replace(/\s+/g, " ");

    if (!name) {
      setAddError("Enter a payment method name.");
      return;
    }

    if (name.length > MAX_METHOD_NAME_LENGTH) {
      setAddError("Payment method name must be 40 characters or fewer.");
      return;
    }

    const existingNames = [
      ...methods.map((method) => method.name),
      ...customMethods.map((method) => method.name),
    ];

    if (
      existingNames.some(
        (existing) =>
          normalizeOptionName(existing) === normalizeOptionName(name),
      )
    ) {
      setAddError("This payment method already exists.");
      return;
    }

    setSaving(true);
    setAddError(null);

    try {
      const created = await addCustomPaymentMethod(name);
      await loadMethods();

      onSelectMethod(created.id);
      setShowAddModal(false);
      setNewMethodName("");
    } catch (error) {
      setAddError(
        error instanceof Error
          ? error.message
          : "Unable to save payment method.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openManage = (): void => {
    setEditingId(null);
    setManageError(null);
    setShowManageModal(true);
    void loadMethods();
  };

  const closeManage = (): void => {
    if (busyId) return;
    setEditingId(null);
    setManageError(null);
    setShowManageModal(false);
  };

  const startRename = (method: CustomPaymentMethod): void => {
    setEditingId(method.id);
    setEditingName(method.name);
    setManageError(null);
  };

  const handleRename = async (id: string): Promise<void> => {
    if (busyId) return;

    setBusyId(id);
    setManageError(null);

    try {
      await renameCustomPaymentMethod(id, editingName);
      await loadMethods();
      setEditingId(null);
      setEditingName("");
    } catch (error) {
      setManageError(
        error instanceof Error
          ? error.message
          : "Unable to rename payment method.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (method: CustomPaymentMethod): Promise<void> => {
    if (busyId) return;

    setBusyId(method.id);
    setManageError(null);

    try {
      await setCustomPaymentMethodArchived(method.id, !method.archived);
      await loadMethods();
    } catch (error) {
      setManageError(
        error instanceof Error
          ? error.message
          : "Unable to update payment method.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (method: CustomPaymentMethod): Promise<void> => {
    if (busyId) return;

    if (selectedMethodId === method.id) {
      setManageError(
        "Choose a different payment method before deleting this one.",
      );
      return;
    }

    const confirmed = await confirmDelete(method.name);
    if (!confirmed) return;

    setBusyId(method.id);
    setManageError(null);

    try {
      await deleteCustomPaymentMethod(method.id);
      await loadMethods();
    } catch (error) {
      setManageError(
        error instanceof Error
          ? error.message
          : "Unable to delete payment method.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const isOtherSelected = selectedMethodId === "other";

  return (
    <View style={styles.container}>
      <View style={styles.section} onLayout={handleLayout}>
        <View style={styles.header}>
          <Text style={styles.heading}>{title}</Text>

          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerButton}
              onPress={openManage}
              accessibilityRole="button"
              accessibilityLabel="Manage payment methods"
            >
              <Settings2 size={17} color={colors.textSecondary} />
              <Text style={styles.manageText}>Manage</Text>
            </Pressable>

            <Pressable
              style={styles.headerButton}
              onPress={openAdd}
              accessibilityRole="button"
              accessibilityLabel="Add a payment method"
            >
              <Plus size={18} color={colors.primary} />
              <Text style={styles.addText}>Add Method</Text>
            </Pressable>
          </View>
        </View>

        {loadingMethods && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.helperText}>Loading saved methods...</Text>
          </View>
        )}

        {methodsError && (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{methodsError}</Text>
            <Pressable
              onPress={() => void loadMethods()}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.grid}>
          {displayedMethods.map((method) => {
            const selected = selectedMethodId === method.id;

            const archived = customMethods.some(
              (custom) => custom.id === method.id && custom.archived,
            );

            const Icon = method.icon;

            return (
              <Pressable
                key={method.id}
                onPress={() => {
                  if (!archived) onSelectMethod(method.id);
                }}
                disabled={archived}
                accessibilityRole="button"
                accessibilityLabel={`${method.name}${
                  archived ? ", archived" : ""
                }`}
                accessibilityState={{
                  selected,
                  disabled: archived,
                }}
                style={[
                  styles.methodCard,
                  {
                    width:
                      cardWidth ??
                      (columns === 2 ? "48%" : columns === 3 ? "31%" : "15.5%"),
                  },
                  selected && styles.selectedCard,
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
                  style={[styles.methodText, selected && styles.selectedText]}
                >
                  {method.name}
                </Text>

                {archived && <Text style={styles.archivedLabel}>Archived</Text>}
              </Pressable>
            );
          })}
        </View>

        {isOtherSelected && (
          <View style={styles.otherContainer}>
            <Text style={styles.label}>Payment method name</Text>

            <TextInput
              style={styles.input}
              value={otherMethodName}
              onChangeText={onOtherMethodNameChange}
              placeholder="Enter payment method"
              placeholderTextColor={colors.textSecondary}
              maxLength={60}
              autoCapitalize="words"
              returnKeyType="done"
              accessibilityLabel="Custom payment method name"
            />

            <Text style={styles.helperText}>
              {isIncome
                ? "Enter how you received this income."
                : "Enter the payment method used for this transaction."}
            </Text>
          </View>
        )}
      </View>

      {/* Add Method */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={closeAdd}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Payment Method</Text>

              <Pressable
                onPress={closeAdd}
                disabled={saving}
                style={styles.closeButton}
                accessibilityRole="button"
              >
                <X size={22} color={colors.text} />
              </Pressable>
            </View>

            <Text style={styles.helperText}>
              Create a method you can use for both income and expenses.
            </Text>

            <Text style={styles.label}>Method name</Text>

            <TextInput
              style={styles.input}
              value={newMethodName}
              onChangeText={(value) => {
                setNewMethodName(value);
                setAddError(null);
              }}
              placeholder="e.g. Google Pay"
              placeholderTextColor={colors.textSecondary}
              maxLength={40}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
              returnKeyType="done"
              onSubmitEditing={() => void handleAdd()}
              accessibilityLabel="New payment method name"
            />

            {addError && <Text style={styles.errorText}>{addError}</Text>}

            <View style={styles.modalActions}>
              <Pressable
                onPress={closeAdd}
                disabled={saving}
                style={[styles.modalButton, styles.cancelButton]}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleAdd()}
                disabled={saving}
                style={[styles.modalButton, styles.saveButton]}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.saveText}>Save Method</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manage Methods */}
      <Modal
        visible={showManageModal}
        transparent
        animationType="fade"
        onRequestClose={closeManage}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Payment Methods</Text>

              <Pressable
                onPress={closeManage}
                disabled={busyId !== null}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close payment method management"
              >
                <X size={22} color={colors.text} />
              </Pressable>
            </View>

            <Text style={styles.helperText}>
              Rename, archive, restore or delete custom methods. Built-in
              methods are protected.
            </Text>

            {manageError && <Text style={styles.errorText}>{manageError}</Text>}

            <ScrollView
              style={styles.manageList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {customMethods.length === 0 ? (
                <Text style={styles.emptyText}>
                  No custom payment methods added yet.
                </Text>
              ) : (
                customMethods.map((method) => (
                  <View key={method.id} style={styles.manageItem}>
                    {editingId === method.id ? (
                      <>
                        <TextInput
                          style={styles.input}
                          value={editingName}
                          onChangeText={setEditingName}
                          maxLength={40}
                          autoFocus
                          editable={busyId === null}
                          placeholder="Payment method name"
                          placeholderTextColor={colors.textSecondary}
                        />

                        <View style={styles.manageActions}>
                          <Pressable
                            style={styles.smallButton}
                            onPress={() => void handleRename(method.id)}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                          >
                            <Check size={15} color={colors.primary} />
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
                          <Text style={styles.manageName}>{method.name}</Text>

                          {method.archived && (
                            <Text style={styles.archivedLabel}>Archived</Text>
                          )}
                        </View>

                        <View style={styles.manageActions}>
                          <Pressable
                            style={styles.smallButton}
                            onPress={() => startRename(method)}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`Rename ${method.name}`}
                          >
                            <Pencil size={15} color={colors.primary} />
                            <Text style={styles.addText}>Rename</Text>
                          </Pressable>

                          <Pressable
                            style={styles.smallButton}
                            onPress={() => void handleArchive(method)}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`${method.archived ? "Restore" : "Archive"} ${method.name}`}
                          >
                            {method.archived ? (
                              <ArchiveRestore
                                size={15}
                                color={colors.textSecondary}
                              />
                            ) : (
                              <Archive size={15} color={colors.textSecondary} />
                            )}
                            <Text style={styles.manageText}>
                              {method.archived ? "Restore" : "Archive"}
                            </Text>
                          </Pressable>

                          <Pressable
                            style={styles.smallButton}
                            onPress={() => void handleDelete(method)}
                            disabled={busyId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${method.name}`}
                          >
                            <Trash2 size={15} color={colors.error} />
                            <Text style={styles.deleteText}>Delete</Text>
                          </Pressable>
                        </View>

                        {busyId === method.id && (
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
    headerButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
    },
    addText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
      color: colors.primary,
    },
    manageText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      fontWeight: typography.weights.medium,
      color: colors.textSecondary,
    },
    grid: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: GRID_GAP,
      rowGap: GRID_GAP,
    },
    methodCard: {
      minHeight: 96,
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
    selectedCard: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.primaryLight,
    },
    archivedCard: {
      opacity: 0.65,
    },
    archivedLabel: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.caption,
      color: colors.textSecondary,
    },
    methodText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.text,
      textAlign: "center",
    },
    selectedText: {
      color: colors.primary,
      fontWeight: typography.weights.medium,
    },
    otherContainer: {
      width: "100%",
      marginTop: spacing.lg,
    },
    label: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    input: {
      width: "100%",
      minHeight: 56,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.medium,
      paddingHorizontal: spacing.lg,
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    helperText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.small,
      color: colors.textSecondary,
      marginTop: spacing.sm,
      lineHeight: 20,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    errorRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    errorText: {
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
      backgroundColor: "rgba(0,0,0,0.45)",
      padding: spacing.lg,
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
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.subtitle,
      fontWeight: typography.weights.bold,
      color: colors.text,
    },
    closeButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    modalActions: {
      flexDirection: "row",
      gap: spacing.md,
      marginTop: spacing.md,
    },
    modalButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: radius.medium,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    cancelButton: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    cancelText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
    },
    saveButton: {
      backgroundColor: colors.primary,
    },
    saveText: {
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.semibold,
      color: colors.background,
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
      fontFamily: typography.fontFamily,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color: colors.text,
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
      alignItems: "center",
      justifyContent: "center",
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
