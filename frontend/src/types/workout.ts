export type ExerciseEntry = {
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
  weight_unit?: "Kg" | "Lb";
  load_basis?: "PerSide" | "Total";
  time_seconds?: number;
  distance_meters?: number;
};
