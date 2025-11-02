#!/bin/bash

# Test script for getting exercise entries by day with timezone support
# Usage: ./test_get_entries_by_day.sh [date_unix] [timezone]
# 
# Examples:
#   ./test_get_entries_by_day.sh                              # Today in UTC
#   ./test_get_entries_by_day.sh 1704067200                   # Specific date in UTC
#   ./test_get_entries_by_day.sh 1704067200 Asia/Hong_Kong   # Specific date in Hong Kong
#   ./test_get_entries_by_day.sh $(date +%s) America/New_York # Today in New York

API_KEY="${WYAT_API_KEY:-your-api-key-here}"
BASE_URL="${BASE_URL:-http://localhost:3001}"

# Use provided date or today's date
if [ -z "$1" ]; then
    DATE_UNIX=$(date +%s)
else
    DATE_UNIX=$1
fi

# IANA timezone (optional)
TZ_NAME=${2:-UTC}

# Build URL with optional timezone parameter
if [ "$TZ_NAME" = "UTC" ]; then
    URL="${BASE_URL}/workout/exercise-entries/day/${DATE_UNIX}"
else
    URL="${BASE_URL}/workout/exercise-entries/day/${DATE_UNIX}?tz=${TZ_NAME}"
fi

echo "🌍 Testing GET /workout/exercise-entries/day/$DATE_UNIX?tz=${TZ_NAME}"
echo "Date: $(date -r $DATE_UNIX '+%Y-%m-%d %H:%M:%S')"
echo "Timezone: ${TZ_NAME}"
echo ""

curl -X GET \
  "$URL" \
  -H "x-wyat-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  | jq '.'

echo ""
echo "✅ Test complete!"

