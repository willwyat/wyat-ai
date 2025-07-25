import { create } from "zustand";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

export interface JournalEntry {
  _id: string | { $oid: string };
  title: string;
  versions: { text: string; timestamp: string }[];
  timestamp: string;
  date_unix: number;
}

export interface CreateJournalEntry {
  title: string;
  text: string;
  date_unix: number;
}

export interface UpdateJournalEntry {
  text: string;
}

interface JournalState {
  entries: JournalEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: JournalEntry | null;

  // Actions
  fetchEntries: () => Promise<void>;
  fetchEntryById: (id: string) => Promise<JournalEntry | null>;
  createEntry: (entry: CreateJournalEntry) => Promise<JournalEntry | null>;
  updateEntry: (id: string, entry: UpdateJournalEntry) => Promise<boolean>;
  deleteEntry: (id: string) => Promise<boolean>;
  setSelectedEntry: (entry: JournalEntry | null) => void;
  clearError: () => void;
}

export const useJournalStore = create<JournalState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,
  selectedEntry: null,

  fetchEntries: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/journal/mongo/all`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch entries: ${response.statusText}`);
      }

      const data: JournalEntry[] = await response.json();

      // Sort entries by date_unix in descending order (newest first)
      const sortedEntries = data.sort((a, b) => b.date_unix - a.date_unix);

      set({ entries: sortedEntries, loading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Failed to fetch entries",
        loading: false,
      });
    }
  },

  fetchEntryById: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/journal/mongo/${id}`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          set({ loading: false, error: "Entry not found" });
          return null;
        }
        throw new Error(`Failed to fetch entry: ${response.statusText}`);
      }

      const entry: JournalEntry = await response.json();
      set({ selectedEntry: entry, loading: false });
      return entry;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to fetch entry",
        loading: false,
      });
      return null;
    }
  },

  createEntry: async (entry: CreateJournalEntry) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/journal/mongo`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify(entry),
      });

      if (!response.ok) {
        throw new Error(`Failed to create entry: ${response.statusText}`);
      }

      const createdEntry: JournalEntry = await response.json();

      // Add the new entry to the list and re-sort
      const updatedEntries = [...get().entries, createdEntry].sort(
        (a, b) => b.date_unix - a.date_unix
      );

      set({ entries: updatedEntries, loading: false });
      return createdEntry;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Failed to create entry",
        loading: false,
      });
      return null;
    }
  },

  updateEntry: async (id: string, entry: UpdateJournalEntry) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/journal/mongo/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify(entry),
      });

      if (!response.ok) {
        throw new Error(`Failed to update entry: ${response.statusText}`);
      }

      // Refresh the entries list to get the updated data
      await get().fetchEntries();

      // If this was the selected entry, refresh it too
      if (get().selectedEntry?._id === id) {
        await get().fetchEntryById(id);
      }

      set({ loading: false });
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Failed to update entry",
        loading: false,
      });
      return false;
    }
  },

  deleteEntry: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_URL}/journal/mongo/${id}`, {
        method: "DELETE",
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete entry: ${response.statusText}`);
      }

      // Remove the entry from the list
      const updatedEntries = get().entries.filter((entry) => entry._id !== id);
      set({ entries: updatedEntries, loading: false });

      // Clear selected entry if it was the deleted one
      if (get().selectedEntry?._id === id) {
        set({ selectedEntry: null });
      }

      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Failed to delete entry",
        loading: false,
      });
      return false;
    }
  },

  setSelectedEntry: (entry: JournalEntry | null) => {
    set({ selectedEntry: entry });
  },

  clearError: () => {
    set({ error: null });
  },
}));
