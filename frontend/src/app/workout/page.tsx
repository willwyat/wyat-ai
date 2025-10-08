"use client";

import { useState, useEffect } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

// Types matching the backend
interface Muscle {
  Chest: "chest";
  Back: "back";
  Shoulders: "shoulders";
  Biceps: "biceps";
  Triceps: "triceps";
  Forearms: "forearms";
  Glutes: "glutes";
  Quads: "quads";
  Hamstrings: "hamstrings";
  Calves: "calves";
  Abdominals: "abdominals";
  SpinalErectors: "spinal_erectors";
  Obliques: "obliques";
}

interface WeightUnit {
  Kg: "kg";
  Lb: "lb";
}

interface LoadBasis {
  PerSide: "per_side";
  Total: "total";
}

interface ExerciseType {
  _id?: string;
  name: string;
  aliases?: string[];
  primary_muscles: (keyof Muscle)[];
  guidance?: string[];
  default_load_basis?: keyof LoadBasis;
}

interface ExerciseEntry {
  _id?: string;
  exercise_id?: string;
  exercise_label: string;
  date_unix: number;
  intensity?: number;
  notes?: string;
  tz?: string;
  sets?: number;
  reps?: number;
  weight_value?: number;
  weight_unit?: keyof WeightUnit;
  load_basis?: keyof LoadBasis;
  time_seconds?: number;
  distance_meters?: number;
}

interface ExerciseTypeInput {
  name: string;
  aliases?: string[];
  primary_muscles: (keyof Muscle)[];
  guidance?: string[];
  default_load_basis?: keyof LoadBasis;
}

interface ExerciseEntryInput {
  exercise_id: string;
  date_unix: number;
  intensity?: number;
  notes?: string;
  sets?: number;
  reps?: number;
  weight_value?: number;
  weight_unit?: keyof WeightUnit;
  load_basis?: keyof LoadBasis;
  time_seconds?: number;
  distance_meters?: number;
}

const MUSCLE_OPTIONS: (keyof Muscle)[] = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
  "Abdominals",
  "SpinalErectors",
  "Obliques",
];

// Helper function to convert PascalCase to snake_case for API
const muscleToSnakeCase = (muscle: keyof Muscle): string => {
  const mapping: Record<keyof Muscle, string> = {
    Chest: "chest",
    Back: "back",
    Shoulders: "shoulders",
    Biceps: "biceps",
    Triceps: "triceps",
    Forearms: "forearms",
    Glutes: "glutes",
    Quads: "quads",
    Hamstrings: "hamstrings",
    Calves: "calves",
    Abdominals: "abdominals",
    SpinalErectors: "spinal_erectors",
    Obliques: "obliques",
  };
  return mapping[muscle];
};

// Helper function to convert snake_case to PascalCase for display
const muscleToPascalCase = (muscle: string): keyof Muscle => {
  const mapping: Record<string, keyof Muscle> = {
    chest: "Chest",
    back: "Back",
    shoulders: "Shoulders",
    biceps: "Biceps",
    triceps: "Triceps",
    forearms: "Forearms",
    glutes: "Glutes",
    quads: "Quads",
    hamstrings: "Hamstrings",
    calves: "Calves",
    abdominals: "Abdominals",
    spinal_erectors: "SpinalErectors",
    obliques: "Obliques",
  };
  return mapping[muscle] || (muscle as keyof Muscle);
};

const WEIGHT_UNITS: (keyof WeightUnit)[] = ["Kg", "Lb"];
const LOAD_BASIS_OPTIONS: (keyof LoadBasis)[] = ["PerSide", "Total"];

export default function WorkoutPage() {
  const [activeTab, setActiveTab] = useState<
    "add-type" | "log-exercise" | "view-all"
  >("add-type");
  const [exerciseTypes, setExerciseTypes] = useState<ExerciseType[]>([]);
  const [exerciseEntries, setExerciseEntries] = useState<ExerciseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [exerciseTypeForm, setExerciseTypeForm] = useState<ExerciseTypeInput>({
    name: "",
    aliases: undefined,
    guidance: undefined,
    primary_muscles: [],
    default_load_basis: undefined,
  });

  const [exerciseEntryForm, setExerciseEntryForm] =
    useState<ExerciseEntryInput>({
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
    });

  // Load data on component mount
  useEffect(() => {
    loadExerciseTypes();
    loadExerciseEntries();
  }, []);

  const loadExerciseTypes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/workout/exercise-types`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (!response.ok) {
        let errorMessage = `Failed to load exercise types: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If JSON parsing fails, use the status text
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      // Convert ObjectId to string for frontend
      const processedData = data.map((type: any) => ({
        ...type,
        _id: type._id?.$oid || type._id,
      }));
      setExerciseTypes(processedData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load exercise types"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadExerciseEntries = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/workout/exercise-entries`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (!response.ok) {
        let errorMessage = `Failed to load exercise entries: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If JSON parsing fails, use the status text
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      // Convert ObjectId to string for frontend
      const processedData = data.map((entry: any) => ({
        ...entry,
        _id: entry._id?.$oid || entry._id,
        exercise_id: entry.exercise_id?.$oid || entry.exercise_id,
      }));
      setExerciseEntries(processedData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load exercise entries"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddExerciseType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      // Convert muscle names to snake_case for API
      const apiPayload = {
        ...exerciseTypeForm,
        primary_muscles:
          exerciseTypeForm.primary_muscles.map(muscleToSnakeCase),
        default_load_basis:
          exerciseTypeForm.default_load_basis?.toLowerCase() as
            | keyof LoadBasis
            | undefined,
      };

      const response = await fetch(`${API_URL}/workout/exercise-types`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify(apiPayload),
      });

      if (!response.ok) {
        let errorMessage = `Failed to create exercise type: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If JSON parsing fails, use the status text
        }
        throw new Error(errorMessage);
      }

      const newExerciseType = await response.json();
      // Convert ObjectId to string for frontend
      const processedType = {
        ...newExerciseType,
        _id: newExerciseType._id?.$oid || newExerciseType._id,
      };
      setExerciseTypes([...exerciseTypes, processedType]);
      setExerciseTypeForm({
        name: "",
        aliases: undefined,
        guidance: undefined,
        primary_muscles: [],
        default_load_basis: undefined,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create exercise type"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      // Convert weight unit to lowercase for API
      const apiPayload = {
        ...exerciseEntryForm,
        weight_unit: exerciseEntryForm.weight_unit?.toLowerCase() as
          | keyof WeightUnit
          | undefined,
        load_basis: exerciseEntryForm.load_basis?.toLowerCase() as
          | keyof LoadBasis
          | undefined,
      };

      const response = await fetch(`${API_URL}/workout/exercise-entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify(apiPayload),
      });

      if (!response.ok) {
        let errorMessage = `Failed to log exercise: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If JSON parsing fails, use the status text
        }
        throw new Error(errorMessage);
      }

      const newExerciseEntry = await response.json();
      // Convert ObjectId to string for frontend
      const processedEntry = {
        ...newExerciseEntry,
        _id: newExerciseEntry._id?.$oid || newExerciseEntry._id,
        exercise_id:
          newExerciseEntry.exercise_id?.$oid || newExerciseEntry.exercise_id,
      };
      setExerciseEntries([...exerciseEntries, processedEntry]);
      setExerciseEntryForm({
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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log exercise");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (unix: number) => {
    const date = new Date(unix * 1000);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Helper to convert Unix timestamp to datetime-local format (in local timezone)
  const unixToDatetimeLocal = (unixTimestamp: number): string => {
    const date = new Date(unixTimestamp * 1000);
    // Format: YYYY-MM-DDTHH:mm
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Helper to convert datetime-local format to Unix timestamp
  const datetimeLocalToUnix = (datetimeLocal: string): number => {
    return Math.floor(new Date(datetimeLocal).getTime() / 1000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 font-serif">Workout Tracker</h1>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-8 border-b border-gray-200">
          {[
            { id: "add-type", label: "Add Exercise Type" },
            { id: "log-exercise", label: "Log Exercise" },
            { id: "view-all", label: "View All" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-100 text-blue-700 border-b-2 border-blue-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Add Exercise Type Tab */}
        {activeTab === "add-type" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold mb-6 font-serif">
              Add New Exercise Type
            </h2>
            <form onSubmit={handleAddExerciseType} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Exercise Name *
                </label>
                <input
                  type="text"
                  value={exerciseTypeForm.name}
                  onChange={(e) =>
                    setExerciseTypeForm({
                      ...exerciseTypeForm,
                      name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Muscles
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {MUSCLE_OPTIONS.map((muscle) => (
                    <label key={muscle} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exerciseTypeForm.primary_muscles.includes(
                          muscle
                        )}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setExerciseTypeForm({
                              ...exerciseTypeForm,
                              primary_muscles: [
                                ...exerciseTypeForm.primary_muscles,
                                muscle,
                              ],
                            });
                          } else {
                            setExerciseTypeForm({
                              ...exerciseTypeForm,
                              primary_muscles:
                                exerciseTypeForm.primary_muscles.filter(
                                  (m) => m !== muscle
                                ),
                            });
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm">{muscle}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Load Basis
                </label>
                <select
                  value={exerciseTypeForm.default_load_basis || ""}
                  onChange={(e) =>
                    setExerciseTypeForm({
                      ...exerciseTypeForm,
                      default_load_basis:
                        (e.target.value as keyof LoadBasis) || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {LOAD_BASIS_OPTIONS.map((basis) => (
                    <option key={basis} value={basis}>
                      {basis === "PerSide" ? "Per Side" : "Total"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Aliases (comma-separated)
                </label>
                <input
                  type="text"
                  value={exerciseTypeForm.aliases?.join(", ") || ""}
                  onChange={(e) => {
                    const trimmedValue = e.target.value.trim();
                    setExerciseTypeForm({
                      ...exerciseTypeForm,
                      aliases: trimmedValue
                        ? e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter((s) => s)
                        : undefined,
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., bench press, chest press"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Guidance (one per line)
                </label>
                <textarea
                  value={exerciseTypeForm.guidance?.join("\n") || ""}
                  onChange={(e) => {
                    const trimmedValue = e.target.value.trim();
                    setExerciseTypeForm({
                      ...exerciseTypeForm,
                      guidance: trimmedValue
                        ? e.target.value.split("\n").filter((s) => s.trim())
                        : undefined,
                    });
                  }}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter guidance tips, one per line"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !exerciseTypeForm.name.trim()}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Create Exercise Type"}
              </button>
            </form>
          </div>
        )}

        {/* Log Exercise Tab */}
        {activeTab === "log-exercise" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold mb-6 font-serif">
              Log Exercise
            </h2>
            <form onSubmit={handleLogExercise} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Exercise Type *
                </label>
                <select
                  value={exerciseEntryForm.exercise_id}
                  onChange={(e) => {
                    setExerciseEntryForm({
                      ...exerciseEntryForm,
                      exercise_id: e.target.value,
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select an exercise type</option>
                  {exerciseTypes.map((type) => (
                    <option key={type._id} value={type._id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date & Time * (in your local timezone)
                </label>
                <input
                  type="datetime-local"
                  value={unixToDatetimeLocal(exerciseEntryForm.date_unix)}
                  onChange={(e) =>
                    setExerciseEntryForm({
                      ...exerciseEntryForm,
                      date_unix: datetimeLocalToUnix(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your timezone:{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Intensity (1-5)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={exerciseEntryForm.intensity || ""}
                    onChange={(e) =>
                      setExerciseEntryForm({
                        ...exerciseEntryForm,
                        intensity: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Load Basis
                  </label>
                  <select
                    value={exerciseEntryForm.load_basis || ""}
                    onChange={(e) =>
                      setExerciseEntryForm({
                        ...exerciseEntryForm,
                        load_basis:
                          (e.target.value as keyof LoadBasis) || undefined,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Use exercise default</option>
                    {LOAD_BASIS_OPTIONS.map((basis) => (
                      <option key={basis} value={basis}>
                        {basis === "PerSide" ? "Per Side" : "Total"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Gym Exercise Fields */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium mb-4">Gym Exercise Data</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sets
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={exerciseEntryForm.sets || ""}
                      onChange={(e) =>
                        setExerciseEntryForm({
                          ...exerciseEntryForm,
                          sets: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reps
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={exerciseEntryForm.reps || ""}
                      onChange={(e) =>
                        setExerciseEntryForm({
                          ...exerciseEntryForm,
                          reps: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Weight
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={exerciseEntryForm.weight_value || ""}
                      onChange={(e) =>
                        setExerciseEntryForm({
                          ...exerciseEntryForm,
                          weight_value: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weight Unit
                  </label>
                  <select
                    value={exerciseEntryForm.weight_unit || ""}
                    onChange={(e) =>
                      setExerciseEntryForm({
                        ...exerciseEntryForm,
                        weight_unit:
                          (e.target.value as keyof WeightUnit) || undefined,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select unit</option>
                    {WEIGHT_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cardio Exercise Fields */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium mb-4">
                  Cardio Exercise Data
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Time (seconds)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={exerciseEntryForm.time_seconds || ""}
                      onChange={(e) =>
                        setExerciseEntryForm({
                          ...exerciseEntryForm,
                          time_seconds: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Distance (meters)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={exerciseEntryForm.distance_meters || ""}
                      onChange={(e) =>
                        setExerciseEntryForm({
                          ...exerciseEntryForm,
                          distance_meters: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={exerciseEntryForm.notes || ""}
                  onChange={(e) =>
                    setExerciseEntryForm({
                      ...exerciseEntryForm,
                      notes: e.target.value,
                    })
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Add any notes about your workout..."
                />
              </div>

              <button
                type="submit"
                disabled={loading || !exerciseEntryForm.exercise_id}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Logging..." : "Log Exercise"}
              </button>
            </form>
          </div>
        )}

        {/* View All Tab */}
        {activeTab === "view-all" && (
          <div className="space-y-8">
            {/* Exercise Types */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold mb-6 font-serif">
                Exercise Types ({exerciseTypes.length})
              </h2>
              {exerciseTypes.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No exercise types found. Add some in the "Add Exercise Type"
                  tab.
                </p>
              ) : (
                <div className="grid gap-4">
                  {exerciseTypes.map((type) => (
                    <div
                      key={type._id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <h3 className="text-lg font-semibold mb-2">
                        {type.name}
                      </h3>
                      {type.primary_muscles.length > 0 && (
                        <p className="text-sm text-gray-600 mb-2">
                          <strong>Muscles:</strong>{" "}
                          {type.primary_muscles
                            .map(muscleToPascalCase)
                            .join(", ")}
                        </p>
                      )}
                      {type.aliases && type.aliases.length > 0 && (
                        <p className="text-sm text-gray-600 mb-2">
                          <strong>Aliases:</strong> {type.aliases.join(", ")}
                        </p>
                      )}
                      {type.default_load_basis && (
                        <p className="text-sm text-gray-600 mb-2">
                          <strong>Default Load Basis:</strong>{" "}
                          {type.default_load_basis === "PerSide"
                            ? "Per Side"
                            : "Total"}
                        </p>
                      )}
                      {type.guidance && type.guidance.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm font-medium text-gray-700 mb-1">
                            Guidance:
                          </p>
                          <ul className="text-sm text-gray-600 list-disc list-inside">
                            {type.guidance.map((tip, index) => (
                              <li key={`${type._id}-guidance-${index}`}>
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Exercise Entries */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold mb-2 font-serif">
                Exercise Logs ({exerciseEntries.length})
              </h2>
              <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
                <p>
                  <span className="text-green-600 font-semibold">
                    {exerciseEntries.filter((e) => e.tz).length} entries with
                    timezone
                  </span>
                  {" | "}
                  <span className="text-red-600 font-semibold">
                    {exerciseEntries.filter((e) => !e.tz).length} entries
                    without timezone
                  </span>
                </p>
              </div>
              {exerciseEntries.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No exercise entries found. Log some exercises in the "Log
                  Exercise" tab.
                </p>
              ) : (
                <div className="grid gap-4">
                  {exerciseEntries
                    .sort((a, b) => b.date_unix - a.date_unix)
                    .map((entry) => (
                      <div
                        key={entry._id}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-lg font-semibold">
                            {entry.exercise_label}
                          </h3>
                          <div className="text-right">
                            <span className="text-sm text-gray-500 block">
                              {formatDate(entry.date_unix)}
                            </span>
                            <span
                              className={`text-xs ${
                                entry.tz
                                  ? "text-green-600"
                                  : "text-red-600 font-semibold"
                              }`}
                            >
                              {entry.tz ? `🌍 ${entry.tz}` : "⚠️ No timezone"}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {entry.intensity && (
                            <p>
                              <strong>Intensity:</strong> {entry.intensity}/5
                            </p>
                          )}
                          {entry.load_basis && (
                            <p>
                              <strong>Load Basis:</strong>{" "}
                              {entry.load_basis === "PerSide"
                                ? "Per Side"
                                : "Total"}
                            </p>
                          )}
                          {entry.sets && (
                            <p>
                              <strong>Sets:</strong> {entry.sets}
                            </p>
                          )}
                          {entry.reps && (
                            <p>
                              <strong>Reps:</strong> {entry.reps}
                            </p>
                          )}
                          {entry.weight_value && (
                            <p>
                              <strong>Weight:</strong> {entry.weight_value}{" "}
                              {entry.weight_unit}
                            </p>
                          )}
                          {entry.time_seconds && (
                            <p>
                              <strong>Time:</strong>{" "}
                              {formatTime(entry.time_seconds)}
                            </p>
                          )}
                          {entry.distance_meters && (
                            <p>
                              <strong>Distance:</strong> {entry.distance_meters}
                              m
                            </p>
                          )}
                        </div>

                        {entry.notes && (
                          <p className="mt-2 text-sm text-gray-600">
                            <strong>Notes:</strong> {entry.notes}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
