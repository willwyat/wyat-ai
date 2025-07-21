"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

interface JournalEntry {
  _id: string;
  title: string;
  date_unix: number;
  versions: { text: string; timestamp: string }[];
}

export default function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchEntry();
  }, [id]);

  const fetchEntry = async () => {
    try {
      const res = await fetch(`${API_URL}/journal/mongo/${id}`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (!res.ok) {
        router.push("/journal");
        return;
      }

      const data: JournalEntry = await res.json();
      setEntry(data);
      const latestText = data.versions?.[data.versions.length - 1]?.text || "";
      setEditText(latestText);
      setOriginalText(latestText);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching entry:", error);
      router.push("/journal");
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleDiscard = () => {
    setEditText(originalText);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!entry || editText.trim() === "") return;

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/journal/mongo/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wyat-api-key": WYAT_API_KEY,
        },
        body: JSON.stringify({ text: editText }),
      });

      if (res.ok) {
        setOriginalText(editText);
        setIsEditing(false);
        await fetchEntry(); // Refresh the entry to get updated data
      } else {
        console.error("Failed to save changes");
      }
    } catch (error) {
      console.error("Error saving changes:", error);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = editText !== originalText;

  if (loading) {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <p>Loading...</p>
      </main>
    );
  }

  if (!entry) {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <p>Entry not found</p>
      </main>
    );
  }

  const latestVersion = entry.versions?.[entry.versions.length - 1];
  const dateDisplay =
    new Date(entry.date_unix * 1000).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }) +
    " (" +
    new Date(entry.date_unix * 1000).toLocaleDateString("en-US", {
      weekday: "short",
    }) +
    ")";

  return (
    <main className="flex flex-col p-8 max-w-2xl mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">{dateDisplay}</h1>
          <p className="text-zinc-600 text-sm mt-1">
            Version {entry.versions?.length || 0}. Last edited{" "}
            {latestVersion?.timestamp
              ? new Date(latestVersion.timestamp).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })
              : "unknown"}
            .
          </p>
        </div>
        {!isEditing ? (
          <button
            onClick={handleEdit}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Discard
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="flex-1 flex flex-col">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full flex-1 border-none resize-none outline-none p-0 leading-relaxed"
            placeholder="Write your journal entry..."
          />
        </div>
      ) : (
        <article className="leading-relaxed whitespace-pre-wrap font-serif">
          {latestVersion?.text || "No content available."}
        </article>
      )}
    </main>
  );
}
