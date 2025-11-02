/**
 * Centralized configuration constants for the Capital module
 * Contains all hard-coded values used across components
 */

// Account IDs
export const PNL_ACCOUNT_ID = "__pnl__";

// Transaction Types
export const TX_TYPES = [
  { value: "spending", label: "Spending" },
  { value: "income", label: "Income" },
  { value: "fee_only", label: "Fee Only" },
  { value: "transfer", label: "Transfer" },
  { value: "transfer_fx", label: "Transfer (FX)" },
  { value: "trade", label: "Trade" },
  { value: "adjustment", label: "Adjustment" },
  { value: "refund", label: "Refund" },
] as const;

// Transaction Type Values (for type safety)
export const TX_TYPE_VALUES = TX_TYPES.map((t) => t.value) as readonly string[];

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  ENDPOINTS: {
    TRANSACTIONS: "/capital/transactions",
    CYCLES: "/capital/cycles",
    ENVELOPES: "/capital/envelopes",
    ACCOUNTS: "/capital/accounts",
    DATA_WATCHLIST: "/capital/data/watchlist",
    ENVELOPE_USAGE: (envelopeId: string) =>
      `/capital/envelopes/${envelopeId}/usage`,
    UPDATE_TRANSACTION_TYPE: (transactionId: string) =>
      `/capital/transactions/${transactionId}/type`,
  },
} as const;

// UI Configuration
export const UI_CONFIG = {
  // Pagination
  ITEMS_PER_PAGE: 50,

  // Grid Layouts
  ENVELOPE_GRID: "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6",

  // Table Configuration
  TABLE: {
    DEFAULT_SORT_ORDER: "default" as const,
    SORT_OPTIONS: ["default", "asc", "desc"] as const,
  },

  // Filter Defaults
  FILTERS: {
    DEFAULT_CYCLE_LABEL: "", // Will be set to active cycle
    DEFAULT_ACCOUNT_ID: "",
    DEFAULT_ENVELOPE_ID: "",
    DEFAULT_TX_TYPE: "",
  },

  // Loading States
  LOADING: {
    DEBOUNCE_MS: 300,
  },
} as const;

// Currency Configuration
export const CURRENCY_CONFIG = {
  DEFAULT_CURRENCY: "USD",
  SUPPORTED_CURRENCIES: ["USD", "HKD", "EUR", "GBP", "BTC", "ETH"] as const,
  DECIMAL_PLACES: {
    USD: 2,
    HKD: 2,
    EUR: 2,
    GBP: 2,
    BTC: 8,
    ETH: 8,
  },
} as const;

// Date/Time Configuration
export const DATE_CONFIG = {
  // Date formatting
  DISPLAY_FORMAT: "MMM dd, yyyy",
  API_FORMAT: "yyyy-MM-dd",

  // Timezone handling
  DEFAULT_TIMEZONE: "UTC",

  // Cycle configuration
  CYCLE_START_DAY: 10, // 10th of each month
  CYCLE_END_DAY: 9, // 9th of next month
} as const;

// Validation Configuration
export const VALIDATION_CONFIG = {
  // Transaction validation
  TRANSACTION: {
    MIN_AMOUNT: 0.01,
    MAX_AMOUNT: 999999999.99,
    REQUIRED_FIELDS: ["id", "ts", "legs"] as const,
  },

  // Envelope validation
  ENVELOPE: {
    MIN_BUDGET: 0,
    MAX_BUDGET: 999999999.99,
    REQUIRED_FIELDS: ["id", "name", "status"] as const,
  },
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK: "Network error. Please check your connection.",
  UNAUTHORIZED: "Unauthorized. Please log in again.",
  NOT_FOUND: "Resource not found.",
  VALIDATION: "Please check your input and try again.",
  SERVER: "Server error. Please try again later.",
  GENERIC: "An unexpected error occurred.",
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  TRANSACTION_UPDATED: "Transaction updated successfully",
  TRANSACTION_DELETED: "Transaction deleted successfully",
  ENVELOPE_UPDATED: "Envelope updated successfully",
  TYPE_UPDATED: "Transaction type updated successfully",
} as const;

// Material Icons
export const ICONS = {
  CHEVRON_LEFT: "chevron_left",
  CHEVRON_RIGHT: "chevron_right",
  ARROW_RIGHT_ALT: "arrow_right_alt",
  DELETE: "delete",
  EDIT: "edit",
  SAVE: "save",
  CANCEL: "cancel",
} as const;

// Color Mapping for Account Colors
export const ACCOUNT_COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "gray",
  "slate",
  "zinc",
  "neutral",
  "stone",
] as const;

// Default Values
export const DEFAULTS = {
  ACCOUNT_COLOR: "gray",
  ENVELOPE_STATUS: "Active",
  TRANSACTION_STATUS: "Posted",
  RECONCILED: false,
} as const;
