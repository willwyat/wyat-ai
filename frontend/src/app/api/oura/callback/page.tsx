"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function OuraCallbackPage() {
  const [countdown, setCountdown] = useState(5);
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          router.push("/services/oura");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
      <div className="text-center space-y-6">
        {/* Loading Spinner */}
        <div className="relative">
          <div className="w-16 h-16 border-4 border-zinc-200 dark:border-zinc-700 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
        </div>

        {/* Success Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Welcome to Wyat AI
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Successfully connected with Oura
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-500">
            Redirecting to services in {countdown} seconds...
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-64 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full mx-auto overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-1000 ease-linear"
            style={{ width: `${((5 - countdown) / 5) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
