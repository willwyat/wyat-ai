import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

// Types for workout data
export interface ExerciseType {
  _id: string;
  name: string;
  aliases?: string[];
  guidance?: string;
  primary_muscles: string[];
  default_load_basis?: "PerSide" | "Total";
}

export interface ExerciseEntry {
  _id: string;
  exercise_id: string;
  date_unix: number;
  intensity?: number;
  notes?: string;
  sets?: number;
  reps?: number;
  weight_value?: number;
  weight_unit?: "Kg" | "Lb";
  load_basis?: "PerSide" | "Total";
  time_seconds?: number;
  distance_meters?: number;
}

export interface ExerciseTypeInput {
  name: string;
  aliases?: string[];
  guidance?: string;
  primary_muscles: string[];
  default_load_basis?: "PerSide" | "Total";
}

export interface ExerciseEntryInput {
  exercise_id: string;
  date_unix: number;
  intensity?: number;
  notes?: string;
  sets?: number;
  reps?: number;
  weight_value?: number;
  weight_unit?: "Kg" | "Lb";
  load_basis?: "PerSide" | "Total";
  time_seconds?: number;
  distance_meters?: number;
}

interface WorkoutState {
  // Data
  exerciseTypes: ExerciseType[];
  exerciseEntries: ExerciseEntry[];

  // UI State
  activeTab: "add-type" | "log-exercise" | "view-all";
  loading: boolean;
  error: string | null;

  // Form States
  exerciseTypeForm: ExerciseTypeInput;
  exerciseEntryForm: ExerciseEntryInput;

  // Actions - Data Fetching
  loadExerciseTypes: () => Promise<void>;
  loadExerciseEntries: () => Promise<void>;

  // Actions - Exercise Types
  createExerciseType: (exerciseType: ExerciseTypeInput) => Promise<boolean>;
  updateExerciseType: (
    id: string,
    exerciseType: Partial<ExerciseTypeInput>
  ) => Promise<boolean>;
  deleteExerciseType: (id: string) => Promise<boolean>;

  // Actions - Exercise Entries
  createExerciseEntry: (entry: ExerciseEntryInput) => Promise<boolean>;
  updateExerciseEntry: (
    id: string,
    entry: Partial<ExerciseEntryInput>
  ) => Promise<boolean>;
  deleteExerciseEntry: (id: string) => Promise<boolean>;

  // Actions - UI
  setActiveTab: (tab: "add-type" | "log-exercise" | "view-all") => void;
  setExerciseTypeForm: (form: Partial<ExerciseTypeInput>) => void;
  setExerciseEntryForm: (form: Partial<ExerciseEntryInput>) => void;
  resetExerciseTypeForm: () => void;
  resetExerciseEntryForm: () => void;
  clearError: () => void;
}

const initialExerciseTypeForm: ExerciseTypeInput = {
  name: "",
  aliases: undefined,
  guidance: undefined,
  primary_muscles: [],
  default_load_basis: undefined,
};

const initialExerciseEntryForm: ExerciseEntryInput = {
  exercise_id: "",
  date_unix: Math.floor(Date.now() / 1000),
  intensity: undefined,
  notes: "",
  sets: undefined,
  reps: undefined,
  weight_value: undefined,
  weight_unit: undefined,
  load_basis: undefined,
  time_seconds: undefined,
  distance_meters: undefined,
};

export const useWorkoutStore = create<WorkoutState>()(
  devtools(
    (set, get) => ({
      // Initial State
      exerciseTypes: [],
      exerciseEntries: [],
      activeTab: "add-type",
      loading: false,
      error: null,
      exerciseTypeForm: initialExerciseTypeForm,
      exerciseEntryForm: initialExerciseEntryForm,

      // Data Fetching Actions
      loadExerciseTypes: async () => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/workout/exercise-types`, {
            headers: {
              "x-wyat-api-key": WYAT_API_KEY,
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          set({ exerciseTypes: data, loading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      loadExerciseEntries: async () => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/workout/exercise-entries`, {
            headers: {
              "x-wyat-api-key": WYAT_API_KEY,
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          set({ exerciseEntries: data, loading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
        }
      },

      // Exercise Type Actions
      createExerciseType: async (exerciseType: ExerciseTypeInput) => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/workout/exercise-types`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wyat-api-key": WYAT_API_KEY,
            },
            body: JSON.stringify(exerciseType),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const newExerciseType = await response.json();
          set((state) => ({
            exerciseTypes: [...state.exerciseTypes, newExerciseType],
            loading: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
          return false;
        }
      },

      updateExerciseType: async (
        id: string,
        exerciseType: Partial<ExerciseTypeInput>
      ) => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/workout/exercise-types/${id}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "x-wyat-api-key": WYAT_API_KEY,
              },
              body: JSON.stringify(exerciseType),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const updatedExerciseType = await response.json();
          set((state) => ({
            exerciseTypes: state.exerciseTypes.map((et) =>
              et._id === id ? updatedExerciseType : et
            ),
            loading: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
          return false;
        }
      },

      deleteExerciseType: async (id: string) => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/workout/exercise-types/${id}`,
            {
              method: "DELETE",
              headers: {
                "x-wyat-api-key": WYAT_API_KEY,
              },
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          set((state) => ({
            exerciseTypes: state.exerciseTypes.filter((et) => et._id !== id),
            loading: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
          return false;
        }
      },

      // Exercise Entry Actions
      createExerciseEntry: async (entry: ExerciseEntryInput) => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/workout/exercise-entries`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wyat-api-key": WYAT_API_KEY,
            },
            body: JSON.stringify(entry),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const newEntry = await response.json();
          set((state) => ({
            exerciseEntries: [...state.exerciseEntries, newEntry],
            loading: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
          return false;
        }
      },

      updateExerciseEntry: async (
        id: string,
        entry: Partial<ExerciseEntryInput>
      ) => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/workout/exercise-entries/${id}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "x-wyat-api-key": WYAT_API_KEY,
              },
              body: JSON.stringify(entry),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const updatedEntry = await response.json();
          set((state) => ({
            exerciseEntries: state.exerciseEntries.map((ee) =>
              ee._id === id ? updatedEntry : ee
            ),
            loading: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
          return false;
        }
      },

      deleteExerciseEntry: async (id: string) => {
        set({ loading: true, error: null });

        try {
          const response = await fetch(
            `${API_URL}/workout/exercise-entries/${id}`,
            {
              method: "DELETE",
              headers: {
                "x-wyat-api-key": WYAT_API_KEY,
              },
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          set((state) => ({
            exerciseEntries: state.exerciseEntries.filter(
              (ee) => ee._id !== id
            ),
            loading: false,
          }));

          return true;
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            loading: false,
          });
          return false;
        }
      },

      // UI Actions
      setActiveTab: (tab) => {
        set({ activeTab: tab });
      },

      setExerciseTypeForm: (form) => {
        set((state) => ({
          exerciseTypeForm: { ...state.exerciseTypeForm, ...form },
        }));
      },

      setExerciseEntryForm: (form) => {
        set((state) => ({
          exerciseEntryForm: { ...state.exerciseEntryForm, ...form },
        }));
      },

      resetExerciseTypeForm: () => {
        set({ exerciseTypeForm: initialExerciseTypeForm });
      },

      resetExerciseEntryForm: () => {
        set({ exerciseEntryForm: initialExerciseEntryForm });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "workout-store",
    }
  )
);
