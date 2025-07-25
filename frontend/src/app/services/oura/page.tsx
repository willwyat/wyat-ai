"use client";

import { useEffect, useState } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

interface OuraConnectionStatus {
  connected: boolean;
  lastSync?: string;
  tokenExpiresAt?: string;
  scopes?: string[];
}

export default function OuraServicesPage() {
  const [status, setStatus] = useState<OuraConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    try {
      // For now, we'll simulate a connection check
      // In a real implementation, you'd call your backend to check token status
      const mockStatus: OuraConnectionStatus = {
        connected: true,
        lastSync: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        scopes: [
          "email",
          "personal",
          "daily",
          "heartrate",
          "workout",
          "session",
        ],
      };

      setStatus(mockStatus);
    } catch (error) {
      console.error("Failed to check connection status:", error);
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncData = async () => {
    setSyncing(true);
    try {
      // Sync daily sleep data (backend handles dates automatically)
      const dailySleepResponse = await fetch(
        `${API_URL}/oura/daily-sleep/sync`,
        {
          headers: {
            "x-wyat-api-key": WYAT_API_KEY,
          },
        }
      );

      // Sync daily activity data (backend handles dates automatically)
      const dailyActivityResponse = await fetch(
        `${API_URL}/oura/daily-activity/sync`,
        {
          headers: {
            "x-wyat-api-key": WYAT_API_KEY,
          },
        }
      );

      // Sync daily cardiovascular age data (backend handles dates automatically)
      const dailyCardiovascularAgeResponse = await fetch(
        `${API_URL}/oura/daily-cardiovascular-age/sync`,
        {
          headers: {
            "x-wyat-api-key": WYAT_API_KEY,
          },
        }
      );

      // Sync daily readiness data (backend handles dates automatically)
      const dailyReadinessResponse = await fetch(
        `${API_URL}/oura/daily-readiness/sync`,
        {
          headers: {
            "x-wyat-api-key": WYAT_API_KEY,
          },
        }
      );

      // Sync daily resilience data (backend handles dates automatically)
      const dailyResilienceResponse = await fetch(
        `${API_URL}/oura/daily-resilience/sync`,
        {
          headers: {
            "x-wyat-api-key": WYAT_API_KEY,
          },
        }
      );

      // Sync daily SpO2 data (backend handles dates automatically)
      const dailySpO2Response = await fetch(`${API_URL}/oura/daily-spo2/sync`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      // Sync VO2 max data (backend handles dates automatically)
      const vo2MaxResponse = await fetch(`${API_URL}/oura/vo2-max/sync`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      // Sync daily stress data (backend handles dates automatically)
      const dailyStressResponse = await fetch(
        `${API_URL}/oura/daily-stress/sync`,
        {
          headers: {
            "x-wyat-api-key": WYAT_API_KEY,
          },
        }
      );

      // Sync heart rate data (backend handles dates automatically)
      const heartrateResponse = await fetch(`${API_URL}/oura/heartrate/sync`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      // Log sync results
      if (dailySleepResponse.ok) {
        const dailySleepData = await dailySleepResponse.json();
        console.log("Daily sleep sync result:", dailySleepData);
      }

      if (dailyActivityResponse.ok) {
        const dailyActivityData = await dailyActivityResponse.json();
        console.log("Daily activity sync result:", dailyActivityData);
      }

      if (dailyStressResponse.ok) {
        const dailyStressData = await dailyStressResponse.json();
        console.log("Daily stress sync result:", dailyStressData);
      }

      if (dailyCardiovascularAgeResponse.ok) {
        const dailyCardiovascularAgeData =
          await dailyCardiovascularAgeResponse.json();
        console.log(
          "Daily cardiovascular age sync result:",
          dailyCardiovascularAgeData
        );
      }

      if (dailyReadinessResponse.ok) {
        const dailyReadinessData = await dailyReadinessResponse.json();
        console.log("Daily readiness sync result:", dailyReadinessData);
      }

      if (dailyResilienceResponse.ok) {
        const dailyResilienceData = await dailyResilienceResponse.json();
        console.log("Daily resilience sync result:", dailyResilienceData);
      }

      if (heartrateResponse.ok) {
        const heartrateData = await heartrateResponse.json();
        console.log("Heart rate sync result:", heartrateData);
      }

      // Refresh status
      await checkConnectionStatus();
    } catch (error) {
      console.error("Failed to sync data:", error);
    } finally {
      setSyncing(false);
    }
  };

  const handleReconnect = () => {
    window.location.href = `${API_URL}/api/oura/auth`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-zinc-200 dark:border-zinc-700 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Oura Integration
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Manage your Oura ring connection and sync health data
          </p>
        </div>

        {/* Connection Status Card */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Connection Status
            </h2>
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  status?.connected ? "bg-green-500" : "bg-red-500"
                }`}
              ></div>
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {status?.connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>

          {status?.connected ? (
            <div className="space-y-4">
              {/* Connection Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    Last Sync
                  </label>
                  <p className="text-zinc-900 dark:text-zinc-100">
                    {status.lastSync
                      ? new Date(status.lastSync).toLocaleString()
                      : "Never"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    Token Expires
                  </label>
                  <p className="text-zinc-900 dark:text-zinc-100">
                    {status.tokenExpiresAt
                      ? new Date(status.tokenExpiresAt).toLocaleString()
                      : "Unknown"}
                  </p>
                </div>
              </div>

              {/* Scopes */}
              <div>
                <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Authorized Scopes
                </label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {status.scopes?.map((scope) => (
                    <span
                      key={scope}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-md"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleSyncData}
                  disabled={syncing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {syncing ? "Syncing..." : "Sync Data"}
                </button>
                <button
                  onClick={handleReconnect}
                  className="px-4 py-2 bg-zinc-600 text-white rounded-md hover:bg-zinc-700 transition-colors"
                >
                  Reconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                Your Oura ring is not connected to Wyat AI
              </p>
              <button
                onClick={handleReconnect}
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Connect Oura Ring
              </button>
            </div>
          )}
        </div>

        {/* Data Types Card */}
        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-zinc-200 dark:border-zinc-700 p-6">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Available Data Types
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                name: "Sleep Data",
                description: "Sleep scores, duration, and stages",
                icon: "😴",
              },
              {
                name: "Heart Rate",
                description: "Real-time heart rate measurements",
                icon: "💓",
              },
              {
                name: "Daily Summary",
                description: "Activity and readiness scores",
                icon: "📊",
              },
              {
                name: "Workouts",
                description: "Exercise sessions and metrics",
                icon: "🏃‍♂️",
              },
              {
                name: "Sessions",
                description: "Detailed activity sessions",
                icon: "⏱️",
              },
              {
                name: "Personal Info",
                description: "Profile and account information",
                icon: "👤",
              },
            ].map((dataType) => (
              <div
                key={dataType.name}
                className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{dataType.icon}</span>
                  <div>
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {dataType.name}
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {dataType.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
