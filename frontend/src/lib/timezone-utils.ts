/**
 * Timezone utilities for handling exercise entries across different timezones
 *
 * These utilities help you fetch exercise data in your current timezone,
 * which is especially useful when traveling between Hong Kong, New York, etc.
 */

import { API_URL, WYAT_API_KEY } from "./config";

/**
 * Get the current timezone offset in minutes from UTC
 * Positive for east of UTC (e.g., 480 for Hong Kong UTC+8)
 * Negative for west of UTC (e.g., -300 for New York EST)
 *
 * Note: JavaScript's getTimezoneOffset() returns the opposite sign,
 * so we negate it to match standard timezone notation
 *
 * @deprecated Use getTimezoneIdentifier() instead for IANA timezone names
 */
export const getTimezoneOffsetMinutes = (): number => {
  return -new Date().getTimezoneOffset();
};

/**
 * Get timezone name in a human-readable format
 * Examples: "UTC+8", "UTC-5", "UTC"
 */
export const getTimezoneName = (): string => {
  const offset = getTimezoneOffsetMinutes();
  if (offset === 0) return "UTC";
  const hours = Math.abs(offset / 60);
  const sign = offset > 0 ? "+" : "-";
  return `UTC${sign}${hours}`;
};

/**
 * Get the full timezone identifier
 * Examples: "Asia/Hong_Kong", "America/New_York"
 */
export const getTimezoneIdentifier = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

/**
 * Fetch exercise entries for a specific day
 *
 * @param dateUnix - Unix timestamp (any time on the target day)
 * @param useLocalTimezone - If true, fetches entries for the day in your current timezone
 *                           If false, fetches entries for the day in UTC
 * @returns Array of exercise entries
 */
export const fetchExerciseEntriesForDay = async (
  dateUnix: number,
  useLocalTimezone: boolean = true
): Promise<any[]> => {
  // Build URL with optional timezone parameter
  let url = `${API_URL}/workout/exercise-entries/day/${dateUnix}`;

  if (useLocalTimezone) {
    const tz = getTimezoneIdentifier();
    url += `?tz=${encodeURIComponent(tz)}`;
  }

  const response = await fetch(url, {
    headers: {
      "x-wyat-api-key": WYAT_API_KEY,
    },
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(
      errorData.error ||
        `Failed to fetch exercise entries: ${response.statusText}`
    );
  }

  return response.json();
};

/**
 * Fetch exercise entries for today in your current timezone
 */
export const fetchTodaysExercises = async (): Promise<any[]> => {
  const now = Math.floor(Date.now() / 1000);
  return fetchExerciseEntriesForDay(now, true);
};

/**
 * Fetch exercise entries for a specific JavaScript Date in your current timezone
 *
 * @param date - JavaScript Date object
 * @returns Array of exercise entries for that day in your current timezone
 */
export const fetchExerciseEntriesForDate = async (
  date: Date
): Promise<any[]> => {
  const dateUnix = Math.floor(date.getTime() / 1000);
  return fetchExerciseEntriesForDay(dateUnix, true);
};

/**
 * Convert a Unix timestamp to a local date string
 *
 * @param unixTimestamp - Unix timestamp in seconds
 * @param includeTime - Whether to include time in the output
 * @returns Formatted date string in local timezone
 */
export const formatUnixTimestamp = (
  unixTimestamp: number,
  includeTime: boolean = true
): string => {
  const date = new Date(unixTimestamp * 1000);

  if (includeTime) {
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Get the start of day (midnight) for a given date in Unix timestamp
 * This is useful for creating date pickers that align with day boundaries
 *
 * @param date - JavaScript Date object
 * @returns Unix timestamp of midnight on that day in local timezone
 */
export const getStartOfDayUnix = (date: Date): number => {
  const localMidnight = new Date(date);
  localMidnight.setHours(0, 0, 0, 0);
  return Math.floor(localMidnight.getTime() / 1000);
};

/**
 * Get the end of day (23:59:59) for a given date in Unix timestamp
 *
 * @param date - JavaScript Date object
 * @returns Unix timestamp of 23:59:59 on that day in local timezone
 */
export const getEndOfDayUnix = (date: Date): number => {
  const localEndOfDay = new Date(date);
  localEndOfDay.setHours(23, 59, 59, 999);
  return Math.floor(localEndOfDay.getTime() / 1000);
};

/**
 * Debug helper: Log timezone information
 * Useful for troubleshooting timezone issues
 */
export const logTimezoneInfo = () => {
  console.log("=== Timezone Information ===");
  console.log("Timezone:", getTimezoneIdentifier());
  console.log("Offset (minutes):", getTimezoneOffsetMinutes());
  console.log("Offset (name):", getTimezoneName());
  console.log("Current time (UTC):", new Date().toISOString());
  console.log("Current time (local):", new Date().toLocaleString());
  console.log("Current Unix:", Math.floor(Date.now() / 1000));
  console.log("==========================");
};
