# Timezone Support Implementation Summary

## ✅ What Was Implemented

### 1. Database Schema Changes

**ExerciseEntry** now includes:

```rust
pub tz: Option<String>  // IANA timezone (e.g., "America/New_York")
```

- Field is optional for backward compatibility
- Defaults to "UTC" if not provided
- Stores IANA timezone names (e.g., "Asia/Hong_Kong", "America/New_York")

### 2. Backend Changes

#### Modified Structs

- `ExerciseEntry` - Added `tz: Option<String>` field
- `ExerciseEntryInput` - Added `tz: Option<String>` field
- `ExerciseEntryPatch` - Added `tz: Option<String>` field

#### Updated Functions

- `create_exercise_entry()` - Captures timezone, defaults to "UTC"
- `create_exercise_entry_mongo()` - Captures timezone, defaults to "UTC"
- `update_exercise_entry()` - Can update timezone
- `update_exercise_entry_mongo()` - Can update timezone
- `get_exercise_entries_by_day()` - **Completely rewritten** to use `chrono-tz`

#### New Dependencies

- Added `chrono-tz = "0.8"` to Cargo.toml

### 3. Query API Changes

**Old API (deprecated but still works):**

```
GET /workout/exercise-entries/day/:date_unix?tz_offset=480
```

**New API (recommended):**

```
GET /workout/exercise-entries/day/:date_unix?tz=Asia/Hong_Kong
```

### 4. How It Works

When you query for entries on a specific day:

1. **Input**: Unix timestamp + IANA timezone
2. **Parse**: Convert timezone string to `chrono_tz::Tz` object
3. **Convert**: Transform Unix timestamp to DateTime in that timezone
4. **Calculate**: Find 00:00:00 and 23:59:59 boundaries in local time
5. **Query**: Convert back to UTC and query database
6. **Debug**: Log all conversions for troubleshooting

**Example:**

```
Input: timestamp=1704085623 (2024-01-01 15:00 UTC), tz=Asia/Hong_Kong
Local time: 2024-01-01 23:00 HKT
Day boundaries: 2024-01-01 00:00 to 23:59 HKT
UTC query range: 2023-12-31 16:00 to 2024-01-01 15:59 UTC
Result: All entries that fall within Jan 1 in Hong Kong time
```

### 5. Backward Compatibility

✅ Existing entries without `tz` field work fine (assumed UTC)
✅ Old offset-based queries still work (though deprecated)
✅ No database migration needed
✅ Gradual adoption - new entries get timezone, old ones stay the same

### 6. Frontend Integration

Updated `timezone-utils.ts`:

- Now uses IANA timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Automatically detects user's timezone (e.g., "America/New_York")
- Sends timezone with each query
- Deprecated `getTimezoneOffsetMinutes()` in favor of `getTimezoneIdentifier()`

## 📝 API Examples

### Create Exercise with Timezone

```bash
curl -X POST http://localhost:3001/workout/exercise-entries \
  -H "x-wyat-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "exercise_id": "507f1f77bcf86cd799439011",
    "date_unix": 1704085623,
    "tz": "Asia/Hong_Kong",
    "sets": 3,
    "reps": 10,
    "weight_value": 100,
    "weight_unit": "kg"
  }'
```

### Query by Day in Hong Kong Time

```bash
curl "http://localhost:3001/workout/exercise-entries/day/1704067200?tz=Asia/Hong_Kong" \
  -H "x-wyat-api-key: $API_KEY"
```

### Query by Day in New York Time

```bash
curl "http://localhost:3001/workout/exercise-entries/day/1704067200?tz=America/New_York" \
  -H "x-wyat-api-key: $API_KEY"
```

### Query by Day in UTC (default)

```bash
curl "http://localhost:3001/workout/exercise-entries/day/1704067200" \
  -H "x-wyat-api-key: $API_KEY"
```

## 🌍 Supported Timezones

Any IANA timezone is supported, including:

### Asia

- `Asia/Hong_Kong` - Hong Kong Time (HKT, UTC+8)
- `Asia/Shanghai` - China Standard Time (CST, UTC+8)
- `Asia/Tokyo` - Japan Standard Time (JST, UTC+9)
- `Asia/Singapore` - Singapore Time (SGT, UTC+8)
- `Asia/Dubai` - Gulf Standard Time (GST, UTC+4)

### Americas

- `America/New_York` - Eastern Time (ET, UTC-5/-4 with DST)
- `America/Los_Angeles` - Pacific Time (PT, UTC-8/-7 with DST)
- `America/Chicago` - Central Time (CT, UTC-6/-5 with DST)
- `America/Toronto` - Eastern Time (ET, UTC-5/-4 with DST)
- `America/Vancouver` - Pacific Time (PT, UTC-8/-7 with DST)

### Europe

- `Europe/London` - Greenwich Mean Time/British Summer Time (GMT/BST, UTC+0/+1)
- `Europe/Paris` - Central European Time (CET, UTC+1/+2)
- `Europe/Berlin` - Central European Time (CET, UTC+1/+2)
- `Europe/Zurich` - Central European Time (CET, UTC+1/+2)

### Pacific

- `Pacific/Auckland` - New Zealand Time (NZST, UTC+12/+13)
- `Australia/Sydney` - Australian Eastern Time (AEST, UTC+10/+11)
- `Pacific/Fiji` - Fiji Time (FJT, UTC+12/+13)

[Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones]

## 🐛 Debug Logging

The backend logs timezone conversions to stderr for debugging:

```
🌍 Timezone query debug:
  Input timestamp: 1704085623 (2024-01-01 15:00:00 UTC)
  Requested timezone: Asia/Hong_Kong
  Local date: 2024-01-01 23:00:00 HKT
  Local day start: 2024-01-01 00:00:00 HKT
  Local day end: 2024-01-01 23:59:59 HKT
  UTC range: 1704038400 to 1704124799 (2023-12-31 16:00:00 UTC to 2024-01-01 15:59:59 UTC)
  Found 3 entries
```

## 🚀 Testing

### Test Script

```bash
# Test in Hong Kong
./backend/tests/test_get_entries_by_day.sh $(date +%s) Asia/Hong_Kong

# Test in New York
./backend/tests/test_get_entries_by_day.sh $(date +%s) America/New_York

# Test in UTC
./backend/tests/test_get_entries_by_day.sh $(date +%s)
```

### Frontend Usage

```typescript
import { fetchExerciseEntriesForDate } from "@/lib/timezone-utils";

// Automatically uses user's current timezone
const exercises = await fetchExerciseEntriesForDate(new Date("2024-01-01"));

// Will fetch entries for Jan 1 in the user's timezone
// If in Hong Kong: Jan 1 00:00-23:59 HKT
// If in New York: Jan 1 00:00-23:59 EST
```

## ✨ Benefits Over Offset-Based Approach

1. **DST Handling**: Automatically handles daylight saving time
2. **Historical Accuracy**: Correctly interprets past dates with old DST rules
3. **Industry Standard**: Uses IANA timezone database (same as every major system)
4. **Future Proof**: Handles timezone rule changes automatically
5. **Human Readable**: "America/New_York" is clearer than "-300 minutes"

## 📋 Migration Notes

### For Existing Data

- No migration needed
- Entries without `tz` field are treated as UTC
- They will continue to work correctly

### For New Features

- Always pass timezone when creating entries
- Frontend automatically detects and sends timezone
- Queries automatically use user's current timezone

### Gradual Adoption

1. Deploy backend (backward compatible)
2. Update frontend to send timezone on new entries
3. Old entries stay as-is (no migration needed)
4. Future queries use timezone-aware logic

## 🔒 Validation

The backend validates timezone strings:

- Must be valid IANA timezone name
- Returns 400 error with helpful message if invalid
- Suggests correct format in error message

Example error:

```json
{
  "error": "Invalid timezone: New_York. Use IANA timezone names like 'America/New_York' or 'Asia/Hong_Kong'"
}
```

## 🎯 Common Use Cases

### Scenario 1: Logging Workout While Traveling

```typescript
// User is in Hong Kong
// Browser detects: Asia/Hong_Kong
// Exercise logged at 9am local time
// Stored as: timestamp=1704157200, tz="Asia/Hong_Kong"
// When querying: Shows up under correct date in any timezone
```

### Scenario 2: Viewing Past Workouts

```typescript
// You logged workout in Hong Kong last week
// Now you're in New York
// Query for that date: Uses New York timezone for display
// But finds all entries that match that calendar date
```

### Scenario 3: Multi-City Trip

```typescript
// Day 1: Workout in Hong Kong (tz="Asia/Hong_Kong")
// Day 2: Workout in Dubai (tz="Asia/Dubai")
// Day 3: Workout in London (tz="Europe/London")
// Each shows up correctly under its date, regardless of where you view it from
```

## 🧪 Test Cases to Verify

1. ✅ Create entry without timezone → defaults to UTC
2. ✅ Create entry with timezone → stores timezone
3. ✅ Query without tz param → uses UTC day boundaries
4. ✅ Query with tz param → uses local day boundaries
5. ✅ Query with invalid timezone → returns 400 error
6. ✅ DST transition days work correctly
7. ✅ Historical dates with old DST rules work
8. ✅ Entries near midnight appear in correct day
9. ✅ Cross-timezone travel scenario works
10. ✅ Backward compatibility with old entries

## 📚 Additional Resources

- IANA Timezone Database: https://www.iana.org/time-zones
- chrono-tz documentation: https://docs.rs/chrono-tz/latest/chrono_tz/
- List of timezone names: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

