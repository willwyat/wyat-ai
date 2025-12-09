"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useProjectStore } from "@/stores";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import type { ProjectPlanning, Project } from "@/types/projects";

export default function PlanningDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { fetchPlanningById, loading, error } = useProjectStore();
  const [planning, setPlanning] = useState<ProjectPlanning | null>(null);
  const [linkedProjects, setLinkedProjects] = useState<Project[]>([]);

  useEffect(() => {
    const loadPlanning = async () => {
      const planningData = await fetchPlanningById(slug);
      if (planningData) {
        setPlanning(planningData);

        // Fetch all projects
        const response = await fetch(
          `${
            process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
          }/projects`,
          {
            headers: {
              "x-wyat-api-key": process.env.NEXT_PUBLIC_WYAT_API_KEY || "",
            },
            credentials: "include",
          }
        );

        if (response.ok) {
          const allProjects = await response.json();
          const relatedProjects = allProjects.filter((proj: Project) =>
            planningData.projects.includes(proj.slug)
          );
          setLinkedProjects(relatedProjects);
        }
      }
    };

    loadPlanning();
  }, [slug, fetchPlanningById]);

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

  if (error || !planning) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
              {error || "Planning document not found"}
            </h2>
            <Link href="/todo" className="text-blue-500 hover:text-blue-600">
              ← Back to Todo
            </Link>
          </div>
        </div>
      </div>
    );
  }

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

        {/* Planning Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {planning.title}
          </h1>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Version
              </p>
              <p className="font-medium text-gray-900 dark:text-white">
                {planning.version}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Created
              </p>
              <p className="font-medium text-gray-900 dark:text-white">
                {new Date(planning.createdAt).toLocaleDateString("en-US", {
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
                {new Date(planning.updatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Linked Projects */}
        {linkedProjects.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Related Projects ({linkedProjects.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {linkedProjects.map((project) => (
                <Link
                  key={project._id}
                  href={`/projects/${project.slug}`}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                        {project.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {project.status} • {project.type}
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
          </div>
        )}

        {/* Planning Content (Markdown) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Planning Content
          </h2>
          <div className="prose prose-gray dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => (
                  <h1
                    className="text-2xl font-bold text-gray-900 dark:text-white mt-6 mb-4"
                    {...props}
                  />
                ),
                h2: ({ node, ...props }) => (
                  <h2
                    className="text-xl font-bold text-gray-900 dark:text-white mt-5 mb-3"
                    {...props}
                  />
                ),
                h3: ({ node, ...props }) => (
                  <h3
                    className="text-lg font-semibold text-gray-900 dark:text-white mt-4 mb-2"
                    {...props}
                  />
                ),
                p: ({ node, ...props }) => (
                  <p
                    className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed"
                    {...props}
                  />
                ),
                ul: ({ node, ...props }) => (
                  <ul
                    className="list-disc list-inside mb-4 text-gray-700 dark:text-gray-300"
                    {...props}
                  />
                ),
                ol: ({ node, ...props }) => (
                  <ol
                    className="list-decimal list-inside mb-4 text-gray-700 dark:text-gray-300"
                    {...props}
                  />
                ),
                li: ({ node, ...props }) => <li className="mb-2" {...props} />,
                code: ({ node, inline, ...props }: any) =>
                  inline ? (
                    <code
                      className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-gray-900 dark:text-gray-100"
                      {...props}
                    />
                  ) : (
                    <code
                      className="block bg-gray-100 dark:bg-gray-700 p-4 rounded text-sm font-mono text-gray-900 dark:text-gray-100 overflow-x-auto"
                      {...props}
                    />
                  ),
                pre: ({ node, ...props }) => (
                  <pre className="mb-4 overflow-x-auto" {...props} />
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote
                    className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400 mb-4"
                    {...props}
                  />
                ),
                a: ({ node, ...props }) => (
                  <a
                    className="text-blue-500 hover:text-blue-600 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  />
                ),
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto mb-4">
                    <table
                      className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
                      {...props}
                    />
                  </div>
                ),
                thead: ({ node, ...props }) => (
                  <thead className="bg-gray-50 dark:bg-gray-700" {...props} />
                ),
                tbody: ({ node, ...props }) => (
                  <tbody
                    className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                    {...props}
                  />
                ),
                th: ({ node, ...props }) => (
                  <th
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                    {...props}
                  />
                ),
                td: ({ node, ...props }) => (
                  <td
                    className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300"
                    {...props}
                  />
                ),
              }}
            >
              {planning.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
