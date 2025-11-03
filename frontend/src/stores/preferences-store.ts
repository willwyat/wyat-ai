import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PreferencesState {
  // Privacy settings
  hideBalances: boolean;
  // Theme settings
  isDarkMode: boolean;

  // Actions
  setHideBalances: (hide: boolean) => void;
  toggleHideBalances: () => void;
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      // Initial state
      hideBalances: false,
      isDarkMode: false,

      // Actions
      setHideBalances: (hide: boolean) => set({ hideBalances: hide }),

      toggleHideBalances: () =>
        set((state) => ({ hideBalances: !state.hideBalances })),

      setDarkMode: (dark: boolean) => set({ isDarkMode: dark }),

      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
    }),
    {
      name: "wyat-preferences", // localStorage key
    }
  )
);
