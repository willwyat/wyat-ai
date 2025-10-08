import { ExerciseEntry } from "@/types/workout";
import WorkoutDisplayItem from "./WorkoutDisplayItem";

interface WorkoutDisplayProps {
  workouts: ExerciseEntry[];
  title?: string;
  showBorder?: boolean;
}

export default function WorkoutDisplay({
  workouts,
  title = "筋トレ",
}: WorkoutDisplayProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">
        {title} {workouts.length > 0 ? `(${workouts.length})` : ""}
      </h2>
      {workouts.length === 0 ? (
        <div className="h-24 flex flex-col items-center justify-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            この日は休みの日
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {workouts.map((workout, index) => {
            // Generate a safe key
            const key = workout._id
              ? typeof workout._id === "string"
                ? workout._id
                : JSON.stringify(workout._id)
              : `${workout.exercise_label}-${workout.date_unix}-${index}`;

            return <WorkoutDisplayItem key={key} workout={workout} />;
          })}
        </div>
      )}
    </div>
  );
}
