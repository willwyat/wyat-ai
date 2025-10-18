"use client";

import { useEffect, useState } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";
import MarkdownContent from "@/components/MarkdownContent";

type CapitalReadme = {
  _id: string;
  type: string;
  title: string;
  version: string;
  content: string;
  visibility: string;
  modules?: string[];
  createdAt: string;
  updatedAt: string;
};

export default function CapitalPage() {
  const [data, setData] = useState<CapitalReadme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editVersion, setEditVersion] = useState("");
  const [editModules, setEditModules] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [headings, setHeadings] = useState<
    Array<{ id: string; text: string; level: number }>
  >([]);

  // Extract headings from markdown content
  useEffect(() => {
    if (!data?.content) return;

    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    const extractedHeadings: Array<{
      id: string;
      text: string;
      level: number;
    }> = [];
    let match;

    while ((match = headingRegex.exec(data.content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = generateHeadingId(text);

      extractedHeadings.push({ id, text, level });
    }

    setHeadings(extractedHeadings);
  }, [data?.content]);

  // Check for dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };

    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/meta/capital-readme`, {
      headers: {
        "x-wyat-api-key": WYAT_API_KEY,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setData(data);
        setEditContent(data.content);
        setEditVersion(data.version);
        setEditModules(data.modules || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!data) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/meta/capital-readme`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify({
          content: editContent,
          version: editVersion,
          modules: editModules,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update: ${response.status}`);
      }

      const result = await response.json();

      // Update local state
      setData({
        ...data,
        content: editContent,
        version: editVersion,
        modules: editModules,
        updatedAt: new Date().toISOString(),
      });

      setIsEditing(false);
      alert("Updated successfully!");
    } catch (err) {
      alert(
        `Error updating: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditContent(data?.content || "");
    setEditVersion(data?.version || "");
    setEditModules(data?.modules || []);
    setIsEditing(false);
  };

  const addModule = () => {
    setEditModules([...editModules, ""]);
  };

  const removeModule = (index: number) => {
    setEditModules(editModules.filter((_, i) => i !== index));
  };

  const updateModule = (index: number, value: string) => {
    const newModules = [...editModules];
    newModules[index] = value;
    setEditModules(newModules);
  };

  const generateHeadingId = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">No data found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="p-6 flex flex-col gap-8 max-w-screen-lg mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-bold">{data.title}</h1>
            {isEditing ? (
              <input
                type="text"
                value={editVersion}
                onChange={(e) => setEditVersion(e.target.value)}
                className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded border border-blue-300 dark:border-blue-700"
                placeholder="Version"
              />
            ) : (
              <span className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                v{data.version}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded font-medium"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Content Section */}
        <div>
          {isEditing ? (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Content:
              </label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-96 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                placeholder="Enter content here..."
              />
            </div>
          ) : (
            <MarkdownContent content={data.content} isDarkMode={isDarkMode} />
          )}
        </div>

        {/* Modules Section */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
            Modules
          </h3>
          {isEditing ? (
            <div className="space-y-2">
              {editModules.map((module, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={module}
                    onChange={(e) => updateModule(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="Module name"
                  />
                  <button
                    onClick={() => removeModule(index)}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={addModule}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
              >
                Add Module
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.modules && data.modules.length > 0 ? (
                data.modules.map((module, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium"
                  >
                    {module}
                  </span>
                ))
              ) : (
                <span className="text-gray-500 dark:text-gray-400 italic">
                  No modules defined
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <p>Created: {new Date(data.createdAt).toLocaleDateString()}</p>
          <p>Updated: {new Date(data.updatedAt).toLocaleDateString()}</p>
          <p>Visibility: {data.visibility}</p>
        </div>
      </div>
    </div>
  );
}
