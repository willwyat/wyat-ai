/**
 * Centralized styling utilities for the Capital module
 * Provides consistent Tailwind class combinations for reusable components
 */

export const styles = {
  // Select dropdown styling - used in table headers and transaction rows
  select: {
    base: "px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50",
    // Small version for transaction rows
    small:
      "px-2 py-0.5 text-xs font-normal normal-case tracking-normal border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50",
  },

  // Button styling
  button: {
    primary:
      "inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed",
    secondary:
      "inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed",
    danger:
      "inline-flex items-center px-3 py-1 border border-red-300 dark:border-red-600 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-base font-medium transition-colors",
  },

  // Table styling
  table: {
    header:
      "px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider",
    cell: "px-6 py-4 whitespace-nowrap text-base text-gray-900 dark:text-white",
    cellRight: "px-6 py-3 whitespace-nowrap text-right text-base font-medium",
    row: "transition-color duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer",
  },

  // Card styling
  card: {
    base: "bg-white dark:bg-gray-800 md:rounded-lg border border-gray-200 dark:border-gray-700",
    padded:
      "bg-white dark:bg-gray-800 md:rounded-lg p-4 mb-6 border border-gray-200 dark:border-gray-700",
  },

  // Loading spinner
  spinner: {
    small:
      "animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full",
    medium:
      "animate-spin h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full",
  },

  // Text styling
  text: {
    heading: "text-2xl font-semibold text-gray-900 dark:text-white mb-4",
    subheading: "text-lg font-medium text-gray-900 dark:text-white",
    muted: "text-sm text-gray-500 dark:text-gray-400",
    error: "text-red-600 dark:text-red-400",
  },

  // Badge styling
  badge: {
    type: {
      spending: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300",
      refund:
        "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300",
      income:
        "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300",
      transfer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
      transfer_fx:
        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
      fee_only:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
      trade: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
      adjustment:
        "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    },
    base: "text-[10px] px-1.5 py-0.5 rounded",
  },

  // Color classes for amounts
  amount: {
    positive: "text-green-700 dark:text-green-300",
    negative: "text-red-700 dark:text-red-300",
    neutral: "text-gray-800 dark:text-gray-100",
  },
} as const;

// Helper functions for common style combinations
export const getSelectClasses = (variant: "base" | "small" = "base") => {
  return styles.select[variant];
};

export const getButtonClasses = (
  variant: "primary" | "secondary" | "danger" = "primary"
) => {
  return styles.button[variant];
};

export const getBadgeClasses = (type: keyof typeof styles.badge.type) => {
  return `${styles.badge.base} ${styles.badge.type[type]}`;
};

export const getAmountClasses = (sign: "" | "+" | "-") => {
  switch (sign) {
    case "+":
      return styles.amount.positive;
    case "-":
      return styles.amount.negative;
    default:
      return styles.amount.neutral;
  }
};
