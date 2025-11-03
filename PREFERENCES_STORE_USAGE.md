# Preferences Store Usage Guide

## Overview

The preferences store manages user preferences and privacy settings across the application. It uses Zustand with persistence to save preferences to localStorage.

## Features

- **Persistent Storage**: Preferences are saved to localStorage and persist across sessions
- **Privacy Controls**: Hide/show sensitive financial information
- **Type-Safe**: Full TypeScript support

## State

### `hideBalances: boolean`

Controls whether sensitive financial amounts (balances, transaction amounts, portfolio values) are hidden from view.

- **Default**: `false` (balances are visible)
- **Persisted**: Yes (saved to localStorage as `wyat-preferences`)

## Actions

### `setHideBalances(hide: boolean)`

Set the hideBalances state to a specific value.

```typescript
const { setHideBalances } = usePreferencesStore();

// Hide balances
setHideBalances(true);

// Show balances
setHideBalances(false);
```

### `toggleHideBalances()`

Toggle the hideBalances state between true and false.

```typescript
const { toggleHideBalances } = usePreferencesStore();

// Toggle visibility
toggleHideBalances();
```

## Usage Examples

### Basic Usage

```typescript
import { usePreferencesStore } from "@/stores/preferences-store";

function MyComponent() {
  const { hideBalances, toggleHideBalances } = usePreferencesStore();

  return (
    <div>
      <button onClick={toggleHideBalances}>
        {hideBalances ? "Show Balances" : "Hide Balances"}
      </button>

      <div>Balance: {hideBalances ? "****" : "$1,234.56"}</div>
    </div>
  );
}
```

### Conditional Rendering

```typescript
import { usePreferencesStore } from "@/stores/preferences-store";

function BalanceDisplay({ amount }: { amount: number }) {
  const hideBalances = usePreferencesStore((state) => state.hideBalances);

  return (
    <span>
      {hideBalances
        ? "••••••"
        : `$${amount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
    </span>
  );
}
```

### Toggle Button Component

```typescript
import { usePreferencesStore } from "@/stores/preferences-store";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

function BalanceToggle() {
  const { hideBalances, toggleHideBalances } = usePreferencesStore();

  return (
    <button
      onClick={toggleHideBalances}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
      title={hideBalances ? "Show balances" : "Hide balances"}
    >
      {hideBalances ? (
        <EyeSlashIcon className="w-5 h-5" />
      ) : (
        <EyeIcon className="w-5 h-5" />
      )}
    </button>
  );
}
```

### Helper Function for Formatting

```typescript
import { usePreferencesStore } from "@/stores/preferences-store";

// Create a reusable helper
export function useFormatAmount() {
  const hideBalances = usePreferencesStore((state) => state.hideBalances);

  return (amount: number, currency: string = "USD"): string => {
    if (hideBalances) {
      return "••••••";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };
}

// Usage in component
function TransactionRow({ amount }: { amount: number }) {
  const formatAmount = useFormatAmount();

  return <td>{formatAmount(amount)}</td>;
}
```

### Integration with Funds Page

```typescript
import { usePreferencesStore } from "@/stores/preferences-store";

function FundsPage() {
  const { funds, positionsByFund } = useCapitalStore();
  const hideBalances = usePreferencesStore((state) => state.hideBalances);

  const totalValue = calculateTotalValue(funds, positionsByFund);

  return (
    <div>
      <h1>Total Portfolio Value</h1>
      <div className="text-3xl font-bold">
        {hideBalances ? "••••••••" : `$${totalValue.toLocaleString()}`}
      </div>
    </div>
  );
}
```

### Settings Page Integration

```typescript
import { usePreferencesStore } from "@/stores/preferences-store";

function SettingsPage() {
  const { hideBalances, setHideBalances } = usePreferencesStore();

  return (
    <div className="space-y-4">
      <h2>Privacy Settings</h2>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Hide Financial Balances</h3>
          <p className="text-sm text-gray-500">
            Hide sensitive amounts across the app
          </p>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={hideBalances}
            onChange={(e) => setHideBalances(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>
    </div>
  );
}
```

## Best Practices

### 1. Use Selector Pattern for Performance

```typescript
// Good - only re-renders when hideBalances changes
const hideBalances = usePreferencesStore((state) => state.hideBalances);

// Avoid - re-renders on any state change
const { hideBalances } = usePreferencesStore();
```

### 2. Consistent Masking

Use consistent masking characters across the app:

- **Short amounts**: `••••••` (6 dots)
- **Long amounts**: `••••••••` (8 dots)
- **Alternative**: `****` (asterisks)

### 3. Provide Visual Feedback

Always indicate when balances are hidden:

```typescript
<div className="flex items-center gap-2">
  {hideBalances && <span className="text-xs text-gray-500">(Hidden)</span>}
  <span>{formatAmount(balance)}</span>
</div>
```

### 4. Accessibility

Ensure screen readers announce the state:

```typescript
<span aria-label={hideBalances ? "Balance hidden" : `Balance: ${amount}`}>
  {hideBalances ? "••••••" : formatAmount(amount)}
</span>
```

## Storage Details

- **Storage Key**: `wyat-preferences`
- **Storage Type**: localStorage
- **Persistence**: Automatic via Zustand persist middleware
- **Scope**: Per browser/device

## Future Enhancements

Potential additions to the preferences store:

- Theme preference (light/dark/system)
- Currency display preference
- Date format preference
- Number format preference (US/EU)
- Language preference
- Notification preferences
- Data refresh intervals
- Default views/filters

## Testing

```typescript
import { usePreferencesStore } from "@/stores/preferences-store";

// Get initial state
const initialState = usePreferencesStore.getState();
console.log(initialState.hideBalances); // false

// Update state
usePreferencesStore.getState().setHideBalances(true);

// Toggle state
usePreferencesStore.getState().toggleHideBalances();

// Clear persisted state (for testing)
localStorage.removeItem("wyat-preferences");
```

## Migration Notes

If you need to migrate from a previous preferences system:

```typescript
// Check for old preference key
const oldHideBalances = localStorage.getItem("hideBalances");
if (oldHideBalances !== null) {
  usePreferencesStore.getState().setHideBalances(oldHideBalances === "true");
  localStorage.removeItem("hideBalances");
}
```
