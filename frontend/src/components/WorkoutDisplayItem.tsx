const has = (v: unknown) => v !== null && v !== undefined;

const formatDistance = (meters?: number) => {
  if (!has(meters)) return "";
  const m = meters as number;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
};

const formatLocal = (unixSeconds?: number, tz?: string) => {
  if (!has(unixSeconds)) return "";
  try {
    const opts: Intl.DateTimeFormatOptions = {
      timeStyle: "short",
      timeZone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    return new Date((unixSeconds as number) * 1000).toLocaleTimeString(
      undefined,
      opts
    );
  } catch {
    return new Date((unixSeconds as number) * 1000).toLocaleTimeString();
  }
};
import { ExerciseEntry } from "@/types/workout";

interface WorkoutDisplayItemProps {
  workout: ExerciseEntry;
}

const formatTime = (seconds: number) => {
  // Round to nearest minute
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  } else {
    return "< 1m";
  }
};

// Helper function to get the appropriate icon based on exercise type
const getExerciseIcon = (exerciseLabel: string) => {
  const label = exerciseLabel.toLowerCase();

  if (label.includes("running") || label.includes("run")) {
    return { icon: "directions_run", className: "material-symbols-sharp" };
  } else if (
    label.includes("cycling") ||
    label.includes("cycle") ||
    label.includes("bike")
  ) {
    return { icon: "directions_bike", className: "material-symbols-outlined" };
  } else if (label.includes("meditation")) {
    return { icon: "self_improvement", className: "material-symbols-outlined" };
  } else if (label.includes("cold plunge")) {
    return { icon: "ac_unit", className: "material-symbols-sharp" };
  } else if (label.includes("walking")) {
    return { icon: "directions_walk", className: "material-symbols-outlined" };
  } else {
    return { icon: "fitness_center", className: "material-symbols-outlined" };
  }
};

const metaLine = (w: ExerciseEntry) => {
  const parts: string[] = [];
  if (has(w.time_seconds)) parts.push(formatTime(w.time_seconds!));
  if (has(w.distance_meters)) parts.push(formatDistance(w.distance_meters));
  // Removed intensity from meta line - now shown as stars
  if (has(w.sets) || has(w.reps)) {
    const sr = `${has(w.sets) ? w.sets : ""}${
      has(w.sets) && has(w.reps) ? "×" : ""
    }${has(w.reps) ? w.reps : ""}`;
    if (sr) parts.push(sr);
  }
  if (has(w.weight_value)) {
    const unit =
      (w.weight_unit as any) === "Kg"
        ? "kg"
        : (w.weight_unit as any) === "Lb"
        ? "lb"
        : w.weight_unit || "";
    const basis =
      w.load_basis && String(w.load_basis).toLowerCase() === "perside"
        ? " • per side"
        : "";
    parts.push(`${w.weight_value}${unit ? " " + unit : ""}${basis}`);
  }
  return parts.join(" • ");
};

// Helper to render star rating
const renderStars = (intensity: number) => {
  return (
    <div className="flex items-center gap-0.2">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`material-symbols-sharp !text-[15px] ${
            star <= intensity
              ? "text-gray-700 dark:text-gray-300"
              : "text-gray-300 dark:text-gray-700"
          }`}
          style={{
            fontVariationSettings: star <= intensity ? "'FILL' 1" : "'FILL' 0",
          }}
        >
          star
        </span>
      ))}
    </div>
  );
};

export default function WorkoutDisplayItem({
  workout,
}: WorkoutDisplayItemProps) {
  const { icon, className } = getExerciseIcon(workout.exercise_label);

  return (
    <div className="transition-colors border-t border-gray-100 dark:border-gray-800 py-4">
      <div className="flex items-center gap-4">
        <span
          className={`${className} !text-[24px] shrink-0 leading-none text-gray-700 dark:text-gray-400`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium truncate">
              {workout.exercise_label}
            </h3>
            {/* optional intensity stars */}
            {has(workout.intensity) && renderStars(workout.intensity!)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate tracking-wide">
            {metaLine(workout)}
            {workout.notes && (
              <span className="ml-1 text-gray-400 dark:text-gray-500">
                • {workout.notes}
              </span>
            )}
          </div>
        </div>
        {/* right-aligned timestamp */}
        <div className="ml-2 text-[10px] text-gray-400 shrink-0">
          {formatLocal(workout.date_unix, (workout as any).tz)}
        </div>
      </div>
    </div>
  );
}
