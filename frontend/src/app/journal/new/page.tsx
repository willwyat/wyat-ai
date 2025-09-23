"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

export default function NewJournalEntryPage() {
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newText.trim()) return;

    setLoading(true);

    try {
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
          date: newDate,
        }),
      });

      // Reset form
      setNewTitle("");
      setNewText("");
      setNewDate(new Date().toISOString().split("T")[0]);

      // Navigate back to journal page
      router.push("/journal");
    } catch (error) {
      console.error("Error creating journal entry:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 pb-20 md:pb-6 lg:pl-24">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 font-serif">
            New Journal Entry
          </h1>
          <p className="text-gray-600">Write a new entry for your journal</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-6">
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Title
              </label>
              <input
                id="title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-medium"
                placeholder="Enter a title for your entry..."
                required
              />
            </div>

            <div>
              <label
                htmlFor="date"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Date
              </label>
              <input
                id="date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <textarea
                id="content"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                className="h-lg w-full resize-vertical focus:outline-none"
                rows={8}
                placeholder="Write your journal entry here..."
                required
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => router.push("/journal")}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !newTitle.trim() || !newText.trim()}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? "Creating..." : "Create Entry"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
