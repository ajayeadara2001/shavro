import React, { useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Info,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react-native";

import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

import { useAppTheme } from "../context/ThemeContext";
import { exportShavroBackupFile } from "../services/backupFileExport";
import { prepareShavroRestore } from "../services/backupRestore";
import { applyShavroRestore } from "../services/backupRestoreWrite";

import type { ShavroBackupSummary } from "../types/backup";

// =========================================
// CONSTANTS
// =========================================

const MAX_BACKUP_FILE_SIZE = 10 * 1024 * 1024;

const DESKTOP_BREAKPOINT = 1000;
const TABLET_BREAKPOINT = 600;

// Deliberately disabled until disposable-data
// end-to-end restore testing is complete.
const RESTORE_EXECUTION_ENABLED = true;

// =========================================
// TYPES
// =========================================

interface SelectedBackup {
  filename: string;
  summary: ShavroBackupSummary;
  json: string;
}

interface BackupSummaryItem {
  label: string;
  count: number;
}

interface BackupRestoreScreenProps {
  onRestoreCompleted?: () => void;
  onRestoreSafetyFailure?: () => void;
}

// =========================================
// BACKUP & RESTORE SCREEN
// =========================================

export default function BackupRestoreScreen({
  onRestoreCompleted,
  onRestoreSafetyFailure,
}: BackupRestoreScreenProps) {
  const { colors, isDark } = useAppTheme();

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // =======================================
  // RESPONSIVE LAYOUT
  // =======================================

  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;

  const isTablet = width >= TABLET_BREAKPOINT && !isDesktop;

  const horizontalPadding = isDesktop ? 40 : isTablet ? 28 : 20;

  const contentPaddingTop = isDesktop ? 32 : 20;

  // =======================================
  // OPERATION STATE
  // =======================================

  const [exporting, setExporting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedBackup, setSelectedBackup] = useState<SelectedBackup | null>(
    null,
  );

  const [showRestoreConfirmation, setShowRestoreConfirmation] = useState(false);

  const exportingRef = useRef(false);
  const selectingRef = useRef(false);
  const confirmationRef = useRef(false);
  const restoringRef = useRef(false);

  const secondaryColor = colors.textSecondary;
  const white = "#FFFFFF";

  const busy = exporting || selecting || restoring;

  // =======================================
  // BACKUP EXPORT
  // =======================================

  async function handleExport(): Promise<void> {
    if (
      exportingRef.current ||
      selectingRef.current ||
      confirmationRef.current ||
      restoringRef.current
    ) {
      return;
    }

    exportingRef.current = true;

    setExporting(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const filename = await exportShavroBackupFile();

      const successMessage =
        Platform.OS === "web"
          ? `Download requested: ${filename}. Check your browser downloads.`
          : `Backup sharing opened for ${filename}. Verify that you saved the file to a permanent location.`;

      setMessage(successMessage);

      if (Platform.OS !== "web") {
        Alert.alert(
          "Backup prepared",
          "If you selected a save destination, verify that the JSON file was saved successfully.",
        );
      }
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : "Unable to export backup.";

      setErrorMessage(errorText);

      if (Platform.OS !== "web") {
        Alert.alert("Backup export failed", errorText);
      }
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  // =======================================
  // SELECT BACKUP FILE
  // =======================================

  async function handleSelectBackup(): Promise<void> {
    if (
      selectingRef.current ||
      exportingRef.current ||
      confirmationRef.current ||
      restoringRef.current
    ) {
      return;
    }

    selectingRef.current = true;

    setSelecting(true);
    setMessage(null);
    setErrorMessage(null);

    setSelectedBackup(null);
    setShowRestoreConfirmation(false);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        throw new Error("No backup file was selected.");
      }

      if (!asset.name.toLowerCase().endsWith(".json")) {
        throw new Error("Please select a Shavro JSON backup file.");
      }

      if (asset.size !== undefined && asset.size > MAX_BACKUP_FILE_SIZE) {
        throw new Error(
          "The backup file is too large. Maximum allowed size is 10 MB.",
        );
      }

      let json: string;

      if (Platform.OS === "web") {
        if (!asset.file) {
          throw new Error("Unable to read the selected browser file.");
        }

        json = await asset.file.text();
      } else {
        const file = new File(asset.uri);
        json = await file.text();
      }

      if (json.length > MAX_BACKUP_FILE_SIZE) {
        throw new Error("The backup exceeds the allowed size.");
      }

      // Validation is read-only.
      const prepared = prepareShavroRestore(json);

      setSelectedBackup({
        filename: asset.name,
        summary: prepared.summary,
        json,
      });

      setMessage("Backup validated successfully. Review its contents below.");
    } catch (error) {
      const errorText =
        error instanceof Error
          ? error.message
          : "Unable to read the selected backup.";

      setErrorMessage(errorText);

      if (Platform.OS !== "web") {
        Alert.alert("Invalid backup", errorText);
      }
    } finally {
      selectingRef.current = false;
      setSelecting(false);
    }
  }

  // =======================================
  // CLEAR SELECTED BACKUP
  // =======================================

  function clearSelectedBackup(): void {
    if (
      exportingRef.current ||
      selectingRef.current ||
      confirmationRef.current ||
      restoringRef.current
    ) {
      return;
    }

    setSelectedBackup(null);
    setMessage(null);
    setErrorMessage(null);
    setShowRestoreConfirmation(false);
  }

  // =======================================
  // REVIEW RESTORE CONFIRMATION
  // =======================================

  function openRestoreConfirmation(): void {
    if (
      !selectedBackup ||
      exportingRef.current ||
      selectingRef.current ||
      confirmationRef.current ||
      restoringRef.current
    ) {
      return;
    }

    setErrorMessage(null);

    try {
      const prepared = prepareShavroRestore(selectedBackup.json);

      setSelectedBackup({
        ...selectedBackup,
        summary: prepared.summary,
      });

      confirmationRef.current = true;
      setShowRestoreConfirmation(true);
    } catch (error) {
      confirmationRef.current = false;
      setShowRestoreConfirmation(false);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The selected backup is no longer valid.",
      );
    }
  }

  // =======================================
  // CLOSE CONFIRMATION
  // =======================================

  function closeRestoreConfirmation(): void {
    if (restoringRef.current) {
      return;
    }

    confirmationRef.current = false;
    setShowRestoreConfirmation(false);
  }

  // =======================================
  // PROTECTED RESTORE EXECUTION
  // =======================================

  async function handleConfirmRestore(): Promise<void> {
    if (
      !RESTORE_EXECUTION_ENABLED ||
      restoringRef.current ||
      exportingRef.current ||
      selectingRef.current ||
      !confirmationRef.current ||
      !selectedBackup
    ) {
      return;
    }

    restoringRef.current = true;

    setRestoring(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      // Revalidate the original selected JSON
      // at the time of execution.
      const prepared = prepareShavroRestore(selectedBackup.json);

      // Protected restore engine handles
      // storage locking, rollback and integrity.
      await applyShavroRestore(prepared.backup);

      confirmationRef.current = false;
      setShowRestoreConfirmation(false);
      setSelectedBackup(null);

      onRestoreCompleted?.();
    } catch (error) {
      const errorText =
        error instanceof Error ? error.message : "Unable to complete restore.";

      console.error("Shavro restore was not completed:", error);

      setErrorMessage(errorText);

      confirmationRef.current = false;
      setShowRestoreConfirmation(false);

      // Re-check safety before financial
      // screens can be used again.
      onRestoreSafetyFailure?.();

      if (Platform.OS !== "web") {
        Alert.alert("Restore needs verification", errorText);
      }
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
  }

  // =======================================
  // FORMATTING
  // =======================================

  function formatBackupDate(value: string): string {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // =======================================
  // BACKUP SUMMARY
  // =======================================

  const summaryItems: BackupSummaryItem[] = selectedBackup
    ? [
        {
          label: "Expenses",
          count: selectedBackup.summary.expenseCount,
        },
        {
          label: "Income",
          count: selectedBackup.summary.incomeCount,
        },
        {
          label: "Custom Categories",
          count: selectedBackup.summary.customCategoryCount,
        },
        {
          label: "Payment Methods",
          count: selectedBackup.summary.customPaymentMethodCount,
        },
      ]
    : [];

  const cardColors = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };

  const blueButtonColors = {
    borderColor: colors.primary,
    backgroundColor: isDark ? "#202C46" : "#EFF6FF",
  };

  // =======================================
  // RENDER
  // =======================================

  return (
    <>
      <ScrollView
        style={[
          styles.screen,
          {
            backgroundColor: colors.background,
          },
        ]}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
            paddingTop: contentPaddingTop,
          },
          isDesktop && styles.desktopContent,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* PAGE HEADER */}

        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              isDesktop && styles.desktopTitle,
              { color: colors.text },
            ]}
          >
            Backup & Restore
          </Text>

          <Text style={[styles.subtitle, { color: secondaryColor }]}>
            Keep a copy of your financial records and restore them when needed.
          </Text>
        </View>

        {/* MAIN RESPONSIVE GRID */}

        <View style={[styles.mainGrid, isDesktop && styles.desktopGrid]}>
          {/* EXPORT BACKUP CARD */}

          <View
            style={[styles.card, cardColors, isDesktop && styles.desktopCard]}
          >
            <View style={styles.cardHeading}>
              <View
                style={[
                  styles.iconContainer,
                  {
                    backgroundColor: isDark ? "#253654" : "#DBEAFE",
                  },
                ]}
              >
                <Download size={22} color={colors.primary} />
              </View>

              <View style={styles.headingText}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Export Backup
                </Text>

                <Text style={[styles.description, { color: secondaryColor }]}>
                  Save your income, expenses, custom categories, and payment
                  methods.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor: colors.primary,
                },
                busy && styles.disabledButton,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Export Shavro backup"
              accessibilityState={{
                disabled: busy,
              }}
              disabled={busy}
              onPress={handleExport}
              activeOpacity={0.8}
            >
              {exporting ? (
                <ActivityIndicator color={white} />
              ) : (
                <>
                  <Download size={18} color={white} />

                  <Text style={styles.primaryButtonText}>Export Backup</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.helperText, { color: secondaryColor }]}>
              Creates a JSON backup file. Your existing records will not be
              changed.
            </Text>
          </View>

          {/* RESTORE BACKUP CARD */}

          <View
            style={[styles.card, cardColors, isDesktop && styles.desktopCard]}
          >
            <View style={styles.cardHeading}>
              <View
                style={[
                  styles.iconContainer,
                  {
                    backgroundColor: isDark ? "#30343B" : "#E5E7EB",
                  },
                ]}
              >
                <Upload size={22} color={secondaryColor} />
              </View>

              <View style={styles.headingText}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Restore Backup
                </Text>

                <Text style={[styles.description, { color: secondaryColor }]}>
                  Select a previously exported Shavro JSON backup to review its
                  contents.
                </Text>
              </View>
            </View>

            {/* FILE SELECTION */}

            <TouchableOpacity
              style={[
                styles.selectButton,
                blueButtonColors,
                busy && styles.disabledButton,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Select backup JSON file"
              accessibilityState={{
                disabled: busy,
              }}
              disabled={busy}
              onPress={handleSelectBackup}
              activeOpacity={0.8}
            >
              {selecting ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <FileJson size={19} color={colors.primary} />

                  <Text
                    style={[styles.selectButtonText, { color: colors.primary }]}
                  >
                    Select Backup File
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* VALIDATED BACKUP PREVIEW */}

            {selectedBackup && (
              <View
                style={[
                  styles.previewCard,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              >
                <View style={styles.previewHeader}>
                  <CheckCircle2 size={21} color="#16A34A" />

                  <View style={styles.previewHeadingText}>
                    <Text style={[styles.previewTitle, { color: colors.text }]}>
                      Backup validated
                    </Text>

                    <Text
                      numberOfLines={2}
                      style={[styles.fileName, { color: secondaryColor }]}
                    >
                      {selectedBackup.filename}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={clearSelectedBackup}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Clear selected backup"
                    style={styles.clearButton}
                  >
                    <X size={19} color={secondaryColor} />
                  </TouchableOpacity>
                </View>

                {/* BACKUP DATE */}

                <Text style={[styles.backupDate, { color: secondaryColor }]}>
                  Created: {formatBackupDate(selectedBackup.summary.createdAt)}
                </Text>

                {/* RECORD COUNTS */}

                <View style={styles.summaryGrid}>
                  {summaryItems.map((item) => (
                    <View
                      key={item.label}
                      style={[
                        styles.summaryItem,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.summaryCount, { color: colors.text }]}
                      >
                        {item.count}
                      </Text>

                      <Text
                        style={[styles.summaryLabel, { color: secondaryColor }]}
                      >
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* WARNING */}

                <View style={styles.warningRow}>
                  <AlertCircle size={18} color="#F59E0B" />

                  <Text style={[styles.warningText, { color: secondaryColor }]}>
                    Restoring this backup will replace the financial records
                    currently stored in Shavro.
                  </Text>
                </View>

                {/* REVIEW RESTORE */}

                <TouchableOpacity
                  style={[
                    styles.reviewButton,
                    blueButtonColors,
                    busy && styles.disabledButton,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Review backup restoration"
                  accessibilityState={{
                    disabled: busy,
                  }}
                  disabled={busy}
                  onPress={openRestoreConfirmation}
                  activeOpacity={0.8}
                >
                  <ShieldCheck size={18} color={colors.primary} />

                  <Text
                    style={[styles.reviewButtonText, { color: colors.primary }]}
                  >
                    Review Restore
                  </Text>
                </TouchableOpacity>

                {/* RESTORE NOW REMAINS DISABLED */}

                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    {
                      borderColor: colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Restore selected backup"
                  accessibilityState={{
                    disabled: true,
                  }}
                  disabled
                >
                  <Upload size={18} color={secondaryColor} />

                  <Text
                    style={[
                      styles.secondaryButtonText,
                      { color: secondaryColor },
                    ]}
                  >
                    Restore Now
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.helperText, { color: secondaryColor }]}>
                  Review the restore confirmation. Financial data replacement
                  remains disabled until final safety testing.
                </Text>
              </View>
            )}

            {/* NO FILE SELECTED */}

            {!selectedBackup && (
              <Text style={[styles.helperText, { color: secondaryColor }]}>
                Select a JSON file to validate it. Your current records will not
                be changed.
              </Text>
            )}
          </View>
        </View>

        {/* PRIVACY INFORMATION */}

        <View style={[styles.infoCard, cardColors]}>
          <View style={styles.infoHeading}>
            <ShieldCheck size={20} color={colors.primary} />

            <Text style={[styles.infoTitle, { color: colors.text }]}>
              Your data stays in your control
            </Text>
          </View>

          <Text style={[styles.description, { color: secondaryColor }]}>
            Backups are generated from financial records stored on your device.
            Exporting does not change your data.
          </Text>

          <View style={styles.infoHeading}>
            <Info size={18} color={secondaryColor} />

            <Text
              style={[
                styles.helperText,
                {
                  color: secondaryColor,
                  flex: 1,
                },
              ]}
            >
              Backup files are not encrypted. Store them securely and avoid
              sharing them with others.
            </Text>
          </View>
        </View>

        {/* SUCCESS MESSAGE */}

        {message && (
          <View
            style={[styles.message, cardColors]}
            accessibilityLiveRegion="polite"
          >
            <CheckCircle2 size={18} color="#16A34A" />

            <Text style={[styles.messageText, { color: colors.text }]}>
              {message}
            </Text>
          </View>
        )}

        {/* ERROR MESSAGE */}

        {errorMessage && (
          <View
            style={[
              styles.message,
              {
                backgroundColor: isDark ? "#351D1D" : "#FEF2F2",
                borderColor: isDark ? "#7F3535" : "#FECACA",
              },
            ]}
            accessibilityLiveRegion="polite"
          >
            <AlertCircle size={18} color="#EF4444" />

            <Text
              style={[
                styles.messageText,
                {
                  color: isDark ? "#FCA5A5" : "#B91C1C",
                },
              ]}
            >
              {errorMessage}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* RESTORE CONFIRMATION MODAL */}

      <Modal
        visible={showRestoreConfirmation && selectedBackup !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!restoringRef.current) {
            closeRestoreConfirmation();
          }
        }}
        statusBarTranslucent
        accessibilityViewIsModal
      >
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom, 18),
            },
          ]}
        >
          {/* BACKDROP */}

          {/* BACKDROP — BLOCK CLICKS, DO NOT DISMISS */}

          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(event) => {
              event.stopPropagation();
            }}
            accessibilityRole="button"
            accessibilityLabel="Restore confirmation backdrop"
          />

          {/* MODAL CARD */}

          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* MODAL HEADER */}

              <View style={styles.modalHeading}>
                <View
                  style={[
                    styles.modalWarningIcon,
                    {
                      backgroundColor: isDark ? "#422525" : "#FEE2E2",
                    },
                  ]}
                >
                  <AlertTriangle size={25} color="#EF4444" />
                </View>

                <TouchableOpacity
                  onPress={closeRestoreConfirmation}
                  accessibilityRole="button"
                  accessibilityLabel="Close restore confirmation"
                  style={styles.clearButton}
                >
                  <X size={20} color={secondaryColor} />
                </TouchableOpacity>
              </View>

              {/* TITLE */}

              <Text
                accessibilityRole="header"
                style={[styles.modalTitle, { color: colors.text }]}
              >
                Restore financial records?
              </Text>

              <Text
                style={[styles.modalDescription, { color: secondaryColor }]}
              >
                This action will replace your current expenses, income, custom
                categories and payment methods with the selected backup.
              </Text>

              {/* SELECTED BACKUP */}

              {selectedBackup && (
                <View
                  style={[
                    styles.modalSummary,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalSectionLabel,
                      { color: secondaryColor },
                    ]}
                  >
                    SELECTED BACKUP
                  </Text>

                  <Text style={[styles.modalFilename, { color: colors.text }]}>
                    {selectedBackup.filename}
                  </Text>

                  <Text style={[styles.backupDate, { color: secondaryColor }]}>
                    Created:{" "}
                    {formatBackupDate(selectedBackup.summary.createdAt)}
                  </Text>

                  <View style={styles.modalCounts}>
                    {summaryItems.map((item) => (
                      <View key={item.label} style={styles.modalCountRow}>
                        <Text
                          style={[
                            styles.modalCountLabel,
                            { color: secondaryColor },
                          ]}
                        >
                          {item.label}
                        </Text>

                        <Text
                          style={[
                            styles.modalCountValue,
                            { color: colors.text },
                          ]}
                        >
                          {item.count}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* SAFETY NOTICE */}

              <View
                style={[
                  styles.modalNotice,
                  {
                    backgroundColor: isDark ? "#392D1D" : "#FFFBEB",
                    borderColor: isDark ? "#795522" : "#FDE68A",
                  },
                ]}
              >
                <AlertCircle size={19} color="#D97706" />

                <Text
                  style={[
                    styles.modalNoticeText,
                    {
                      color: isDark ? "#FDE68A" : "#92400E",
                    },
                  ]}
                >
                  Review the backup carefully. Existing financial records will
                  be replaced once restoration is enabled.
                </Text>
              </View>

              {/* ACTION BUTTONS */}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[
                    styles.modalCancelButton,
                    { borderColor: colors.border },
                  ]}
                  onPress={closeRestoreConfirmation}
                  disabled={restoring}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel restore"
                >
                  <Text
                    style={[styles.modalCancelText, { color: colors.text }]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                {/* GUARDED RESTORE ACTION */}

                <TouchableOpacity
                  style={[
                    styles.modalConfirmButton,
                    {
                      backgroundColor:
                        RESTORE_EXECUTION_ENABLED && !busy
                          ? colors.primary
                          : isDark
                            ? "#444444"
                            : "#E5E7EB",

                      opacity: RESTORE_EXECUTION_ENABLED && !busy ? 1 : 0.6,
                    },
                  ]}
                  disabled={!RESTORE_EXECUTION_ENABLED || busy}
                  onPress={() => {
                    void handleConfirmRestore();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm restore"
                  accessibilityState={{
                    disabled: !RESTORE_EXECUTION_ENABLED || busy,
                    busy: restoring,
                  }}
                >
                  {restoring ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text
                      style={[
                        styles.modalConfirmText,
                        {
                          color:
                            RESTORE_EXECUTION_ENABLED && !busy
                              ? "#FFFFFF"
                              : isDark
                                ? "#B9B9B9"
                                : "#6B7280",
                        },
                      ]}
                    >
                      Confirm Restore
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalFootnote, { color: secondaryColor }]}>
                {RESTORE_EXECUTION_ENABLED
                  ? "Only confirm after saving a separate backup of your existing records."
                  : "Restore confirmation is available for preview only. No financial records will be changed."}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// =========================================
// STYLES
// =========================================

const styles = StyleSheet.create({
  // MAIN SCREEN

  screen: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  content: {
    width: "100%",
    paddingBottom: 48,
    gap: 24,
  },

  desktopContent: {
    maxWidth: 1200,
    alignSelf: "center",
  },

  // PAGE HEADER

  header: {
    gap: 8,
    marginBottom: 4,
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
  },

  desktopTitle: {
    fontSize: 30,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 22,
  },

  // RESPONSIVE GRID

  mainGrid: {
    width: "100%",
    gap: 18,
  },

  desktopGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },

  // CARDS

  card: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    gap: 18,
  },

  desktopCard: {
    flex: 1,
    width: "auto",
    minWidth: 0,
  },

  cardHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },

  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  headingText: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
  },

  description: {
    fontSize: 13,
    lineHeight: 21,
  },

  // ACTION BUTTONS

  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },

  disabledButton: {
    opacity: 0.55,
  },

  selectButton: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },

  selectButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },

  secondaryButton: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    opacity: 0.5,
  },

  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },

  reviewButton: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },

  reviewButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },

  helperText: {
    fontSize: 12,
    lineHeight: 19,
  },

  // BACKUP PREVIEW

  previewCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 16,
  },

  previewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  previewHeadingText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },

  previewTitle: {
    fontSize: 15,
    fontWeight: "700",
  },

  fileName: {
    fontSize: 12,
    lineHeight: 18,
  },

  clearButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  backupDate: {
    fontSize: 12,
    lineHeight: 19,
  },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  summaryItem: {
    width: "48%",
    flexGrow: 1,
    minWidth: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 5,
  },

  summaryCount: {
    fontSize: 22,
    fontWeight: "700",
  },

  summaryLabel: {
    fontSize: 12,
    lineHeight: 18,
  },

  warningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 20,
  },

  // PRIVACY INFORMATION

  infoCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 16,
  },

  infoHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },

  // SUCCESS / ERROR MESSAGES

  message: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  messageText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },

  // CONFIRMATION MODAL

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.58)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },

  modalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "90%",
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
  },

  modalContent: {
    padding: 22,
    gap: 16,
  },

  modalHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  modalWarningIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  modalTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "700",
  },

  modalDescription: {
    fontSize: 14,
    lineHeight: 23,
  },

  modalSummary: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    gap: 10,
  },

  modalSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
  },

  modalFilename: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },

  modalCounts: {
    gap: 9,
    paddingTop: 8,
  },

  modalCountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  modalCountLabel: {
    fontSize: 13,
  },

  modalCountValue: {
    fontSize: 14,
    fontWeight: "700",
  },

  modalNotice: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  modalNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 20,
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
  },

  modalCancelButton: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  modalCancelText: {
    fontSize: 14,
    fontWeight: "600",
  },

  modalConfirmButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  modalConfirmText: {
    fontSize: 14,
    fontWeight: "600",
  },

  modalFootnote: {
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
  },
});
