import { Platform } from "react-native";

import * as nativeExpenseStorage from "./expenseStorage.native";
import * as webExpenseStorage from "./expenseStorage.web";

/**
 * Shavro Expense Storage
 *
 * Platform-aware entry point for expense operations.
 *
 * Web:
 *   Uses browser localStorage.
 *
 * Android / iOS:
 *   Uses React Native AsyncStorage.
 *
 * All financial mutations are protected
 * by runFinancialWrite() inside the
 * platform-specific implementation.
 *
 * Screens should continue importing from:
 *   "../services/expenseStorage"
 */

const expenseStorage =
  Platform.OS === "web" ? webExpenseStorage : nativeExpenseStorage;

// =========================================
// READ EXPENSES
// =========================================

export const getExpenses = expenseStorage.getExpenses;

// =========================================
// SAVE EXPENSE
// =========================================

export const saveExpense = expenseStorage.saveExpense;

// =========================================
// UPDATE EXPENSE
// =========================================

export const updateExpense = expenseStorage.updateExpense;

// =========================================
// DELETE EXPENSE
// =========================================

export const deleteExpense = expenseStorage.deleteExpense;
