// frontend/src/app/journal/page.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";

type JournalVersion = {
  title: string;
  text: string;
  timestamp: string;
};

type VersionedJournalEntry = {
  id: number;
  versions: JournalVersion[];
  preview_text: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function JournalPage() {
  const [entries, setEntries] = useState<VersionedJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/journal`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newText.trim()) return;

    await fetch(`${API_URL}/journal`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ title: newTitle, text: newText }),
    });

    setNewTitle("");
    setNewText("");
    setLoading(true);
    const res = await fetch(`${API_URL}/journal`);
    const data = await res.json();
    setEntries(data);
    setLoading(false);
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="bg-zinc-200 dark:bg-zinc-900 min-h-screen">
      <div className="p-6 flex flex-col gap-8 max-w-screen-xl mx-auto">
        <h1 className="text-4xl font-bold">Journal</h1>
        <div className="flex flex-col gap-4">
          <div className="bg-zinc-100 dark:bg-zinc-800 rounded px-6 py-5">
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-5">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full font-bold text-xl"
                  placeholder="Title"
                />
                <textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  className="w-full"
                  rows={3}
                  placeholder="Write a new journal entry..."
                />
              </div>
              <button
                type="submit"
                className="cursor-pointer text-white dark:text-black bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 font-bold text-sm px-4 py-2 rounded"
              >
                Add Entry
              </button>
            </form>
          </div>
          <div>
            <h2 className="text-xl font-bold mb-4">Journal Entries</h2>
            {entries.length === 0 ? (
              <p>No journal entries found.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                  <div key={entry.id}>
                    {entry.versions.map((version, i) => (
                      <div
                        className="flex flex-col gap-5 rounded px-6 py-5 transition-colors ease-in-out duration-300 bg-zinc-100 hover:bg-zinc-100/50 dark:bg-zinc-800 dark:hover:bg-zinc-700/50 cursor-pointer"
                        key={i}
                      >
                        <h3 className="font-semibold">{version.title}</h3>

                        <p className="text-zinc-700 dark:text-zinc-300 line-clamp-4">
                          {entry.preview_text}
                        </p>
                        <p className="text-zinc-400 dark:text-zinc-600">
                          Last updated{" "}
                          {new Date(version.timestamp).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
