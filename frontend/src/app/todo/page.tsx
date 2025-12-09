"use client";

import React, { useEffect } from "react";
import { useProjectStore } from "@/stores";
import Link from "next/link";
import MilestoneEntry from "@/components/MilestoneEntry";

export default function ProjectsPage() {
  console.log("=== ProjectsPage RENDER ===");

  const { projects, loading, error, fetchProjects } = useProjectStore();

  console.log("State:", {
    projects: projects.length,
    loading,
    error,
  });

  useEffect(() => {
    console.log("=== ProjectsPage useEffect: Fetching projects ===");
    fetchProjects();
  }, [fetchProjects]);

  if (loading && projects.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
                Error Loading Projects
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-4">{error}</p>
              <button
                onClick={() => fetchProjects()}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "paused":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "completed":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "archived":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "medium":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "low":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Projects
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage and track your projects and planning documents
          </p>
        </div>

        {/* Projects List */}
        {projects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              No projects found
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <Link
                key={project._id}
                href={`/todo/${project.slug}`}
                className="block"
              >
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 pt-6 pb-4 hover:shadow-lg transition-shadow cursor-pointer">
                  <div className="flex flex-col gap-4">
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-3 px-6">
                        <div className="flex-1">
                          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                            {project.title}
                          </h2>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(
                                project.status
                              )}`}
                            >
                              {project.status}
                            </span>
                            {project.priority && (
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded ${getPriorityColor(
                                  project.priority
                                )}`}
                              >
                                {project.priority} priority
                              </span>
                            )}
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {project.type}
                            </span>
                            {project.artifacts.length > 0 && (
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                • {project.artifacts.length} artifact
                                {project.artifacts.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      {project.milestones.length > 0 ? (
                        <div>
                          {project.milestones.map((milestone, i) => (
                            <MilestoneEntry
                              key={i}
                              milestone={milestone}
                              variant="compact"
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No milestones
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
