import { create } from "zustand";
import { devtools } from "zustand/middleware";

// Global UI state for the entire app
interface UIState {
  // Navigation
  currentPage: string;
  sidebarOpen: boolean;

  // Theme
  darkMode: boolean;

  // Loading states
  globalLoading: boolean;

  // Error handling
  globalError: string | null;

  // Notifications
  notifications: Notification[];

  // Modal states
  modals: {
    [key: string]: boolean;
  };

  // Actions - Navigation
  setCurrentPage: (page: string) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Actions - Theme
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;

  // Actions - Loading
  setGlobalLoading: (loading: boolean) => void;

  // Actions - Error handling
  setGlobalError: (error: string | null) => void;
  clearGlobalError: () => void;

  // Actions - Notifications
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Actions - Modals
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  closeAllModals: () => void;
}

export interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number; // in milliseconds, 0 means persistent
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  action: () => void;
  variant?: "primary" | "secondary" | "danger";
}

export const useUIStore = create<UIState>()(
  devtools(
    (set, get) => ({
      // Initial State
      currentPage: "/",
      sidebarOpen: false,
      darkMode: false,
      globalLoading: false,
      globalError: null,
      notifications: [],
      modals: {},

      // Navigation Actions
      setCurrentPage: (page) => {
        set({ currentPage: page });
      },

      setSidebarOpen: (open) => {
        set({ sidebarOpen: open });
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarOpen: !state.sidebarOpen }));
      },

      // Theme Actions
      setDarkMode: (dark) => {
        set({ darkMode: dark });
        // Persist to localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("darkMode", dark.toString());
        }
      },

      toggleDarkMode: () => {
        set((state) => {
          const newDarkMode = !state.darkMode;
          // Persist to localStorage
          if (typeof window !== "undefined") {
            localStorage.setItem("darkMode", newDarkMode.toString());
          }
          return { darkMode: newDarkMode };
        });
      },

      // Loading Actions
      setGlobalLoading: (loading) => {
        set({ globalLoading: loading });
      },

      // Error Actions
      setGlobalError: (error) => {
        set({ globalError: error });
      },

      clearGlobalError: () => {
        set({ globalError: null });
      },

      // Notification Actions
      addNotification: (notification) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newNotification: Notification = {
          ...notification,
          id,
          duration: notification.duration ?? 5000, // Default 5 seconds
        };

        set((state) => ({
          notifications: [...state.notifications, newNotification],
        }));

        // Auto-remove notification after duration
        if (newNotification.duration > 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, newNotification.duration);
        }
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearNotifications: () => {
        set({ notifications: [] });
      },

      // Modal Actions
      openModal: (modalId) => {
        set((state) => ({
          modals: { ...state.modals, [modalId]: true },
        }));
      },

      closeModal: (modalId) => {
        set((state) => ({
          modals: { ...state.modals, [modalId]: false },
        }));
      },

      closeAllModals: () => {
        set({ modals: {} });
      },
    }),
    {
      name: "ui-store",
    }
  )
);

// Initialize dark mode from localStorage on client side
if (typeof window !== "undefined") {
  const savedDarkMode = localStorage.getItem("darkMode");
  if (savedDarkMode !== null) {
    useUIStore.getState().setDarkMode(savedDarkMode === "true");
  }
}
