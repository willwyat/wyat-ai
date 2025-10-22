import { create } from "zustand";
import { API_URL } from "@/lib/config";

const API_CONFIG = {
  BASE_URL: API_URL,
};

// ==================
// Types
// ==================

export interface AiPrompt {
  _id: { $oid: string };
  id: string;
  namespace: string;
  task: string;
  version: number;
  description?: string;
  model?: string;
  prompt_template: string;
  created_at?: { $date: { $numberLong: string } };
  updated_at?: { $date: { $numberLong: string } };
}

// ==================
// Store
// ==================

interface AiState {
  // Data
  prompts: Map<string, AiPrompt>;
  loading: boolean;
  error: string | null;

  // Actions
  getAiPrompt: (promptId: string) => Promise<AiPrompt>;
  listAiPrompts: (namespace?: string) => Promise<AiPrompt[]>;
  clearError: () => void;
}

export const useAiStore = create<AiState>()((set, get) => ({
  // Initial State
  prompts: new Map(),
  loading: false,
  error: null,

  // Actions
  getAiPrompt: async (promptId: string) => {
    // Check cache first
    const cached = get().prompts.get(promptId);
    if (cached) {
      return cached;
    }

    set({ loading: true, error: null });
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/ai/prompts/${promptId}`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch prompt: ${response.status} ${response.statusText}`
        );
      }

      const prompt: AiPrompt = await response.json();

      // Cache the prompt
      set((state) => {
        const newPrompts = new Map(state.prompts);
        newPrompts.set(promptId, prompt);
        return { prompts: newPrompts, loading: false };
      });

      return prompt;
    } catch (error: any) {
      const errorMsg = error?.message || "Failed to fetch AI prompt";
      set({ error: errorMsg, loading: false });
      throw error;
    }
  },

  listAiPrompts: async (namespace?: string) => {
    set({ loading: true, error: null });
    try {
      const url = namespace
        ? `${API_CONFIG.BASE_URL}/ai/prompts?namespace=${namespace}`
        : `${API_CONFIG.BASE_URL}/ai/prompts`;

      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to list prompts: ${response.status} ${response.statusText}`
        );
      }

      const prompts: AiPrompt[] = await response.json();

      // Cache all prompts
      set((state) => {
        const newPrompts = new Map(state.prompts);
        prompts.forEach((prompt) => {
          newPrompts.set(prompt.id, prompt);
        });
        return { prompts: newPrompts, loading: false };
      });

      return prompts;
    } catch (error: any) {
      const errorMsg = error?.message || "Failed to list AI prompts";
      set({ error: errorMsg, loading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
