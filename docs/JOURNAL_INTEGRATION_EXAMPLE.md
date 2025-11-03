# Journal Integration Example with Timezone-Aware Exercises

This example shows how to integrate timezone-aware exercise tracking into your journal.

## Quick Integration

### 1. Import the utilities

```typescript
import {
  fetchExerciseEntriesForDate,
  fetchTodaysExercises,
  getTimezoneName,
  formatUnixTimestamp,
} from "@/lib/timezone-utils";
```

### 2. Fetch exercises for a journal entry

```typescript
// In your journal page component
const [exercises, setExercises] = useState([]);
const [journalDate, setJournalDate] = useState(new Date());

useEffect(() => {
  // Fetch exercises for the selected date
  fetchExerciseEntriesForDate(journalDate)
    .then(setExercises)
    .catch((err) => console.error("Failed to fetch exercises:", err));
}, [journalDate]);
```

### 3. Display exercises in your journal

```tsx
{
  exercises.length > 0 && (
    <section className="journal-exercises">
      <h2>Workouts for {journalDate.toLocaleDateString()}</h2>
      <p className="text-sm text-gray-500">
        Showing workouts in {getTimezoneName()}
      </p>

      {exercises.map((exercise) => (
        <div key={exercise._id} className="exercise-entry">
          <h3>{exercise.exercise_label}</h3>
          <p className="time">{formatUnixTimestamp(exercise.date_unix)}</p>

          {/* Display exercise details */}
          {exercise.sets && (
            <p>
              Sets: {exercise.sets} × {exercise.reps} reps
            </p>
          )}
          {exercise.weight_value && (
            <p>
              Weight: {exercise.weight_value} {exercise.weight_unit}
              {exercise.load_basis && ` (${exercise.load_basis})`}
            </p>
          )}
          {exercise.time_seconds && (
            <p>Duration: {formatDuration(exercise.time_seconds)}</p>
          )}
          {exercise.distance_meters && (
            <p>Distance: {(exercise.distance_meters / 1000).toFixed(2)} km</p>
          )}
          {exercise.intensity && <p>Intensity: {exercise.intensity}/5</p>}
          {exercise.notes && <p className="notes">{exercise.notes}</p>}
        </div>
      ))}
    </section>
  );
}
```

## Full Example: Enhanced Journal Page

Here's a complete example of a journal page component with exercise integration:

```typescript
"use client";

import { useState, useEffect } from "react";
import {
  fetchExerciseEntriesForDate,
  getTimezoneName,
  formatUnixTimestamp,
} from "@/lib/timezone-utils";

interface ExerciseEntry {
  _id: string;
  exercise_label: string;
  date_unix: number;
  intensity?: number;
  notes?: string;
  sets?: number;
  reps?: number;
  weight_value?: number;
  weight_unit?: "kg" | "lb";
  load_basis?: "per_side" | "total";
  time_seconds?: number;
  distance_meters?: number;
}

export default function JournalPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch exercises when date changes
  useEffect(() => {
    const loadExercises = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchExerciseEntriesForDate(selectedDate);
        setExercises(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load exercises"
        );
      } finally {
        setLoading(false);
      }
    };

    loadExercises();
  }, [selectedDate]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="journal-page">
      <div className="header">
        <h1>Journal</h1>

        {/* Date picker */}
        <input
          type="date"
          value={selectedDate.toISOString().split("T")[0]}
          onChange={(e) => setSelectedDate(new Date(e.target.value))}
          className="date-picker"
        />

        <p className="timezone-info">
          Viewing in {getTimezoneName()} •{" "}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
      </div>

      {/* Your existing journal content here */}
      <section className="journal-content">
        {/* ... your journal text, photos, etc. ... */}
      </section>

      {/* Exercise section */}
      <section className="journal-exercises">
        <h2>Workouts</h2>

        {loading && <p>Loading exercises...</p>}

        {error && (
          <div className="error-message">
            <p>Error: {error}</p>
          </div>
        )}

        {!loading && !error && exercises.length === 0 && (
          <p className="no-exercises">No workouts logged for this day.</p>
        )}

        {!loading && exercises.length > 0 && (
          <div className="exercises-list">
            {exercises.map((exercise) => (
              <div key={exercise._id} className="exercise-card">
                <div className="exercise-header">
                  <h3>{exercise.exercise_label}</h3>
                  <time>{formatUnixTimestamp(exercise.date_unix)}</time>
                </div>

                <div className="exercise-details">
                  {/* Gym exercise data */}
                  {(exercise.sets ||
                    exercise.reps ||
                    exercise.weight_value) && (
                    <div className="gym-data">
                      {exercise.sets && exercise.reps && (
                        <span className="metric">
                          {exercise.sets} × {exercise.reps} reps
                        </span>
                      )}
                      {exercise.weight_value && (
                        <span className="metric">
                          {exercise.weight_value} {exercise.weight_unit}
                          {exercise.load_basis === "per_side" && " per side"}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Cardio exercise data */}
                  {(exercise.time_seconds || exercise.distance_meters) && (
                    <div className="cardio-data">
                      {exercise.time_seconds && (
                        <span className="metric">
                          ⏱️ {formatDuration(exercise.time_seconds)}
                        </span>
                      )}
                      {exercise.distance_meters && (
                        <span className="metric">
                          📍 {(exercise.distance_meters / 1000).toFixed(2)} km
                        </span>
                      )}
                    </div>
                  )}

                  {/* Intensity */}
                  {exercise.intensity && (
                    <div className="intensity">
                      <span className="label">Intensity:</span>
                      <div className="intensity-bar">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className={`bar ${
                              i < exercise.intensity! ? "filled" : ""
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {exercise.notes && <p className="notes">{exercise.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

## CSS Styling Example

```css
.journal-exercises {
  margin-top: 2rem;
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.timezone-info {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.5rem;
}

.exercises-list {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
}

.exercise-card {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  transition: box-shadow 0.2s;
}

.exercise-card:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.exercise-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.exercise-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.exercise-header time {
  font-size: 0.875rem;
  color: #6b7280;
}

.exercise-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.gym-data,
.cardio-data {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.metric {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}

.intensity {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.intensity-bar {
  display: flex;
  gap: 2px;
}

.intensity-bar .bar {
  width: 20px;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
}

.intensity-bar .bar.filled {
  background: #3b82f6;
}

.notes {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: #f9fafb;
  border-left: 3px solid #3b82f6;
  border-radius: 4px;
  font-size: 0.875rem;
  color: #374151;
}

.no-exercises {
  text-align: center;
  padding: 2rem;
  color: #9ca3af;
  font-style: italic;
}

.error-message {
  padding: 1rem;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #dc2626;
}
```

## Benefits for Global Travel

1. **Automatic Timezone Detection**: No manual configuration needed
2. **Consistent Experience**: Your journal always shows workouts for "your day"
3. **Historical Accuracy**: Past entries are displayed in the timezone where they were logged
4. **Cross-timezone Queries**: Can view workouts from when you were in different locations

## Travel Scenarios

### Scenario 1: Logging a workout in Hong Kong

- You're in Hong Kong (UTC+8)
- You log a workout at 9am local time
- It's stored as UTC timestamp
- When viewing your journal, it appears under "today" in Hong Kong time

### Scenario 2: Viewing past workouts after traveling

- You fly from Hong Kong to New York
- You open your journal to view yesterday's workout
- The system automatically shows it in your current New York timezone
- The workout still appears under the correct date relative to when you logged it

### Scenario 3: Multi-day travel

- Day 1: Workout in Hong Kong at 10am
- Day 2: Fly to New York, workout at 6pm
- Your journal shows both workouts under their respective days
- Times are displayed consistently in your current timezone for easy reference

