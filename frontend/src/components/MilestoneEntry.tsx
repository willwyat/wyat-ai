import React from "react";
import {
  CheckCircleIcon,
  ArrowPathIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolidIcon } from "@heroicons/react/24/solid";

interface Milestone {
  title: string;
  status: string;
  due_date?: string;
  completed_date?: string;
  description?: string;
  id?: string;
}

interface MilestoneEntryProps {
  milestone: Milestone;
  variant?: "compact" | "detailed";
}

export default function MilestoneEntry({
  milestone,
  variant = "compact",
}: MilestoneEntryProps) {
  // Get icon based on status
  const getStatusIcon = () => {
    switch (milestone.status) {
      case "completed":
        return (
          <CheckCircleSolidIcon
            className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0"
            title="Completed"
          />
        );
      case "in_progress":
        return (
          <ArrowPathIcon
            className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0"
            title="In Progress"
          />
        );
      case "cancelled":
        return (
          <XCircleIcon
            className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0"
            title="Cancelled"
          />
        );
      default: // pending
        return (
          <svg
            className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Pending</title>
            <circle cx="12" cy="12" r="9" strokeWidth="2" />
          </svg>
        );
    }
  };

  if (variant === "compact") {
    // Compact view for list page
    return (
      <div className="text-sm flex flex-row justify-between items-center py-3 px-6 hover:bg-gray-50 dark:hover:bg-gray-900">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <span className="text-gray-700 dark:text-gray-300 font-medium">
            {milestone.title}
          </span>
        </div>
        {milestone.due_date && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(milestone.due_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        )}
      </div>
    );
  }

  // Detailed view for project detail page
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex flex-row justify-between items-center">
        <div className="flex items-center gap-3 mb-2">
          {getStatusIcon()}
          <div className="flex-1">
            <h3 className="text-gray-900 dark:text-white">{milestone.title}</h3>
          </div>
        </div>
        <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400 ml-8">
          {milestone.due_date && (
            <div>
              {new Date(milestone.due_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
          )}
          {milestone.completed_date && (
            <div>
              <span className="font-medium">Completed:</span>{" "}
              {new Date(milestone.completed_date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
          )}
        </div>
      </div>
      {milestone.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 ml-8">
          {milestone.description}
        </p>
      )}
    </div>
  );
}
