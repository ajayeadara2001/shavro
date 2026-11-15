
import React, { useState } from 'react';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  History,
  PlusCircle,
} from 'lucide-react-native';

import AddExpenseScreen from './src/screens/AddExpenseScreen';
import TransactionHistoryScreen from './src/screens/TransactionHistoryScreen';
import TransactionDetailsScreen from './src/screens/TransactionDetailsScreen';

import type { Expense } from './src/types/expense';

import {
  colors,
  typography,
} from './src/constants/theme';

type AppTab = 'add' | 'history';

export default function App() {
  const [activeTab, setActiveTab] =
    useState<AppTab>('add');

  const [selectedExpense, setSelectedExpense] =
    useState<Expense | null>(null);

  const [expenseToEdit, setExpenseToEdit] =
    useState<Expense | null>(null);

  // Open transaction details.
  const openTransaction = (expense: Expense): void => {
    setExpenseToEdit(null);
    setActiveTab('history');
    setSelectedExpense(expense);
  };

  // Return from details to transaction history.
  const closeTransaction = (): void => {
    setSelectedExpense(null);
    setExpenseToEdit(null);
    setActiveTab('history');
  };

  // Open the existing transaction in edit mode.
  const openEditExpense = (expense: Expense): void => {
    setExpenseToEdit(expense);
    setSelectedExpense(null);
    setActiveTab('add');
  };

  // Return to history after a successful update.
  const finishEditing = (): void => {
    setExpenseToEdit(null);
    setSelectedExpense(null);
    setActiveTab('history');
  };

  // Switch tabs and clear the current selection.
  const switchTab = (tab: AppTab): void => {
    setSelectedExpense(null);
    setExpenseToEdit(null);
    setActiveTab(tab);
  };

  const isEditing = expenseToEdit !== null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />

      <View style={styles.container}>
        <View style={styles.screen}>
          {selectedExpense ? (
            <TransactionDetailsScreen
              expense={selectedExpense}
              onBack={closeTransaction}
              onDeleted={closeTransaction}
              onEdit={openEditExpense}
            />
          ) : activeTab === 'add' ? (
            <AddExpenseScreen
              key={expenseToEdit?.id ?? 'new-expense'}
              expenseToEdit={expenseToEdit}
              onEditComplete={finishEditing}
            />
          ) : (
            <TransactionHistoryScreen
              onAddExpense={() => switchTab('add')}
              onSelectExpense={openTransaction}
            />
          )}
        </View>

        {/* Bottom Navigation */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => switchTab('add')}
            accessibilityRole="button"
            accessibilityLabel="Add Expense"
            accessibilityState={{
              selected: activeTab === 'add',
            }}
            style={styles.tab}
          >
            <PlusCircle
              size={22}
              color={
                activeTab === 'add'
                  ? colors.primary
                  : colors.textSecondary
              }
            />

            <Text
              style={[
                styles.tabLabel,
                activeTab === 'add' &&
                  styles.activeTabLabel,
              ]}
            >
              {isEditing
                ? 'Edit Expense'
                : 'Add Expense'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => switchTab('history')}
            accessibilityRole="button"
            accessibilityLabel="Transactions"
            accessibilityState={{
              selected: activeTab === 'history',
            }}
            style={styles.tab}
          >
            <History
              size={22}
              color={
                activeTab === 'history'
                  ? colors.primary
                  : colors.textSecondary
              }
            />

            <Text
              style={[
                styles.tabLabel,
                activeTab === 'history' &&
                  styles.activeTabLabel,
              ]}
            >
              Transactions
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  screen: {
    flex: 1,
  },

  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingVertical: 10,
  },

  tab: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },

  tabLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
  },

  activeTabLabel: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
});