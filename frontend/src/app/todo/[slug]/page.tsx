"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useProjectStore } from "@/stores";
import Link from "next/link";
import type { Project, ProjectPlanning } from "@/types/projects";
import MilestoneEntry from "@/components/MilestoneEntry";

export default function ProjectDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { fetchProjectById, loading, error } = useProjectStore();
  const [project, setProject] = useState<Project | null>(null);
  const [planningDocs, setPlanningDocs] = useState<ProjectPlanning[]>([]);

  useEffect(() => {
    const loadProject = async () => {
      const projectData = await fetchProjectById(slug);
      if (projectData) {
        setProject(projectData);

        // Fetch planning documents that reference this project
        const response = await fetch(
          `${
            process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
          }/project-planning`,
          {
            headers: {
              "x-wyat-api-key": process.env.NEXT_PUBLIC_WYAT_API_KEY || "",
            },
            credentials: "include",
          }
        );

        if (response.ok) {
          const allPlanning = await response.json();
          const relatedPlanning = allPlanning.filter((doc: ProjectPlanning) =>
            doc.projects.includes(projectData.slug)
          );
          setPlanningDocs(relatedPlanning);
        }
      }
    };

    loadProject();
  }, [slug, fetchProjectById]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              {error || "Project not found"}
            </h2>
            <Link href="/todo" className="text-blue-500 hover:text-blue-600">
              ← Back to Todo
            </Link>
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

  const getMilestoneStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "in_progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "pending":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/todo"
            className="text-blue-500 hover:text-blue-600 text-sm"
          >
            ← Back to Todo
          </Link>
        </div>

        {/* Project Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {project.title}
            </h1>
            <span
              className={`px-3 py-1 text-sm font-medium rounded ${getStatusColor(
                project.status
              )}`}
            >
              {project.status}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Type</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {project.type}
              </p>
            </div>
            {project.priority && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Priority
                </p>
                <p className="font-medium text-gray-900 dark:text-white capitalize">
                  {project.priority}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Created
              </p>
              <p className="font-medium text-gray-900 dark:text-white">
                {new Date(project.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Updated
              </p>
              <p className="font-medium text-gray-900 dark:text-white">
                {new Date(project.updatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Milestones */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Milestones ({project.milestones.length})
          </h2>

          {project.milestones.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">
              No milestones defined
            </p>
          ) : (
            <div className="space-y-4">
              {project.milestones.map((milestone, index) => (
                <MilestoneEntry
                  key={index}
                  milestone={milestone}
                  variant="detailed"
                />
              ))}
            </div>
          )}
        </div>

        {/* Artifacts */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Artifacts ({project.artifacts.length})
          </h2>

          {project.artifacts.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No artifacts</p>
          ) : (
            <div className="space-y-3">
              {project.artifacts.map((artifact, index) => (
                <div
                  key={index}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                        {artifact.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Type: {artifact.artifact_type}
                      </p>
                      {artifact.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {artifact.description}
                        </p>
                      )}
                    </div>
                    {artifact.url && (
                      <a
                        href={artifact.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-4 text-blue-500 hover:text-blue-600"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Planning Documents */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Related Planning Documents ({planningDocs.length})
          </h2>

          {planningDocs.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">
              No planning documents linked to this project
            </p>
          ) : (
            <div className="space-y-3">
              {planningDocs.map((doc) => (
                <Link
                  key={doc._id}
                  href={`/planning/${doc.slug}`}
                  className="block border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                        {doc.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Version: {doc.version}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5 text-blue-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
