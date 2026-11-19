import React, { useCallback, useEffect, useRef, useState } from "react";

import ShavroStartup from "./src/components/ShavroStartup";

import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { StatusBar } from "expo-status-bar";

import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  AlertTriangle,
  ArrowLeft,
  ChartNoAxesCombined,
  History,
  House,
  RefreshCw,
  Settings,
  ShieldCheck,
} from "lucide-react-native";

import { ThemeProvider, useAppTheme } from "./src/context/ThemeContext";

import HomeDashboardScreen from "./src/screens/HomeDashboardScreen";
import AddExpenseScreen from "./src/screens/AddExpenseScreen";
import AddIncomeScreen from "./src/screens/AddIncomeScreen";
import TransactionHistoryScreen from "./src/screens/TransactionHistoryScreen";
import TransactionDetailsScreen from "./src/screens/TransactionDetailsScreen";
import IncomeDetailsScreen from "./src/screens/IncomeDetailsScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import BackupRestoreScreen from "./src/screens/BackupRestoreScreen";

import { recoverInterruptedRestore } from "./src/services/backupRestoreWrite";

import { assertNoPendingRestoreRecovery } from "./src/services/restoreRecoveryState";

import type { Expense } from "./src/types/expense";
import type { Income } from "./src/types/income";

import { typography } from "./src/constants/theme";

// =========================================
// TYPES
// =========================================

type MainTab = "home" | "history" | "reports" | "settings";
type AppTab = MainTab | "add" | "income";
type StartupStatus = "checking" | "ready" | "error";

// =========================================
// CONSTANTS
// =========================================

const DESKTOP_BREAKPOINT = 1000;

const NAVIGATION_ITEMS: {
  tab: MainTab;
  label: string;
}[] = [
  { tab: "home", label: "Home" },
  { tab: "history", label: "Transactions" },
  { tab: "reports", label: "Reports" },
  { tab: "settings", label: "Settings" },
];

// =========================================
// NAVIGATION ICON
// =========================================

function NavigationIcon({
  tab,
  color,
  size = 22,
}: {
  tab: MainTab;
  color: string;
  size?: number;
}) {
  switch (tab) {
    case "home":
      return <House size={size} strokeWidth={1.9} color={color} />;

    case "history":
      return <History size={size} strokeWidth={1.9} color={color} />;

    case "reports":
      return (
        <ChartNoAxesCombined size={size} strokeWidth={1.9} color={color} />
      );

    case "settings":
      return <Settings size={size} strokeWidth={1.9} color={color} />;
  }
}

// =========================================
// STARTUP RECOVERY GATE
// =========================================

/**
 * Financial screens remain unavailable
 * until restore recovery and integrity
 * checks have completed successfully.
 *
 * SQLite remains separate from the
 * active AsyncStorage financial system.
 *
 * Temporary SQLite diagnostic calls
 * have been removed from App.tsx.
 */

function StartupRecoveryGate() {
  const { colors, isDark } = useAppTheme();

  const [status, setStatus] = useState<StartupStatus>("checking");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  // =======================================
  // PROVIDER-AWARE STARTUP RECOVERY
  // =======================================

  const checkRecovery = useCallback(async () => {
    if (runningRef.current) {
      return;
    }

    runningRef.current = true;

    if (mountedRef.current) {
      setStatus("checking");
      setErrorMessage(null);
    }

    try {
      if (Platform.OS === "web") {
        // Preserve the existing browser
        // financial recovery procedure.
        await recoverInterruptedRestore();

        await assertNoPendingRestoreRecovery();
      } else {
        // Native recovery includes provider
        // verification and SQLite safety checks.
        const { verifyNativeStartupRecovery } =
          await import("./src/services/nativeStartupRecovery.native");

        await verifyNativeStartupRecovery();
      }

      if (!mountedRef.current) {
        return;
      }

      // Financial records verified.
      // The main application can now open.
      setStatus("ready");
    } catch (error) {
      console.error("Shavro startup recovery failed:", error);

      if (!mountedRef.current) {
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to verify saved financial records.",
      );

      // Fail closed: do not display
      // financial screens on recovery failure.
      setStatus("error");
    } finally {
      runningRef.current = false;
    }
  }, []);

  // =======================================
  // STARTUP RECOVERY EFFECT
  // =======================================

  useEffect(() => {
    mountedRef.current = true;

    void checkRecovery();

    return () => {
      mountedRef.current = false;
    };
  }, [checkRecovery]);

  // =======================================
  // ANIMATED SHAVRO STARTUP SCREEN
  // =======================================

  if (status === "checking") {
    return (
      <>
        <StatusBar style="dark" />
        <ShavroStartup />
      </>
    );
  }

  // =======================================
  // FINANCIAL APPLICATION READY
  // =======================================

  if (status === "ready") {
    return (
      <AppContent
        onRestoreSafetyFailure={() => {
          void checkRecovery();
        }}
      />
    );
  }

  // =======================================
  // DATA RECOVERY ERROR SCREEN
  // =======================================
  // Only "error" remains at this point.
  // The existing retry functionality
  // must remain available.

  return (
    <View
      style={[
        styles.startupContainer,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      <SafeAreaView edges={["top", "bottom"]} style={styles.startupSafeArea}>
        <View
          style={[
            styles.startupCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.startupIcon,
              {
                backgroundColor: isDark ? "#422525" : "#FEE2E2",
              },
            ]}
          >
            <AlertTriangle size={30} color="#EF4444" />
          </View>

          <Text
            style={[
              styles.startupTitle,
              {
                color: colors.text,
              },
            ]}
          >
            Data recovery required
          </Text>

          <Text
            style={[
              styles.startupDescription,
              {
                color: colors.textSecondary,
              },
            ]}
          >
            Shavro could not safely verify or complete a previous backup
            restoration. Your financial screens are temporarily unavailable to
            prevent further changes.
          </Text>

          {errorMessage && (
            <View
              style={[
                styles.startupErrorBox,
                {
                  borderColor: isDark ? "#7F3535" : "#FECACA",
                  backgroundColor: isDark ? "#351D1D" : "#FEF2F2",
                },
              ]}
            >
              <Text
                selectable
                style={[
                  styles.startupErrorText,
                  {
                    color: isDark ? "#FCA5A5" : "#B91C1C",
                  },
                ]}
              >
                {errorMessage}
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => {
              void checkRecovery();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry data recovery"
            style={({ pressed }) => [
              styles.retryButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <RefreshCw size={18} color="#FFFFFF" />

            <Text style={styles.retryButtonText}>Retry Recovery</Text>
          </Pressable>

          <Text
            style={[
              styles.startupHint,
              {
                color: colors.textSecondary,
              },
            ]}
          >
            Do not clear Shavro's app data or uninstall the app. Recovery
            information may be needed to restore your previous financial
            records.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

// =========================================
// MAIN SHAVRO APPLICATION
// =========================================

interface AppContentProps {
  onRestoreSafetyFailure: () => void;
}

function AppContent({ onRestoreSafetyFailure }: AppContentProps) {
  const { colors, isDark } = useAppTheme();

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;

  const topInset = Platform.OS === "web" ? 0 : insets.top;

  // =======================================
  // NAVIGATION STATE
  // =======================================

  const [activeTab, setActiveTab] = useState<AppTab>("home");

  const [showBackupRestore, setShowBackupRestore] = useState(false);

  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const [selectedIncome, setSelectedIncome] = useState<Income | null>(null);

  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  const [incomeToEdit, setIncomeToEdit] = useState<Income | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  // =======================================
  // REFRESH FINANCIAL SCREENS
  // =======================================

  const refreshScreens = (): void => {
    setRefreshKey((previous) => previous + 1);
  };

  const clearSelections = (): void => {
    setSelectedExpense(null);
    setSelectedIncome(null);
    setExpenseToEdit(null);
    setIncomeToEdit(null);
  };

  // =======================================
  // NAVIGATION ACTIONS
  // =======================================

  const switchTab = (tab: AppTab): void => {
    Keyboard.dismiss();

    clearSelections();
    setShowBackupRestore(false);

    setActiveTab(tab);
    refreshScreens();
  };

  const openBackupRestore = (): void => {
    Keyboard.dismiss();

    clearSelections();

    setActiveTab("settings");
    setShowBackupRestore(true);
  };

  const closeBackupRestore = (): void => {
    Keyboard.dismiss();

    setShowBackupRestore(false);
    setActiveTab("settings");
  };

  // =======================================
  // RESTORE SUCCESS CALLBACK
  // =======================================

  const handleRestoreCompleted = (): void => {
    Keyboard.dismiss();

    clearSelections();

    setShowBackupRestore(false);
    setActiveTab("home");

    refreshScreens();
  };

  // =======================================
  // TRANSACTION DETAILS NAVIGATION
  // =======================================

  const openExpenseTransaction = (expense: Expense): void => {
    Keyboard.dismiss();

    setShowBackupRestore(false);

    setExpenseToEdit(null);
    setIncomeToEdit(null);

    setSelectedIncome(null);
    setSelectedExpense(expense);
  };

  const openIncomeTransaction = (income: Income): void => {
    Keyboard.dismiss();

    setShowBackupRestore(false);

    setExpenseToEdit(null);
    setIncomeToEdit(null);

    setSelectedExpense(null);
    setSelectedIncome(income);
  };

  const closeTransaction = (): void => {
    Keyboard.dismiss();

    clearSelections();
    setShowBackupRestore(false);

    // Preserve existing behavior:
    // return to Transactions after
    // closing or deleting details.
    setActiveTab("history");

    refreshScreens();
  };

  // =======================================
  // EDIT TRANSACTION NAVIGATION
  // =======================================

  const openEditExpense = (expense: Expense): void => {
    Keyboard.dismiss();

    setShowBackupRestore(false);

    setExpenseToEdit(expense);
    setIncomeToEdit(null);

    setSelectedExpense(null);
    setSelectedIncome(null);

    setActiveTab("add");
  };

  const openEditIncome = (income: Income): void => {
    Keyboard.dismiss();

    setShowBackupRestore(false);

    setIncomeToEdit(income);
    setExpenseToEdit(null);

    setSelectedIncome(null);
    setSelectedExpense(null);

    setActiveTab("income");
  };

  // =======================================
  // SAVE / EDIT COMPLETION
  // =======================================

  const finishTransaction = (): void => {
    switchTab("home");
  };

  const finishEditingExpense = finishTransaction;

  const finishEditingIncome = finishTransaction;

  const finishAddingExpense = finishTransaction;

  const finishAddingIncome = finishTransaction;

  // =======================================
  // SCREEN STATE
  // =======================================

  const isEditingExpense = expenseToEdit !== null;

  const isEditingIncome = incomeToEdit !== null;

  const isViewingDetails = selectedExpense !== null || selectedIncome !== null;

  const isFormScreen = activeTab === "add" || activeTab === "income";

  const showMainNavigation =
    !isViewingDetails && !isFormScreen && !showBackupRestore;

  const showDesktopSidebar =
    isDesktop && (showMainNavigation || showBackupRestore);

  const showBottomNavigation = !isDesktop && showMainNavigation;

  // =======================================
  // SHARED NAVIGATION BUTTON
  // =======================================

  const renderNavigationButton = (
    tab: MainTab,
    label: string,
    desktop: boolean,
  ) => {
    const selected = activeTab === tab;

    const iconColor = selected ? colors.primary : colors.textSecondary;

    return (
      <Pressable
        key={tab}
        onPress={() => switchTab(tab)}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          desktop ? styles.sidebarItem : styles.tab,

          desktop &&
            selected && {
              backgroundColor: colors.primary + "14",
            },

          {
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <NavigationIcon tab={tab} color={iconColor} size={desktop ? 21 : 23} />

        <Text
          style={[
            desktop ? styles.sidebarLabel : styles.tabLabel,

            {
              color: iconColor,

              fontWeight: selected
                ? typography.weights.semibold
                : typography.weights.regular,
            },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  // =======================================
  // CURRENT SCREEN
  // =======================================

  const renderScreen = () => {
    // =====================================
    // BACKUP & RESTORE
    // =====================================

    if (showBackupRestore) {
      return (
        <View style={styles.formContainer}>
          <SafeAreaView
            edges={[]}
            style={[
              styles.formHeaderSafeArea,
              {
                backgroundColor: colors.background,
                paddingTop: topInset,
              },
            ]}
          >
            <Pressable
              onPress={closeBackupRestore}
              accessibilityRole="button"
              accessibilityLabel="Back to Settings"
              style={styles.backButton}
            >
              <ArrowLeft size={20} color={colors.text} />

              <Text style={[styles.backText, { color: colors.text }]}>
                Settings
              </Text>
            </Pressable>
          </SafeAreaView>

          <View style={styles.formContent}>
            <BackupRestoreScreen
              onRestoreCompleted={handleRestoreCompleted}
              onRestoreSafetyFailure={onRestoreSafetyFailure}
            />
          </View>
        </View>
      );
    }

    // =====================================
    // EXPENSE DETAILS
    // =====================================

    if (selectedExpense) {
      return (
        <TransactionDetailsScreen
          expense={selectedExpense}
          onBack={closeTransaction}
          onDeleted={closeTransaction}
          onEdit={openEditExpense}
        />
      );
    }

    // =====================================
    // INCOME DETAILS
    // =====================================

    if (selectedIncome) {
      return (
        <IncomeDetailsScreen
          income={selectedIncome}
          onBack={closeTransaction}
          onDeleted={closeTransaction}
          onEdit={openEditIncome}
        />
      );
    }

    // =====================================
    // HOME DASHBOARD
    // =====================================

    if (activeTab === "home") {
      return (
        <HomeDashboardScreen
          key={`home-${refreshKey}`}
          onAddIncome={() => switchTab("income")}
          onAddExpense={() => switchTab("add")}
          onViewAll={() => switchTab("history")}
          onSelectExpense={openExpenseTransaction}
          onSelectIncome={openIncomeTransaction}
        />
      );
    }

    // =====================================
    // REPORTS
    // =====================================

    if (activeTab === "reports") {
      return <ReportsScreen key={`reports-${refreshKey}`} />;
    }

    // =====================================
    // SETTINGS
    // =====================================

    if (activeTab === "settings") {
      return <SettingsScreen onOpenBackup={openBackupRestore} />;
    }

    // =====================================
    // ADD / EDIT EXPENSE
    // =====================================

    if (activeTab === "add") {
      return (
        <View style={styles.formContainer}>
          <SafeAreaView
            edges={["top"]}
            style={[
              styles.formHeaderSafeArea,
              {
                backgroundColor: colors.background,
              },
            ]}
          >
            <Pressable
              onPress={() => switchTab(isEditingExpense ? "history" : "home")}
              accessibilityRole="button"
              accessibilityLabel={
                isEditingExpense ? "Back to Transactions" : "Back to Home"
              }
              style={styles.backButton}
            >
              <ArrowLeft size={20} color={colors.text} />

              <Text style={[styles.backText, { color: colors.text }]}>
                {isEditingExpense ? "Transactions" : "Home"}
              </Text>
            </Pressable>
          </SafeAreaView>

          <View style={styles.formContent}>
            <AddExpenseScreen
              key={expenseToEdit?.id ?? `new-expense-${refreshKey}`}
              expenseToEdit={expenseToEdit}
              onEditComplete={finishEditingExpense}
              onSaveComplete={finishAddingExpense}
            />
          </View>
        </View>
      );
    }

    // =====================================
    // ADD / EDIT INCOME
    // =====================================

    if (activeTab === "income") {
      return (
        <View style={styles.formContainer}>
          <SafeAreaView
            edges={["top"]}
            style={[
              styles.formHeaderSafeArea,
              {
                backgroundColor: colors.background,
              },
            ]}
          >
            <Pressable
              onPress={() => switchTab(isEditingIncome ? "history" : "home")}
              accessibilityRole="button"
              accessibilityLabel={
                isEditingIncome ? "Back to Transactions" : "Back to Home"
              }
              style={styles.backButton}
            >
              <ArrowLeft size={20} color={colors.text} />

              <Text style={[styles.backText, { color: colors.text }]}>
                {isEditingIncome ? "Transactions" : "Home"}
              </Text>
            </Pressable>
          </SafeAreaView>

          <View style={styles.formContent}>
            <AddIncomeScreen
              key={incomeToEdit?.id ?? `new-income-${refreshKey}`}
              incomeToEdit={incomeToEdit}
              onEditComplete={finishEditingIncome}
              onSaveComplete={finishAddingIncome}
            />
          </View>
        </View>
      );
    }

    // =====================================
    // TRANSACTION HISTORY
    // =====================================

    return (
      <TransactionHistoryScreen
        key={`history-${refreshKey}`}
        onAddExpense={() => switchTab("add")}
        onSelectExpense={openExpenseTransaction}
        onSelectIncome={openIncomeTransaction}
      />
    );
  };

  // =========================================
  // MAIN APPLICATION UI
  // =========================================

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />

      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
          },
        ]}
      >
        <View
          style={[
            styles.appShell,
            showDesktopSidebar && styles.desktopAppShell,
          ]}
        >
          {/* DESKTOP SIDEBAR */}

          {showDesktopSidebar && (
            <View
              style={[
                styles.sidebar,
                {
                  backgroundColor: colors.surface,
                  borderRightColor: colors.border,
                },
              ]}
            >
              <View style={styles.brandArea}>
                <Text style={[styles.brandTitle, { color: colors.text }]}>
                  Shavro
                </Text>

                <Text
                  style={[
                    styles.brandSubtitle,
                    {
                      color: colors.textSecondary,
                    },
                  ]}
                >
                  Your Money, Made Simple
                </Text>
              </View>

              <View style={styles.sidebarNavigation}>
                {NAVIGATION_ITEMS.map((item) =>
                  renderNavigationButton(item.tab, item.label, true),
                )}
              </View>

              <View
                style={[
                  styles.sidebarFooter,
                  {
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <ShieldCheck size={17} color={colors.primary} />

                <Text
                  style={[
                    styles.sidebarFooterText,
                    {
                      color: colors.textSecondary,
                    },
                  ]}
                >
                  Your finances stay on your device
                </Text>
              </View>
            </View>
          )}

          {/* SCREEN AND MOBILE NAVIGATION */}

          <View style={styles.mainArea}>
            <View style={styles.screen}>{renderScreen()}</View>

            {showBottomNavigation && (
              <SafeAreaView
                edges={["bottom"]}
                style={[
                  styles.tabBarSafeArea,
                  {
                    backgroundColor: colors.background,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View style={styles.tabBar}>
                  {NAVIGATION_ITEMS.map((item) =>
                    renderNavigationButton(item.tab, item.label, false),
                  )}
                </View>
              </SafeAreaView>
            )}
          </View>
        </View>
      </View>
    </>
  );
}

// =========================================
// ROOT APPLICATION
// =========================================

export default function App() {
  useEffect(() => {
    if (!__DEV__ || Platform.OS === "web") {
      return;
    }

    let mounted = true;

    async function verifySQLite() {
      try {
        const { runShavroSQLiteIntegrationCheck } =
          await import("./src/database/sqliteNativeIntegrationCheck.native");

        const result = await runShavroSQLiteIntegrationCheck();

        if (mounted) {
          console.log("[Shavro Android SQLite Verification]", result);
        }
      } catch (error) {
        if (mounted) {
          console.error("[Shavro Android SQLite Verification Failed]", error);
        }
      }
    }

    void verifySQLite();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StartupRecoveryGate />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// =========================================
// STYLES
// =========================================

const styles = StyleSheet.create({
  // =======================================
  // MAIN APP CONTAINERS
  // =======================================

  container: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  appShell: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  desktopAppShell: {
    flexDirection: "row",
  },

  mainArea: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },

  screen: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  // =======================================
  // DESKTOP SIDEBAR
  // =======================================

  sidebar: {
    width: 248,
    height: "100%",
    borderRightWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 32,
    paddingBottom: 20,
  },

  brandArea: {
    paddingHorizontal: 16,
    marginBottom: 36,
    gap: 7,
  },

  brandTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 26,
    fontWeight: "700",
  },

  brandSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    lineHeight: 18,
  },

  sidebarNavigation: {
    flex: 1,
    gap: 8,
  },

  sidebarItem: {
    width: "100%",
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  sidebarLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
  },

  sidebarFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  sidebarFooterText: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 11,
    lineHeight: 18,
  },

  // =======================================
  // SHARED FORM / BACKUP LAYOUT
  // =======================================

  formContainer: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  formHeaderSafeArea: {
    width: "100%",
    flexShrink: 0,
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 20,
  },

  backText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium,
  },

  formContent: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  // =======================================
  // MOBILE BOTTOM NAVIGATION
  // =======================================

  tabBarSafeArea: {
    width: "100%",
    borderTopWidth: 1,
    flexShrink: 0,
  },

  tabBar: {
    flexDirection: "row",
    width: "100%",
    paddingTop: 8,
    paddingBottom: 8,
  },

  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  tabLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.caption,
    textAlign: "center",
  },

  // =======================================
  // STARTUP RECOVERY SCREEN
  // =======================================

  startupContainer: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  startupSafeArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  startupCard: {
    width: "100%",
    maxWidth: 460,
    borderWidth: 1,
    borderRadius: 20,
    padding: 26,
    alignItems: "center",
    gap: 18,
  },

  startupIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  startupTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },

  startupDescription: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    lineHeight: 23,
    textAlign: "center",
  },

  startupHint: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
  },

  startupErrorBox: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },

  startupErrorText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
  },

  retryButton: {
    width: "100%",
    minHeight: 50,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },

  retryButtonText: {
    fontFamily: typography.fontFamily,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
