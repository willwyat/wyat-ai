import { create } from "zustand";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

// Types for different vitals data
export interface DailyReadinessData {
  day: string;
  score: number;
  temperature_deviation: number;
  temperature_trend: string;
  timestamp: string;
}

export interface DailyActivityData {
  day: string;
  score: number;
  steps: number;
  equivalent_walking_distance: number;
  high_activity_time: number;
  medium_activity_time: number;
  low_activity_time: number;
  inactive_time: number;
  average_met: number;
  cal_active: number;
  cal_total: number;
  class_5min: string[];
  daily_movement: number;
  non_wear_time: number;
  rest_mode: boolean;
  timestamp: string;
}

export interface DailyStressData {
  day: string;
  score: number;
  rest_stress_duration: number;
  activity_stress_duration: number;
  low_stress_duration: number;
  medium_stress_duration: number;
  high_stress_duration: number;
  stress_duration: number;
  average_stress: number;
  timestamp: string;
}

export interface DailySpO2Data {
  day: string;
  average_spo2: number;
  lowest_spo2: number;
  timestamp: string;
}

export interface DailyCardiovascularAgeData {
  day: string;
  cardiovascular_age: number;
  biological_age: number;
  timestamp: string;
}

export interface DailyResilienceData {
  day: string;
  score: number;
  timestamp: string;
}

export interface VO2MaxData {
  day: string;
  vo2_max: number;
  timestamp: string;
}

export interface DailySleepData {
  day: string;
  score: number;
  deep_sleep_duration: number;
  rem_sleep_duration: number;
  light_sleep_duration: number;
  awake_duration: number;
  total_sleep_duration: number;
  sleep_efficiency: number;
  latency: number;
  bedtime_start: string;
  bedtime_end: string;
  timestamp: string;
}

export interface DailyVitals {
  day: string;
  readiness: DailyReadinessData | null;
  activity: DailyActivityData | null;
  sleep: DailySleepData | null;
  resilience: DailyResilienceData | null;
  stress: DailyStressData | null;
  spo2: DailySpO2Data | null;
  cardiovascular_age: DailyCardiovascularAgeData | null;
  vo2_max: VO2MaxData | null;
}

interface VitalsState {
  vitals: DailyVitals[];
  loading: boolean;
  error: string | null;
  selectedDate: string;

  // Actions
  fetchVitalsForDate: (date: string) => Promise<void>;
  setSelectedDate: (date: string) => void;
  clearError: () => void;
}

// Helper to get unix timestamps for the last 7 days (including today)
export function getLast7Days() {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    days.push({
      label: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        weekday: "short",
      }),
      date: d.toISOString().slice(0, 10),
      unix: Math.floor(d.getTime() / 1000),
    });
  }
  return days;
}

export const useVitalsStore = create<VitalsState>((set, get) => ({
  vitals: [],
  loading: false,
  error: null,
  selectedDate: new Date().toISOString().split("T")[0],

  fetchVitalsForDate: async (date: string) => {
    set({ loading: true, error: null });
    try {
      console.log("Vitals store fetching for date:", date);
      // Use the date directly instead of searching in getLast7Days
      const selected = { date };

      // Fetch all endpoints in parallel
      const endpoints = [
        {
          name: "readiness",
          url: `${API_URL}/vitals/readiness?date=${selected.date}`,
        },
        {
          name: "activity",
          url: `${API_URL}/vitals/activity?date=${selected.date}`,
        },
        {
          name: "sleep",
          url: `${API_URL}/vitals/sleep?date=${selected.date}`,
        },
        {
          name: "stress",
          url: `${API_URL}/vitals/stress?date=${selected.date}`,
        },
        {
          name: "spo2",
          url: `${API_URL}/vitals/spo2?date=${selected.date}`,
        },
        {
          name: "cardiovascular_age",
          url: `${API_URL}/vitals/cardiovascular-age?date=${selected.date}`,
        },
        {
          name: "resilience",
          url: `${API_URL}/vitals/resilience?date=${selected.date}`,
        },
        {
          name: "vo2_max",
          url: `${API_URL}/vitals/vo2-max?date=${selected.date}`,
        },
      ];

      const fetchPromises = endpoints.map((endpoint) =>
        fetch(endpoint.url, {
          headers: {
            "x-wyat-api-key": WYAT_API_KEY,
          },
        })
          .then((res) => {
            if (!res.ok) throw new Error(`Failed to fetch ${endpoint.name}`);
            return res.json();
          })
          .then((data) => ({
            name: endpoint.name,
            data: data.length > 0 ? data[0] : null,
          }))
          .catch((err) => ({
            name: endpoint.name,
            data: null,
            error: err.message,
          }))
      );

      const results = await Promise.all(fetchPromises);
      console.log("Fetched all vitals data:", results);
      console.log(
        "Readiness data:",
        results.find((r) => r.name === "readiness")?.data
      );

      // Create vitals object with all the data
      const vitalsData: DailyVitals = {
        day: selected.date,
        readiness: null,
        activity: null,
        sleep: null, // Not implemented yet
        resilience: null,
        stress: null,
        spo2: null,
        cardiovascular_age: null,
        vo2_max: null,
      };

      // Map the results to the vitals object
      results.forEach((result) => {
        if (result.name === "readiness") vitalsData.readiness = result.data;
        if (result.name === "activity") vitalsData.activity = result.data;
        if (result.name === "sleep") vitalsData.sleep = result.data;
        if (result.name === "stress") vitalsData.stress = result.data;
        if (result.name === "spo2") vitalsData.spo2 = result.data;
        if (result.name === "cardiovascular_age")
          vitalsData.cardiovascular_age = result.data;
        if (result.name === "resilience") vitalsData.resilience = result.data;
        if (result.name === "vo2_max") vitalsData.vo2_max = result.data;
      });

      set({ vitals: [vitalsData], loading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Failed to fetch vitals",
        loading: false,
      });
    }
  },

  setSelectedDate: (date: string) => {
    set({ selectedDate: date });
  },

  clearError: () => {
    set({ error: null });
  },
}));
