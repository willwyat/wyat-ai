# Zustand State Management Migration Guide

This guide explains how to migrate from local `useState` and `useEffect` patterns to centralized Zustand stores.

## Overview

We've created comprehensive Zustand stores for all major modules:

- **`useCapitalStore`** - Transactions, envelopes, accounts, cycles
- **`useWorkoutStore`** - Exercise types and entries
- **`useMetaStore`** - Persons, places, tags, keywording
- **`useJournalStore`** - Journal entries (already implemented)
- **`useVitalsStore`** - Vitals data (already implemented)
- **`useUIStore`** - Global UI state (theme, notifications, modals)

## Migration Steps

### 1. Import the Store

```typescript
import { useCapitalStore } from "@/stores";
```

### 2. Replace Local State with Store State

**Before:**

```typescript
const [transactions, setTransactions] = useState<Transaction[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**After:**

```typescript
const { transactions, loading, error, fetchTransactions, clearError } =
  useCapitalStore();
```

### 3. Replace useEffect with Store Actions

**Before:**

```typescript
useEffect(() => {
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/transactions");
      const data = await response.json();
      setTransactions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, []);
```

**After:**

```typescript
useEffect(() => {
  fetchTransactions();
}, [fetchTransactions]);
```

### 4. Replace Event Handlers with Store Actions

**Before:**

```typescript
const handleDelete = async (id: string) => {
  setDeleting((prev) => new Set(prev).add(id));
  try {
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  } catch (err) {
    setError(err.message);
  } finally {
    setDeleting((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  }
};
```

**After:**

```typescript
const { deleteTransaction } = useCapitalStore();

const handleDelete = (id: string, payee: string) => {
  deleteTransaction(id, payee);
};
```

## Store-Specific Migration Examples

### Capital Store

```typescript
// Complete migration example
import { useCapitalStore } from "@/stores";

export default function TransactionsPage() {
  const {
    // Data
    transactions,
    envelopes,
    accounts,
    cycles,
    envelopeUsage,

    // UI State
    loading,
    error,
    filters,
    sortOrder,

    // Operation States
    reclassifying,
    deleting,
    updatingType,

    // Modal State
    selectedTransaction,
    isModalOpen,

    // Actions
    fetchTransactions,
    fetchEnvelopes,
    fetchAccounts,
    fetchCycles,
    fetchEnvelopeUsage,
    reclassifyTransaction,
    updateTransactionType,
    deleteTransaction,
    setFilters,
    setSortOrder,
    setSelectedTransaction,
    setIsModalOpen,
    clearError,
  } = useCapitalStore();

  // Load data on mount
  useEffect(() => {
    fetchEnvelopes();
    fetchAccounts();
    fetchCycles();
  }, [fetchEnvelopes, fetchAccounts, fetchCycles]);

  // Fetch transactions when filters change
  useEffect(() => {
    fetchTransactions();
  }, [filters, fetchTransactions]);

  // Rest of component...
}
```

### Workout Store

```typescript
import { useWorkoutStore } from "@/stores";

export default function WorkoutPage() {
  const {
    // Data
    exerciseTypes,
    exerciseEntries,

    // UI State
    activeTab,
    loading,
    error,

    // Form States
    exerciseTypeForm,
    exerciseEntryForm,

    // Actions
    loadExerciseTypes,
    loadExerciseEntries,
    createExerciseType,
    updateExerciseType,
    deleteExerciseType,
    createExerciseEntry,
    updateExerciseEntry,
    deleteExerciseEntry,
    setActiveTab,
    setExerciseTypeForm,
    setExerciseEntryForm,
    resetExerciseTypeForm,
    resetExerciseEntryForm,
    clearError,
  } = useWorkoutStore();

  useEffect(() => {
    loadExerciseTypes();
    loadExerciseEntries();
  }, [loadExerciseTypes, loadExerciseEntries]);

  // Rest of component...
}
```

### Meta Store

```typescript
import { useMetaStore } from "@/stores";

export default function PersonsPage() {
  const {
    // Data
    personRegistry,

    // UI State
    loading,
    error,
    saving,

    // Person Registry State
    isEditingPersonRegistry,
    editPersonTitle,
    editPersonVersion,
    showAddPersonForm,
    editingPerson,
    newPerson,
    newNickname,
    editPerson,

    // Actions
    fetchPersonRegistry,
    savePersonRegistry,
    addPerson,
    updatePerson,
    deletePerson,
    setIsEditingPersonRegistry,
    setEditPersonTitle,
    setEditPersonVersion,
    setShowAddPersonForm,
    setEditingPerson,
    setNewPerson,
    setNewNickname,
    setEditPerson,
    clearError,
  } = useMetaStore();

  useEffect(() => {
    fetchPersonRegistry();
  }, [fetchPersonRegistry]);

  // Rest of component...
}
```

### UI Store

```typescript
import { useUIStore } from "@/stores";

export default function Layout() {
  const {
    // UI State
    sidebarOpen,
    darkMode,
    globalLoading,
    globalError,
    notifications,
    modals,

    // Actions
    setSidebarOpen,
    toggleSidebar,
    setDarkMode,
    toggleDarkMode,
    setGlobalLoading,
    setGlobalError,
    clearGlobalError,
    addNotification,
    removeNotification,
    clearNotifications,
    openModal,
    closeModal,
    closeAllModals,
  } = useUIStore();

  // Use in components...
}
```

## Benefits of Migration

### 1. **Centralized State Management**

- All state in one place
- Easy to debug with Redux DevTools
- Consistent state updates

### 2. **Reduced Boilerplate**

- No more `useState` and `useEffect` chains
- Automatic loading/error state management
- Built-in optimistic updates

### 3. **Better Performance**

- Zustand only re-renders components that use changed state
- No unnecessary re-renders
- Efficient state updates

### 4. **Type Safety**

- Full TypeScript support
- Compile-time error checking
- IntelliSense support

### 5. **Persistence**

- Easy to add persistence with middleware
- State survives page refreshes
- Offline support ready

## Migration Checklist

- [ ] Import the appropriate store
- [ ] Replace local state with store state
- [ ] Replace useEffect with store actions
- [ ] Replace event handlers with store actions
- [ ] Remove unused imports (`useState`, `useEffect`)
- [ ] Test all functionality
- [ ] Update component tests if needed

## Best Practices

### 1. **Selective State Usage**

```typescript
// Only subscribe to the state you need
const { transactions, loading } = useCapitalStore();
```

### 2. **Action Destructuring**

```typescript
// Destructure actions for cleaner code
const { fetchTransactions, setFilters } = useCapitalStore();
```

### 3. **Error Handling**

```typescript
// Use the global error handling
const { error, clearError } = useCapitalStore();

if (error) {
  return <ErrorComponent error={error} onRetry={clearError} />;
}
```

### 4. **Loading States**

```typescript
// Use store loading states
const { loading } = useCapitalStore();

if (loading) {
  return <LoadingSpinner />;
}
```

## Troubleshooting

### Common Issues

1. **Infinite Re-renders**

   - Make sure to use `useCallback` for actions that depend on state
   - Check for circular dependencies in useEffect

2. **State Not Updating**

   - Verify the store action is being called
   - Check if the component is subscribed to the right state slice

3. **Type Errors**
   - Ensure all types are properly exported from stores
   - Check that store actions match the expected signatures

### Debug Tips

1. **Use Redux DevTools**

   - Install the Redux DevTools extension
   - All Zustand stores are visible in the DevTools

2. **Console Logging**

   - Add `console.log` in store actions to debug
   - Use the `devtools` middleware for better debugging

3. **Store Inspection**
   - Use `useCapitalStore.getState()` to inspect current state
   - Use `useCapitalStore.setState()` for manual state updates

## Next Steps

1. **Migrate Components Gradually**

   - Start with simple components
   - Move to complex components with multiple state dependencies

2. **Add Persistence**

   - Use `persist` middleware for important state
   - Consider what state should survive page refreshes

3. **Add Middleware**

   - Add logging middleware for debugging
   - Add persistence middleware for offline support

4. **Optimize Performance**
   - Use `shallow` equality for complex state objects
   - Consider splitting large stores into smaller ones

This migration will significantly improve the maintainability and performance of your React application!
