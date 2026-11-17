import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
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

type MainTab = "home" | "history" | "reports" | "settings";
type AppTab = MainTab | "add" | "income";
type StartupStatus = "checking" | "ready" | "error";

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
 * Financial application screens do not mount
 * until interrupted restore recovery and
 * independent integrity checks succeed.
 */
function StartupRecoveryGate() {
  const { colors, isDark } = useAppTheme();

  const [status, setStatus] = useState<StartupStatus>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runningRef = useRef(false);
  const mountedRef = useRef(true);

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
      await recoverInterruptedRestore();
      await assertNoPendingRestoreRecovery();

      if (!mountedRef.current) {
        return;
      }

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

      setStatus("error");
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    void checkRecovery();

    return () => {
      mountedRef.current = false;
    };
  }, [checkRecovery]);

  if (status === "ready") {
    return (
      <AppContent
        onRestoreSafetyFailure={() => {
          void checkRecovery();
        }}
      />
    );
  }

  const isChecking = status === "checking";

  return (
    <View
      style={[styles.startupContainer, { backgroundColor: colors.background }]}
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
          {isChecking ? (
            <>
              <View
                style={[
                  styles.startupIcon,
                  { backgroundColor: colors.primary + "18" },
                ]}
              >
                <ShieldCheck size={30} color={colors.primary} />
              </View>

              <ActivityIndicator size="large" color={colors.primary} />

              <Text style={[styles.startupTitle, { color: colors.text }]}>
                Checking your data
              </Text>

              <Text
                style={[
                  styles.startupDescription,
                  { color: colors.textSecondary },
                ]}
              >
                Shavro is checking your saved financial records and recovering
                interrupted backup operations if necessary.
              </Text>

              <Text
                style={[styles.startupHint, { color: colors.textSecondary }]}
              >
                Keep the app open until this check finishes.
              </Text>
            </>
          ) : (
            <>
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

              <Text style={[styles.startupTitle, { color: colors.text }]}>
                Data recovery required
              </Text>

              <Text
                style={[
                  styles.startupDescription,
                  { color: colors.textSecondary },
                ]}
              >
                Shavro could not safely verify or complete a previous backup
                restoration. Your financial screens are temporarily unavailable
                to prevent further changes.
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
                style={[styles.startupHint, { color: colors.textSecondary }]}
              >
                Do not clear Shavro's app data or uninstall the app. Recovery
                information may be needed to restore your previous financial
                records.
              </Text>
            </>
          )}
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

  // NEW: Callback after verified restore success.
  const handleRestoreCompleted = (): void => {
    Keyboard.dismiss();

    clearSelections();
    setShowBackupRestore(false);
    setActiveTab("home");

    refreshScreens();
  };

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

    // Existing behavior: return to Transactions.
    setActiveTab("history");
    refreshScreens();
  };

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

    if (activeTab === "reports") {
      return <ReportsScreen key={`reports-${refreshKey}`} />;
    }

    if (activeTab === "settings") {
      return <SettingsScreen onOpenBackup={openBackupRestore} />;
    }

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

    if (activeTab === "income") {
      return (
        <View style={styles.formContainer}>
          <SafeAreaView
            edges={["top"]}
            style={[
              styles.formHeaderSafeArea,
              { backgroundColor: colors.background },
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

      <View style={[styles.container, { backgroundColor: colors.background }]}>
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
                    { color: colors.textSecondary },
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
                  { borderTopColor: colors.border },
                ]}
              >
                <ShieldCheck size={17} color={colors.primary} />

                <Text
                  style={[
                    styles.sidebarFooterText,
                    { color: colors.textSecondary },
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

  // =========================================
  // DESKTOP SIDEBAR
  // =========================================

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
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 14,
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

  // =========================================
  // SHARED FORM / BACKUP LAYOUT
  // =========================================

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

  // =========================================
  // MOBILE BOTTOM NAVIGATION
  // =========================================

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

  // =========================================
  // STARTUP RECOVERY SCREEN
  // =========================================

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
    paddingHorizontal: 16,
  },

  retryButtonText: {
    fontFamily: typography.fontFamily,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
