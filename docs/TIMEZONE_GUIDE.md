# Timezone-Aware Exercise Tracking Guide

## The Problem

As a global traveler moving between Hong Kong (UTC+8) and New York (UTC-5), you need your exercise logs to display correctly based on your current location. A workout at 10am in Hong Kong should appear under that day in Hong Kong, not shifted to a different day in UTC.

## The Solution

The `get_exercise_entries_by_day` endpoint now accepts an optional `tz_offset` parameter that allows you to query for entries based on your local timezone.

## API Usage

### Endpoint

```
GET /workout/exercise-entries/day/:date_unix?tz_offset=<minutes>
```

### Parameters

- **date_unix** (path, required): Any Unix timestamp on the day you want to query
- **tz_offset** (query, optional): Timezone offset in minutes from UTC
  - Positive for timezones east of UTC (e.g., `480` for Hong Kong UTC+8)
  - Negative for timezones west of UTC (e.g., `-300` for New York EST UTC-5)
  - Omit or use `0` for UTC

### Examples

**1. Get today's workouts in Hong Kong (UTC+8)**

```bash
curl "http://localhost:3001/workout/exercise-entries/day/$(date +%s)?tz_offset=480" \
  -H "x-wyat-api-key: your-key"
```

**2. Get today's workouts in New York (UTC-5 EST / UTC-4 EDT)**

```bash
# EST (winter)
curl "http://localhost:3001/workout/exercise-entries/day/$(date +%s)?tz_offset=-300" \
  -H "x-wyat-api-key: your-key"

# EDT (summer with DST)
curl "http://localhost:3001/workout/exercise-entries/day/$(date +%s)?tz_offset=-240" \
  -H "x-wyat-api-key: your-key"
```

**3. Get workouts for January 1, 2024 in UTC+8**

```bash
curl "http://localhost:3001/workout/exercise-entries/day/1704067200?tz_offset=480" \
  -H "x-wyat-api-key: your-key"
```

## Frontend Implementation

### Automatic Timezone Detection

Use JavaScript's built-in timezone detection:

```typescript
// Get timezone offset in minutes
// Note: getTimezoneOffset() returns the offset in the opposite direction
// (e.g., -480 for UTC+8), so we need to negate it
const getTimezoneOffsetMinutes = (): number => {
  return -new Date().getTimezoneOffset();
};

// Example usage
const tzOffset = getTimezoneOffsetMinutes();
// In Hong Kong: returns 480
// In New York EST: returns -300
// In New York EDT: returns -240
```

### Fetch Exercise Entries for a Day

```typescript
const fetchExerciseEntriesForDay = async (
  dateUnix: number,
  useLocalTimezone: boolean = true
): Promise<ExerciseEntry[]> => {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const API_KEY = process.env.NEXT_PUBLIC_WYAT_API_KEY || "";

  // Build URL with optional timezone parameter
  let url = `${API_URL}/workout/exercise-entries/day/${dateUnix}`;

  if (useLocalTimezone) {
    const tzOffset = -new Date().getTimezoneOffset();
    url += `?tz_offset=${tzOffset}`;
  }

  const response = await fetch(url, {
    headers: {
      "x-wyat-api-key": API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch exercise entries: ${response.statusText}`);
  }

  return response.json();
};

// Usage examples:

// Get today's workouts in your current timezone
const today = Math.floor(Date.now() / 1000);
const todaysWorkouts = await fetchExerciseEntriesForDay(today);

// Get workouts for a specific date in your current timezone
const jan1 = 1704067200; // Jan 1, 2024 00:00 UTC
const jan1Workouts = await fetchExerciseEntriesForDay(jan1);

// Get workouts in UTC (regardless of your location)
const utcWorkouts = await fetchExerciseEntriesForDay(today, false);
```

## Journal Integration Example

Here's how you might integrate this into your journal view:

```typescript
interface JournalDay {
  date: Date;
  exercises: ExerciseEntry[];
  // ... other journal fields
}

const fetchJournalDay = async (date: Date): Promise<JournalDay> => {
  // Convert date to Unix timestamp (midnight local time)
  const dateUnix = Math.floor(date.getTime() / 1000);

  // Fetch exercises for this day in user's current timezone
  const exercises = await fetchExerciseEntriesForDay(dateUnix, true);

  return {
    date,
    exercises,
    // ... fetch other journal data
  };
};

// Usage in a React component:
function JournalPage() {
  const [journalDay, setJournalDay] = useState<JournalDay | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    fetchJournalDay(selectedDate).then(setJournalDay);
  }, [selectedDate]);

  return (
    <div>
      <h1>Journal - {selectedDate.toLocaleDateString()}</h1>

      {journalDay?.exercises && journalDay.exercises.length > 0 && (
        <section>
          <h2>Today's Workouts</h2>
          {journalDay.exercises.map((exercise) => (
            <div key={exercise._id}>
              <h3>{exercise.exercise_label}</h3>
              <p>{new Date(exercise.date_unix * 1000).toLocaleTimeString()}</p>
              {/* ... render exercise details */}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
```

## Common Timezone Offsets

| Location    | Standard Time | DST Time    | Offset (minutes) |
| ----------- | ------------- | ----------- | ---------------- |
| Hong Kong   | UTC+8         | No DST      | 480              |
| Singapore   | UTC+8         | No DST      | 480              |
| Tokyo       | UTC+9         | No DST      | 540              |
| New York    | UTC-5 (EST)   | UTC-4 (EDT) | -300 / -240      |
| London      | UTC+0 (GMT)   | UTC+1 (BST) | 0 / 60           |
| Los Angeles | UTC-8 (PST)   | UTC-7 (PDT) | -480 / -420      |

## How It Works

### Backend Logic

1. **Receive Request**: Get timestamp (e.g., `1704085623`) and timezone offset (e.g., `480` for Hong Kong)

2. **Convert to Local Time**:

   ```
   local_time = timestamp + (offset_minutes * 60)
   ```

3. **Find Local Day Boundaries**:

   ```
   local_day_start = (local_time / 86400) * 86400
   ```

4. **Convert Back to UTC**:

   ```
   utc_day_start = local_day_start - (offset_minutes * 60)
   utc_day_end = utc_day_start + 86400 - 1
   ```

5. **Query Database**: Find all entries where `date_unix` is between `utc_day_start` and `utc_day_end`

### Example Calculation

**Scenario**: You're in Hong Kong (UTC+8) at 11pm on January 1, 2024, and you want to see all your workouts for January 1st.

1. Your current time: `2024-01-01 23:00 HKT` = `1704121200 Unix` = `2024-01-01 15:00 UTC`
2. Timezone offset: `480` minutes (UTC+8)
3. Convert to local time: `1704121200 + (480 * 60) = 1704150000`
4. Find start of day: `(1704150000 / 86400) * 86400 = 1704124800` (local midnight)
5. Convert back to UTC: `1704124800 - (480 * 60) = 1704096000` = `2024-01-01 00:00 UTC` (which is `2024-01-01 08:00 HKT` - wait, this doesn't look right...)

Actually, let me recalculate:

- Jan 1, 2024 00:00 HKT = Dec 31, 2023 16:00 UTC = `1704038400`
- Jan 1, 2024 23:59 HKT = Dec 31, 2023 15:59 UTC + 24h = `1704124799`

So the query will fetch all entries with timestamps between `1704038400` and `1704124799`, which corresponds to Jan 1 in Hong Kong time.

## Best Practices

1. **Always Use User's Current Timezone**: Let JavaScript automatically detect it
2. **Store in UTC**: Always save timestamps in UTC (already done!)
3. **Display in Local Time**: Convert for display using `toLocaleString()`
4. **Handle DST**: The browser automatically handles daylight saving time
5. **Be Consistent**: Use the same timezone approach across your journal

## Testing

Use the provided test script:

```bash
# Test in your current timezone
./backend/tests/test_get_entries_by_day.sh $(date +%s) $(node -e "console.log(-new Date().getTimezoneOffset())")

# Test in Hong Kong time
./backend/tests/test_get_entries_by_day.sh 1704067200 480

# Test in New York time (EST)
./backend/tests/test_get_entries_by_day.sh 1704067200 -300
```

## Migration Notes

- **Backward Compatible**: The `tz_offset` parameter is optional
- **No Schema Changes**: Your data stays in UTC (no migration needed)
- **Frontend Only**: Just update your frontend to pass the timezone offset
- **Old Queries Still Work**: Omitting `tz_offset` defaults to UTC behavior

