"use client";

import React from "react";
import { TIMEZONE_GROUPS } from "@/lib/timezones";

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
}

export function TimezoneSelect({
  value,
  onChange,
  className = "",
  label,
  helperText,
  required = false,
}: TimezoneSelectProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
      >
        {TIMEZONE_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {helperText && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {helperText}
        </div>
      )}
    </div>
  );
}
