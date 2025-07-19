"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

type JournalEntry = {
  title: string;
  versions: { text: string; timestamp: string }[];
  timestamp: string;
  date_unix: number;
  _id: string | { $oid: string };
};

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const router = useRouter();

  useEffect(() => {
    fetch(`${API_URL}/journal/mongo/all`, {
      headers: {
        "x-wyat-api-key": WYAT_API_KEY,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        // Sort entries by date_unix in descending order (newest first)
        const sortedEntries = data.sort(
          (a: JournalEntry, b: JournalEntry) => b.date_unix - a.date_unix
        );
        setEntries(sortedEntries);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newText.trim()) return;

    // Convert the date string to Unix timestamp
    const dateUnix = Math.floor(new Date(newDate).getTime() / 1000);

    await fetch(`${API_URL}/journal/mongo`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-wyat-api-key": WYAT_API_KEY,
      },
      body: JSON.stringify({
        title: newTitle,
        text: newText,
        date_unix: dateUnix,
      }),
    });

    setNewTitle("");
    setNewText("");
    setNewDate(new Date().toISOString().split("T")[0]);
    setLoading(true);
    const res = await fetch(`${API_URL}/journal/mongo/all`, {
      headers: {
        "x-wyat-api-key": WYAT_API_KEY,
      },
    });
    const data = await res.json();
    // Sort entries by date_unix in descending order (newest first)
    const sortedEntries = data.sort(
      (a: JournalEntry, b: JournalEntry) => b.date_unix - a.date_unix
    );
    setEntries(sortedEntries);
    setLoading(false);
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="min-h-screen">
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
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              <div className="flex flex-col">
                {entries.map((entry, i) => {
                  const latestText =
                    entry.versions?.[entry.versions.length - 1]?.text ?? "";
                  const id =
                    typeof entry._id === "object" ? entry._id.$oid : entry._id;
                  return (
                    <div
                      key={i}
                      onClick={() => router.push(`/journal/${id}`)}
                      className="flex flex-row px-1 py-2 border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ease-in-out duration-300 cursor-pointer"
                    >
                      <div className="min-w-30">
                        <h3 className="font-semibold">
                          {new Date(entry.date_unix * 1000).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                            }
                          )}{" "}
                          (
                          {new Date(entry.date_unix * 1000).toLocaleDateString(
                            "en-US",
                            {
                              weekday: "short",
                            }
                          )}
                          )
                        </h3>
                      </div>
                      <p className="text-zinc-700 dark:text-zinc-300 line-clamp-1">
                        {latestText.slice(0, 200)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
