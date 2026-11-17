import { Platform } from "react-native";

import * as nativeIncomeStorage from "./incomeStorage.native";
import * as webIncomeStorage from "./incomeStorage.web";

/**
 * Shavro Income Storage
 *
 * Platform-aware entry point for income operations.
 *
 * Web:
 *   Uses browser localStorage.
 *
 * Android / iOS:
 *   Uses React Native AsyncStorage.
 *
 * All income mutations must execute through
 * runFinancialWrite() in the corresponding
 * platform-specific implementation.
 *
 * Screens should continue importing from:
 *   "../services/incomeStorage"
 */

const incomeStorage =
  Platform.OS === "web" ? webIncomeStorage : nativeIncomeStorage;

// =========================================
// READ INCOMES
// =========================================

export const getIncomes = incomeStorage.getIncomes;

// =========================================
// SAVE INCOME
// =========================================

export const saveIncome = incomeStorage.saveIncome;

// =========================================
// UPDATE INCOME
// =========================================

export const updateIncome = incomeStorage.updateIncome;

// =========================================
// DELETE INCOME
// =========================================

export const deleteIncome = incomeStorage.deleteIncome;
