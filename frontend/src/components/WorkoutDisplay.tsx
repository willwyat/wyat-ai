import { ExerciseEntry } from "@/types/workout";

interface WorkoutDisplayProps {
  workouts: ExerciseEntry[];
  title?: string;
  showBorder?: boolean;
}

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

export default function WorkoutDisplay({
  workouts,
  title = "Workouts",
}: WorkoutDisplayProps) {
  if (workouts.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">
        {title} ({workouts.length})
      </h2>
      <div className="flex flex-col gap-4">
        {workouts.map((workout) => (
          <div
            key={workout._id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
          >
            <h3 className="text-lg font-semibold mb-2">
              {workout.exercise_label}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
              {workout.intensity && (
                <p>
                  <strong>Intensity:</strong> {workout.intensity}/5
                </p>
              )}
              {workout.sets && (
                <p>
                  <strong>Sets:</strong> {workout.sets}
                </p>
              )}
              {workout.reps && (
                <p>
                  <strong>Reps:</strong> {workout.reps}
                </p>
              )}
              {workout.weight_value && (
                <p>
                  <strong>Weight:</strong> {workout.weight_value}{" "}
                  {workout.weight_unit}
                  {workout.load_basis && (
                    <span className="text-xs ml-1">
                      ({workout.load_basis === "PerSide" ? "per side" : "total"}
                      )
                    </span>
                  )}
                </p>
              )}
              {workout.time_seconds && (
                <p>
                  <strong>Time:</strong> {formatTime(workout.time_seconds)}
                </p>
              )}
              {workout.distance_meters && (
                <p>
                  <strong>Distance:</strong> {workout.distance_meters}m
                </p>
              )}
            </div>
            {workout.notes && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                <strong>Notes:</strong> {workout.notes}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
