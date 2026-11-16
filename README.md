# Shavro — Your Money, Made Simple

A modern, cross-platform personal finance application built with React Native, Expo, and TypeScript.

Shavro helps users manage their income, track expenses, view transaction history, and understand their financial activity through a simple, accessible interface.

**Project Status:** Active Development

## Overview

Shavro is designed around three principles:

- **Simplicity:** Easy to understand, even for first-time users.
- **Accessibility:** Readable typography, clear labels, and comfortable touch targets.
- **Consistency:** A clean experience across Android, iOS, and web.

## Technology Stack

| Technology | Purpose |
|---|---|
| React Native | Cross-platform application development |
| Expo | Development and application tooling |
| TypeScript | Type-safe application code |
| React Hooks | Component state and lifecycle management |
| AsyncStorage | Local transaction storage on mobile |
| Web Local Storage | Browser-based transaction storage |
| Lucide React Native | Interface icons |
| React Native Safe Area Context | Safe-area support |

## Implemented Features

### Income Management

- Add income transactions
- Edit existing income
- Delete income records
- Select income categories
- Enter transaction dates and optional notes
- Validate required fields and amounts

### Expense Management

- Add expenses
- Edit existing expenses
- Delete expense records
- Select expense categories
- Record payment methods
- Enter custom names using the Other option
- Validate amounts, dates, and required information

### Dashboard

- Total income
- Total expenses
- Net balance
- Recent financial activity
- Clear visual distinction between income and expenses
- Responsive layout for mobile and desktop

### Transaction History

- Combined income and expense history
- Individual transaction details
- Edit and delete actions
- Transaction dates and categories
- Financial totals

### User Interface

- Light Mode
- Dark Mode
- System theme preference
- Responsive Android, iOS, and web layouts
- Full-width desktop dashboard
- Mobile-friendly category and payment-method grids
- Safe-area support for modern mobile devices
- Keyboard dismissal controls

### Data Storage

Shavro currently stores transactions locally on the device or browser.

The application does not yet synchronize transactions between devices.

## Getting Started

### Prerequisites

- Node.js
- npm
- Expo-compatible development environment
- Android emulator, iOS device, or web browser

### Installation

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
cd shavro
```

Install dependencies:

```bash
npm install
```

Start development:

```bash
npx expo start
```

Run the web version:

```bash
npx expo start --web
```

### Quality Checks

TypeScript validation:

```bash
npx tsc --noEmit
```

Expo project health:

```bash
npx expo-doctor
```

## Development Roadmap

- [x] Core application setup
- [x] Income management
- [x] Expense management
- [x] Local persistence
- [x] Financial dashboard
- [x] Transaction history
- [x] Transaction editing and deletion
- [x] Light, Dark, and System themes
- [x] Responsive layouts
- [x] Keyboard usability improvements
- [ ] Complete cross-platform regression testing
- [ ] Advanced transaction filters and search
- [ ] Monthly reports and financial analytics
- [ ] Excel transaction export
- [ ] Reusable custom categories and payment methods
- [ ] Monthly budget management
- [ ] Recurring transactions
- [ ] Savings goals
- [ ] User authentication and backend integration
- [ ] Cloud synchronization
- [ ] Production release

## Planned Advanced Filters

The upcoming filtering system will support:

- Month and year
- Custom date ranges
- Transaction type
- Income and expense categories
- Payment methods
- Minimum and maximum amounts
- Transaction search
- Sorting by date and amount
- Multiple simultaneous filters
- Resetting filters
- Financial totals for filtered transactions

## Architecture

The application uses a component-based structure with separate responsibilities for:

- Screens and navigation
- Reusable interface components
- Data types
- Local storage services
- Financial calculations
- Application themes
- Constants and configuration

The architecture will evolve as new features are introduced.

## Current Limitations

- Transactions are stored locally.
- Cross-device synchronization is not yet supported.
- Backend authentication is planned but not implemented.
- Advanced analytics and filtering are under development.
- Custom category and payment-method management is not yet implemented.

## Development Philosophy

Shavro prioritizes reliability, financial accuracy, accessibility, and ease of use.

New functionality is introduced incrementally, with an emphasis on preserving existing features and validating changes before release.

---

**Shavro — Your Money, Made Simple**

Built with React Native, Expo, and TypeScript.