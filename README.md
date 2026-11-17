# Shavro — Your Money, Made Simple

A modern, cross-platform personal finance application built with **React Native, Expo, and TypeScript**.

Shavro makes it easier to manage income, track expenses, review financial transactions, and understand spending patterns through a clean, accessible, and responsive interface.

**Project Status:** Active Development  
**Platforms:** Android, iOS, Web  
**Storage:** Local-first (AsyncStorage and browser localStorage)  
**Current Focus:** Cross-platform validation and release readiness

---

## Overview

Shavro is designed around four principles:

- **Simplicity:** An intuitive experience for first-time users and people of all ages.
- **Accessibility:** Readable typography, clear labels, comfortable touch targets, and straightforward navigation.
- **Reliability:** Financial data validation, safe storage operations, automated testing, and protected backup restoration.
- **Consistency:** Responsive layouts and a familiar experience across mobile and web platforms.

Shavro is currently a local-first application. Financial records are stored on the user's device or within the browser.

No account registration is required for the implemented local functionality.

## Technology Stack

| Technology                     | Purpose                                     |
| ------------------------------ | ------------------------------------------- |
| React Native                   | Cross-platform UI development               |
| Expo                           | Development, bundling, and platform tooling |
| TypeScript                     | Type-safe application development           |
| React Hooks                    | Component state and lifecycle management    |
| AsyncStorage                   | Persistent financial storage on mobile      |
| Browser localStorage           | Persistent financial storage on web         |
| Lucide React Native            | Interface icons                             |
| React Native Safe Area Context | Mobile safe-area handling                   |
| Expo Document Picker           | Selecting backup files                      |
| Expo File System               | Reading backup files on mobile              |
| Jest                           | Automated unit and integration testing      |
| Expo Metro                     | Web and mobile application bundling         |

## Implemented Features

### 1. Income Management

- Add income transactions.
- Edit and delete existing income records.
- Select income categories and payment methods.
- Record transaction dates and optional notes.
- Validate required fields and transaction amounts.
- Store income records persistently.
- Display income in transaction history and financial reports.

### 2. Expense Management

- Add, edit, and delete expense transactions.
- Select expense categories and payment methods.
- Support custom entry names through the **Other** option.
- Record transaction dates and optional notes.
- Validate positive amounts and required fields.
- Prevent invalid future transaction dates.
- Store expense records persistently.
- Display expenses in transaction history and reports.

### 3. Financial Dashboard

- Total income.
- Total expenses.
- Net financial balance.
- Recent transactions.
- Clear distinction between income and expenses.
- Green income indicators and red expense indicators.
- Responsive mobile and desktop layouts.
- Financial information refreshed after transaction changes.

### 4. Transaction History and Filtering

- Combined income and expense transaction history.
- Individual transaction detail screens.
- Edit and delete operations.
- Transaction categories, amounts, dates, and payment methods.
- Advanced transaction filtering.
- Filtered financial information.
- Navigation between transaction history and individual records.

Transaction filtering is implemented. Further usability and regression checks will continue as part of release preparation.

### 5. Reports and Analytics

Shavro provides visual reports to help users understand their financial activity.

**Monthly Reports**

- Income and expense comparisons.
- Monthly grouped bar charts comparing income and expenses.
- Category-wise expense doughnut charts.
- Spending amounts and category percentages.
- Month and year selection.

**Yearly Reports**

- Annual expense category breakdowns.
- Yearly category-wise doughnut charts.
- Category totals and percentages.
- Financial trends across 12 months.

The Reports interface is designed to make financial information understandable without requiring spreadsheet knowledge.

### 6. Excel Export

Shavro supports exporting financial records for external review.

- Export income and expense transactions.
- Select an explicit **From Date** and **To Date**.
- Include transactions within the selected date range, including both boundary dates.
- Include transaction details.
- Include financial summaries and category breakdowns.
- Support record keeping and offline financial analysis.

### 7. Custom Categories and Payment Methods

- Support reusable custom categories.
- Support reusable custom payment methods.
- Allow user-defined labels for supported **Other** selections.
- Persist custom entries locally.
- Apply storage safety checks to category and payment-method operations.

### 8. Backup & Restore

Shavro includes a JSON-based backup and restore system to help users protect and recover local financial data.

**Backup Export**

- Export expenses, income, custom categories, and payment methods.
- Generate a structured JSON backup.
- Download or share the backup using platform-supported capabilities.
- Preserve transaction information for future restoration.

**Backup Validation**

- Select a JSON backup file.
- Validate backup structure and format.
- Reject invalid or unsupported backup content.
- Preview the backup filename, creation date, and record counts.
- Review a warning before replacing existing records.

**Protected Restoration**

- Replace supported financial collections from a validated backup.
- Protect restoration using a recovery journal.
- Verify written records and restoration completion.
- Preserve recovery information when an operation cannot be safely completed.
- Recover supported interrupted restoration states.
- Block normal financial operations when an unresolved restore state is detected.
- Refresh application screens after successful restoration.

**Validation Status:** Successful restoration, browser persistence, dashboard refresh, reports, and re-export were verified using disposable browser data. Storage failure and recovery scenarios are also covered by automated tests.

Full cross-platform restoration validation remains part of release readiness.

**Security Note:** JSON backups are not encrypted. Users should store backup files securely and avoid sharing them publicly.

### 9. User Interface and Accessibility

- Light, Dark, and System theme preferences.
- Responsive Android, iOS, and web layouts.
- Dedicated desktop navigation sidebar.
- Mobile bottom navigation.
- Full-width desktop dashboard layout.
- Responsive backup and report screens.
- Readable typography and clearly labeled actions.
- Comfortable spacing and touch targets.
- Safe-area support for devices with notches and system navigation areas.
- Keyboard-aware forms and keyboard dismissal controls.
- Confirmation dialogs for sensitive operations.

## Data Storage and Privacy

Shavro follows a **local-first architecture**.

| Platform | Storage              |
| -------- | -------------------- |
| Android  | AsyncStorage         |
| iOS      | AsyncStorage         |
| Web      | Browser localStorage |

Financial information is stored locally rather than synchronized through a cloud backend.

Currently:

- Cloud account synchronization is not implemented.
- User authentication is not implemented.
- Local financial records are not automatically transferred between devices.
- Backup files can contain sensitive financial information and are not encrypted.

Users should maintain their own backups and protect access to their devices and exported files.

## Getting Started

### Prerequisites

- Node.js and npm
- Git
- Expo-compatible development environment
- Android device/emulator, iOS device/simulator, or modern web browser

### Installation

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
cd shavro
```

Install project dependencies:

```bash
npm install
```

Start the Expo development server:

```bash
npx expo start
```

Start the web application:

```bash
npx expo start --web
```

On Windows PowerShell, `npx.cmd` may be used when PowerShell execution policies prevent `npx.ps1` from running.

## Quality Assurance and Testing

Shavro includes automated tests for financial storage operations, backup restoration, and data recovery behavior.

Testing covers areas such as:

- Income and expense storage.
- Native and web storage behavior.
- Restore recovery journals.
- Restoration rollback.
- Interrupted restoration recovery.
- Restore completion and integrity markers.
- Protection against concurrent storage operations.
- Custom category and payment-method storage safety.
- Storage failure scenarios.

### Latest Verified Results

| Check                           | Result      |
| ------------------------------- | ----------- |
| TypeScript validation           | Passed      |
| Automated tests                 | 139 passed  |
| Jest test suites                | 16 passed   |
| Expo web production export      | Successful  |
| Browser backup and restore test | Passed      |
| Cross-platform release testing  | In progress |

These results describe the latest verified development state, not a guarantee that all production scenarios have been covered.

### TypeScript Validation

```bash
npx tsc --noEmit
```

For the currently tested Windows environment using Node.js 26 and TypeScript 6, the following command was used successfully to avoid a TypeScript stack overflow:

```powershell
node --stack-size=8192 .\node_modules\typescript\bin\tsc --noEmit --incremental false
```

### Run Automated Tests

```bash
npx jest --runInBand --no-cache
```

### Expo Project Health

```bash
npx expo-doctor
```

### Build the Web Application

```bash
npx expo export --platform web
```

The successful web export produces a `dist` directory containing the generated web application assets.

## Application Architecture

Shavro separates application responsibilities across several areas:

- **Screens:** Dashboard, transaction forms, history, reports, settings, and backup management.
- **Components:** Reusable interface elements and financial visualizations.
- **Services:** Income and expense persistence, export, backup, restore, and recovery operations.
- **Types:** TypeScript data models for financial transactions and backups.
- **Context:** Application theme management.
- **Constants:** Design values and reusable configuration.
- **Tests:** Storage behavior, restoration integrity, and failure recovery.

The architecture emphasizes maintainability, testability, and gradual feature development.

## Development Roadmap

### Completed

- [x] React Native, Expo, and TypeScript setup
- [x] Income management
- [x] Expense management
- [x] Local financial data persistence
- [x] Financial dashboard
- [x] Transaction history
- [x] Transaction editing and deletion
- [x] Advanced transaction filtering
- [x] Monthly reports and analytics
- [x] Yearly category-wise analytics
- [x] Monthly income-versus-expense charts
- [x] Excel transaction export with custom date ranges
- [x] Reusable custom categories and payment methods
- [x] Light, Dark, and System themes
- [x] Responsive desktop and mobile layouts
- [x] JSON backup export and validation
- [x] Protected backup restoration engine
- [x] Restore recovery and integrity tests
- [x] Browser restoration end-to-end validation
- [x] Automated test suite and successful web export

### In Progress

- [ ] Complete Android regression testing
- [ ] Complete iOS regression testing
- [ ] Finalize cross-platform Backup & Restore validation
- [ ] Accessibility verification on physical devices
- [ ] Large-data performance testing
- [ ] Production release readiness

### Planned Features

- [ ] Monthly budget management
- [ ] Recurring income and expenses
- [ ] Savings goals
- [ ] User authentication
- [ ] Backend integration
- [ ] Cloud synchronization
- [ ] Cross-device data synchronization
- [ ] Production distribution and release

The roadmap may evolve based on user experience, performance testing, and product priorities.

## Current Limitations

- Financial records are stored locally.
- Cross-device synchronization is unavailable.
- Backend authentication has not been implemented.
- Backup JSON files are not encrypted.
- Native device regression testing is incomplete.
- Full production release validation is ongoing.
- Some planned financial planning features, including budgets and recurring transactions, are not yet implemented.

## Development Philosophy

Shavro prioritizes:

**Financial Accuracy:** Ensure recorded and reported values remain consistent.

**Data Safety:** Protect financial records during normal storage operations and backup restoration.

**Accessibility:** Make financial tracking comfortable for users with different experience levels.

**Incremental Development:** Introduce changes in manageable steps while preserving tested functionality.

**Cross-Platform Consistency:** Maintain a familiar experience on Android, iOS, and web.

---

**Shavro — Your Money, Made Simple**

Built with React Native, Expo, and TypeScript.

_Project Status: Active Development_
