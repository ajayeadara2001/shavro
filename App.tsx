import React, { useState } from 'react';

import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { StatusBar } from 'expo-status-bar';

import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  ArrowLeft,
  History,
  House,
} from 'lucide-react-native';

import {
  ThemeProvider,
  useAppTheme,
} from './src/context/ThemeContext';

import HomeDashboardScreen from './src/screens/HomeDashboardScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import AddIncomeScreen from './src/screens/AddIncomeScreen';
import TransactionHistoryScreen from './src/screens/TransactionHistoryScreen';
import TransactionDetailsScreen from './src/screens/TransactionDetailsScreen';
import IncomeDetailsScreen from './src/screens/IncomeDetailsScreen';

import type { Expense } from './src/types/expense';
import type { Income } from './src/types/income';

import { typography } from './src/constants/theme';

type AppTab = 'home' | 'history' | 'add' | 'income';

function AppContent() {
  const { colors, isDark } = useAppTheme();

  // Home is the default screen.
  const [activeTab, setActiveTab] =
    useState<AppTab>('home');

  // Transactions selected for viewing.
  const [selectedExpense, setSelectedExpense] =
    useState<Expense | null>(null);

  const [selectedIncome, setSelectedIncome] =
    useState<Income | null>(null);

  // Transactions selected for editing.
  const [expenseToEdit, setExpenseToEdit] =
    useState<Expense | null>(null);

  const [incomeToEdit, setIncomeToEdit] =
    useState<Income | null>(null);

  // Refresh dashboard/history after data changes.
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshScreens = (): void => {
    setRefreshKey(previous => previous + 1);
  };

  // Clear transaction selections.
  const clearSelections = (): void => {
    setSelectedExpense(null);
    setSelectedIncome(null);

    setExpenseToEdit(null);
    setIncomeToEdit(null);
  };

  // Navigate between screens and refresh data.
  const switchTab = (tab: AppTab): void => {
    Keyboard.dismiss();

    clearSelections();
    setActiveTab(tab);
    refreshScreens();
  };

  // Open expense transaction details.
  const openExpenseTransaction = (
    expense: Expense
  ): void => {
    Keyboard.dismiss();

    setExpenseToEdit(null);
    setIncomeToEdit(null);

    setSelectedIncome(null);
    setSelectedExpense(expense);
  };

  // Open income transaction details.
  const openIncomeTransaction = (
    income: Income
  ): void => {
    Keyboard.dismiss();

    setExpenseToEdit(null);
    setIncomeToEdit(null);

    setSelectedExpense(null);
    setSelectedIncome(income);
  };

  // Return from details to Transaction History.
  const closeTransaction = (): void => {
    Keyboard.dismiss();

    clearSelections();
    setActiveTab('history');
    refreshScreens();
  };

  // Open Edit Expense.
  const openEditExpense = (
    expense: Expense
  ): void => {
    Keyboard.dismiss();

    setExpenseToEdit(expense);
    setIncomeToEdit(null);

    setSelectedExpense(null);
    setSelectedIncome(null);

    setActiveTab('add');
  };

  // Open Edit Income.
  const openEditIncome = (
    income: Income
  ): void => {
    Keyboard.dismiss();

    setIncomeToEdit(income);
    setExpenseToEdit(null);

    setSelectedIncome(null);
    setSelectedExpense(null);

    setActiveTab('income');
  };

  // After successful saves and updates:
  // navigate Home and reload financial data.
  const finishTransaction = (): void => {
    switchTab('home');
  };

  const finishEditingExpense = finishTransaction;
  const finishEditingIncome = finishTransaction;
  const finishAddingExpense = finishTransaction;
  const finishAddingIncome = finishTransaction;

  const isEditingExpense = expenseToEdit !== null;
  const isEditingIncome = incomeToEdit !== null;

  const isViewingDetails =
    selectedExpense !== null ||
    selectedIncome !== null;

  const isFormScreen =
    activeTab === 'add' ||
    activeTab === 'income';

  return (
    <>
      <StatusBar
        style={isDark ? 'light' : 'dark'}
      />

      {/* Full-width root for desktop and mobile */}
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={styles.appShell}>

          {/* Main screen content */}
          <View style={styles.screen}>

            {selectedExpense ? (
              <TransactionDetailsScreen
                expense={selectedExpense}
                onBack={closeTransaction}
                onDeleted={closeTransaction}
                onEdit={openEditExpense}
              />

            ) : selectedIncome ? (
              <IncomeDetailsScreen
                income={selectedIncome}
                onBack={closeTransaction}
                onDeleted={closeTransaction}
                onEdit={openEditIncome}
              />

            ) : activeTab === 'home' ? (
              <HomeDashboardScreen
                key={`home-${refreshKey}`}
                onAddIncome={() =>
                  switchTab('income')
                }
                onAddExpense={() =>
                  switchTab('add')
                }
                onViewAll={() =>
                  switchTab('history')
                }
                onSelectExpense={
                  openExpenseTransaction
                }
                onSelectIncome={
                  openIncomeTransaction
                }
              />

            ) : activeTab === 'add' ? (

              /* ADD / EDIT EXPENSE */
              <View style={styles.formContainer}>

                {/* Top safe area for iPhone notch */}
                <SafeAreaView
                  edges={['top']}
                  style={[
                    styles.formHeaderSafeArea,
                    {
                      backgroundColor: colors.background,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() =>
                      switchTab(
                        isEditingExpense
                          ? 'history'
                          : 'home'
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      isEditingExpense
                        ? 'Back to Transactions'
                        : 'Back to Home'
                    }
                    style={styles.backButton}
                  >
                    <ArrowLeft
                      size={20}
                      color={colors.text}
                    />

                    <Text
                      style={[
                        styles.backText,
                        {
                          color: colors.text,
                        },
                      ]}
                    >
                      {isEditingExpense
                        ? 'Transactions'
                        : 'Home'}
                    </Text>
                  </Pressable>
                </SafeAreaView>

                {/* Expense form is scrollable */}
                <View style={styles.formContent}>
                  <AddExpenseScreen
                    key={
                      expenseToEdit?.id ??
                      `new-expense-${refreshKey}`
                    }
                    expenseToEdit={expenseToEdit}
                    onEditComplete={
                      finishEditingExpense
                    }
                    onSaveComplete={
                      finishAddingExpense
                    }
                  />
                </View>

              </View>

            ) : activeTab === 'income' ? (

              /* ADD / EDIT INCOME */
              <View style={styles.formContainer}>

                {/* Top safe area for iPhone notch */}
                <SafeAreaView
                  edges={['top']}
                  style={[
                    styles.formHeaderSafeArea,
                    {
                      backgroundColor: colors.background,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() =>
                      switchTab(
                        isEditingIncome
                          ? 'history'
                          : 'home'
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      isEditingIncome
                        ? 'Back to Transactions'
                        : 'Back to Home'
                    }
                    style={styles.backButton}
                  >
                    <ArrowLeft
                      size={20}
                      color={colors.text}
                    />

                    <Text
                      style={[
                        styles.backText,
                        {
                          color: colors.text,
                        },
                      ]}
                    >
                      {isEditingIncome
                        ? 'Transactions'
                        : 'Home'}
                    </Text>
                  </Pressable>
                </SafeAreaView>

                {/* Income form is scrollable */}
                <View style={styles.formContent}>
                  <AddIncomeScreen
                    key={
                      incomeToEdit?.id ??
                      `new-income-${refreshKey}`
                    }
                    incomeToEdit={incomeToEdit}
                    onEditComplete={
                      finishEditingIncome
                    }
                    onSaveComplete={
                      finishAddingIncome
                    }
                  />
                </View>

              </View>

            ) : (

              /* TRANSACTION HISTORY */
              <TransactionHistoryScreen
                key={`history-${refreshKey}`}
                onAddExpense={() =>
                  switchTab('add')
                }
                onSelectExpense={
                  openExpenseTransaction
                }
                onSelectIncome={
                  openIncomeTransaction
                }
              />
            )}
          </View>

          {/* Bottom navigation */}
          {!isViewingDetails && !isFormScreen && (
            <SafeAreaView
              edges={['bottom']}
              style={[
                styles.tabBarSafeArea,
                {
                  backgroundColor: colors.background,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View style={styles.tabBar}>

                {/* HOME TAB */}
                <Pressable
                  onPress={() =>
                    switchTab('home')
                  }
                  accessibilityRole="tab"
                  accessibilityLabel="Home"
                  accessibilityState={{
                    selected: activeTab === 'home',
                  }}
                  style={styles.tab}
                >
                  <House
                    size={23}
                    color={
                      activeTab === 'home'
                        ? colors.primary
                        : colors.textSecondary
                    }
                  />

                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color:
                          activeTab === 'home'
                            ? colors.primary
                            : colors.textSecondary,

                        fontWeight:
                          activeTab === 'home'
                            ? typography.weights.semibold
                            : typography.weights.regular,
                      },
                    ]}
                  >
                    Home
                  </Text>
                </Pressable>

                {/* TRANSACTIONS TAB */}
                <Pressable
                  onPress={() =>
                    switchTab('history')
                  }
                  accessibilityRole="tab"
                  accessibilityLabel="Transactions"
                  accessibilityState={{
                    selected: activeTab === 'history',
                  }}
                  style={styles.tab}
                >
                  <History
                    size={23}
                    color={
                      activeTab === 'history'
                        ? colors.primary
                        : colors.textSecondary
                    }
                  />

                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color:
                          activeTab === 'history'
                            ? colors.primary
                            : colors.textSecondary,

                        fontWeight:
                          activeTab === 'history'
                            ? typography.weights.semibold
                            : typography.weights.regular,
                      },
                    ]}
                  >
                    Transactions
                  </Text>
                </Pressable>

              </View>
            </SafeAreaView>
          )}

        </View>
      </View>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // Full available width.
  container: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },

  // No desktop maxWidth.
  appShell: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },

  // Main screen occupies space above the tab bar.
  screen: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },

  // Shared container for Add/Edit forms.
  formContainer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },

  // Safe-area header stays above the form.
  formHeaderSafeArea: {
    width: '100%',
    flexShrink: 0,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 20,
  },

  backText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium,
  },

  // Form occupies remaining screen height.
  formContent: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },

  // Bottom navigation respects home indicator.
  tabBarSafeArea: {
    width: '100%',
    borderTopWidth: 1,
    flexShrink: 0,
  },

  tabBar: {
    flexDirection: 'row',
    width: '100%',
    paddingTop: 8,
    paddingBottom: 8,
  },

  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },

  tabLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.caption,
    textAlign: 'center',
  },
});