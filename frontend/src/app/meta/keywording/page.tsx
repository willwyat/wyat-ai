"use client";

import { useEffect, useState } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

type KeywordingBestPractices = {
  _id: string;
  type: string;
  title: string;
  version: string;
  content: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
};

export default function KeywordingPage() {
  const [data, setData] = useState<KeywordingBestPractices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editVersion, setEditVersion] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/meta/keywording-best-practices`, {
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
      const response = await fetch(
        `${API_URL}/meta/keywording-best-practices`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-wyat-api-key": WYAT_API_KEY,
          },
          body: JSON.stringify({
            content: editContent,
            version: editVersion,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update: ${response.status}`);
      }

      const result = await response.json();

      // Update local state
      setData({
        ...data,
        content: editContent,
        version: editVersion,
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
    setIsEditing(false);
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
      <div className="p-6 flex flex-col gap-8 max-w-screen-xl mx-auto">
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

        <div className="bg-zinc-100 dark:bg-zinc-800 rounded px-6 py-5">
          {isEditing ? (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Content:
              </label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-96 p-3 border border-zinc-300 dark:border-zinc-600 rounded-md bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono text-sm"
                placeholder="Enter content here..."
              />
            </div>
          ) : (
            <div className="prose dark:prose-invert max-w-none">
              <div
                className="whitespace-pre-wrap font-mono text-sm"
                dangerouslySetInnerHTML={{
                  __html: data.content.replace(/\n/g, "<br/>"),
                }}
              />
            </div>
          )}
        </div>

        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <p>Created: {new Date(data.createdAt).toLocaleDateString()}</p>
          <p>Updated: {new Date(data.updatedAt).toLocaleDateString()}</p>
          <p>Visibility: {data.visibility}</p>
        </div>
      </div>
    </div>
  );
}
