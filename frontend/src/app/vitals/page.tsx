"use client";
import { WYAT_API_KEY } from "@/lib/config";
import React, { useEffect, useState } from "react";

// Helper to get unix timestamps for the last 7 days (including today)
function getLast7Days() {
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

interface DailyVitals {
  day: string;
  activity?: any;
  sleep?: any;
  readiness?: any;
  resilience?: any;
  stress?: any;
  spo2?: any;
  cardiovascular_age?: any;
  vo2_max?: any;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const VitalsPage: React.FC = () => {
  const [vitals, setVitals] = useState<DailyVitals[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"daily" | "trends">("daily");
  const last7Days = getLast7Days();
  const [selectedDay, setSelectedDay] = useState(last7Days[6].date); // default to today

  // Fetch all vitals data for the selected day
  useEffect(() => {
    console.log("useEffect is running selectedDay:", selectedDay);
    const selected = last7Days.find((d) => d.date === selectedDay);
    if (!selected) return;
    setLoading(true);
    setError(null);

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
      { name: "stress", url: `${API_URL}/vitals/stress?date=${selected.date}` },
      { name: "spo2", url: `${API_URL}/vitals/spo2?date=${selected.date}` },
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

    Promise.all(fetchPromises)
      .then((results) => {
        console.log("Fetched all vitals data:", results);

        // Create vitals object with all the data
        const vitalsData = {
          day: selectedDay,
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
          if (result.name === "stress") vitalsData.stress = result.data;
          if (result.name === "spo2") vitalsData.spo2 = result.data;
          if (result.name === "cardiovascular_age")
            vitalsData.cardiovascular_age = result.data;
          if (result.name === "resilience") vitalsData.resilience = result.data;
          if (result.name === "vo2_max") vitalsData.vo2_max = result.data;
        });

        setVitals([vitalsData]);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
    // eslint-disable-next-line
  }, [selectedDay]);

  // Debug: log selectedDay and vitals[0].day
  console.log("selectedDay:", selectedDay, typeof selectedDay);
  console.log("vitals[0].day:", vitals[0]?.day, typeof vitals[0]?.day);
  console.log(
    "All vitals days:",
    vitals.map((v) => v.day)
  );

  // Find the DailyVitals for the selected day (use .trim() for safety)
  const selectedVitals = vitals.find(
    (v) => v.day.trim() === selectedDay.trim()
  );
  console.log("selectedVitals:", selectedVitals);

  // Helper functions for card logic
  function readinessInterpretation(score?: number) {
    if (score === undefined || score === null) return "—";
    if (score >= 80) return "Ready to perform";
    if (score >= 60) return "Moderate recovery";
    return "Take it easy";
  }
  function stressLevel(stress?: any) {
    if (!stress || stress.stress_high == null) return { label: "—", emoji: "" };
    // Example mapping: 0-33 Low, 34-66 Medium, 67+ High
    const val = stress.stress_high;
    if (val < 34) return { label: "Low", emoji: "🟢" };
    if (val < 67) return { label: "Medium", emoji: "🟡" };
    return { label: "High", emoji: "🔴" };
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          className={`px-4 py-2 font-medium text-gray-800 dark:text-gray-200 border-b-2 transition-colors ${
            activeTab === "daily"
              ? "border-blue-600 dark:border-blue-400"
              : "border-transparent"
          }`}
          onClick={() => setActiveTab("daily")}
        >
          Daily Metrics
        </button>
        <button
          className={`px-4 py-2 font-medium text-gray-400 dark:text-gray-500 border-b-2 ml-2 cursor-not-allowed border-transparent`}
          onClick={() => setActiveTab("trends")}
          disabled
        >
          Trends
        </button>
      </div>

      {/* Day Selector */}
      {activeTab === "daily" && (
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {last7Days.map((d) => (
            <button
              key={d.date}
              className={`px-3 py-1 rounded border text-sm font-medium whitespace-nowrap ${
                selectedDay === d.date
                  ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500"
                  : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
              onClick={() => setSelectedDay(d.date)}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* Loading/Error */}
      {loading && (
        <div className="p-8 text-center text-gray-600 dark:text-gray-400">
          Loading vitals...
        </div>
      )}
      {error && (
        <div className="p-8 text-red-600 dark:text-red-400">Error: {error}</div>
      )}

      {/* Daily Metrics Cards */}
      {activeTab === "daily" && !loading && !error && (
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2">
          {/* Readiness Score Card */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
            <div className="font-semibold text-lg mb-1">Readiness</div>
            <div className="text-3xl font-bold mb-2">
              {selectedVitals?.readiness?.score ?? "—"}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {readinessInterpretation(selectedVitals?.readiness?.score)}
            </div>
            {selectedVitals?.readiness && (
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Day: {selectedVitals.readiness.day}
              </div>
            )}
          </div>
          {/* Sleep Summary Card */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
            <div className="font-semibold text-lg mb-1">Sleep Score</div>
            <div className="text-3xl font-bold mb-2">—</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              (Sleep endpoint not implemented yet)
            </div>
          </div>
          {/* Daytime Stress Status Card */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
            <div className="font-semibold text-lg mb-1">Stress</div>
            <div className="text-2xl font-bold mb-2 flex items-center gap-2">
              {stressLevel(selectedVitals?.stress).emoji}
              {stressLevel(selectedVitals?.stress).label}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {selectedVitals?.stress?.stress_high
                ? `High: ${selectedVitals.stress.stress_high}%`
                : "No stress data available"}
            </div>
          </div>
          {/* Activity Progress Card */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
            <div className="font-semibold text-lg mb-1">Activity</div>
            <div className="text-3xl font-bold mb-2">
              {selectedVitals?.activity?.score ?? "—"}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Steps: {selectedVitals?.activity?.steps ?? "—"} <br />
              Calories: {selectedVitals?.activity?.active_calories ?? "—"}
            </div>
          </div>
          {/* SpO2 Card */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
            <div className="font-semibold text-lg mb-1">SpO2</div>
            <div className="text-3xl font-bold mb-2">
              {selectedVitals?.spo2?.average_saturation ?? "—"}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Average: {selectedVitals?.spo2?.average_saturation ?? "—"}% <br />
              Min: {selectedVitals?.spo2?.min_saturation ?? "—"}%
            </div>
          </div>
          {/* Cardiovascular Age Card */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
            <div className="font-semibold text-lg mb-1">Cardiovascular Age</div>
            <div className="text-3xl font-bold mb-2">
              {selectedVitals?.cardiovascular_age?.cardiovascular_age ?? "—"}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Age:{" "}
              {selectedVitals?.cardiovascular_age?.cardiovascular_age ?? "—"}{" "}
              years
            </div>
          </div>
          {/* Resilience Card */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
            <div className="font-semibold text-lg mb-1">Resilience</div>
            <div className="text-3xl font-bold mb-2">
              {selectedVitals?.resilience?.score ?? "—"}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Recovery: {selectedVitals?.resilience?.score ?? "—"}
            </div>
          </div>
          {/* VO2 Max Card */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100">
            <div className="font-semibold text-lg mb-1">VO2 Max</div>
            <div className="text-3xl font-bold mb-2">
              {selectedVitals?.vo2_max?.vo2_max ?? "—"}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Max: {selectedVitals?.vo2_max?.vo2_max ?? "—"} ml/kg/min
            </div>
          </div>
        </div>
      )}

      {/* Trends Tab Stub */}
      {activeTab === "trends" && (
        <div className="p-8 text-center text-gray-400 dark:text-gray-500">
          Trends coming soon...
        </div>
      )}
    </div>
  );
};

export default VitalsPage;
