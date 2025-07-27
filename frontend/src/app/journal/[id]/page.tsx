"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";
import { useVitalsStore, DailyVitals } from "@/stores";

interface JournalEntry {
  _id: string;
  title: string;
  date_unix: number;
  versions: { text: string; timestamp: string }[];
  tags?: string[];
  keywords?: string[];
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Vitals store
  const {
    vitals,
    loading: vitalsLoading,
    fetchVitalsForDate,
  } = useVitalsStore();

  useEffect(() => {
    fetchEntry();
  }, [id]);

  // Fetch vitals data when entry is loaded
  useEffect(() => {
    if (entry) {
      const entryDate = new Date(entry.date_unix * 1000);
      const entryDateStr = entryDate.toISOString().split("T")[0];
      const previousDay = getPreviousDay(entryDate);

      console.log("Journal entry date:", entryDateStr);
      console.log("Previous day for sleep:", previousDay);

      // Fetch readiness for the same day as the journal entry
      fetchVitalsForDate(entryDateStr);

      // Also fetch sleep data for the previous day
      fetchPreviousDaySleep(previousDay);
    }
  }, [entry, fetchVitalsForDate]);

  // State for previous day's sleep data
  const [previousDayVitals, setPreviousDayVitals] =
    useState<DailyVitals | null>(null);
  const [loadingPreviousDay, setLoadingPreviousDay] = useState(false);

  // Function to fetch previous day's sleep data
  const fetchPreviousDaySleep = async (date: string) => {
    setLoadingPreviousDay(true);
    try {
      const response = await fetch(`${API_URL}/vitals/sleep?date=${date}`, {
        headers: {
          "x-wyat-api-key": WYAT_API_KEY,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const sleepData = data.length > 0 ? data[0] : null;
        setPreviousDayVitals({
          day: date,
          readiness: null,
          activity: null,
          sleep: sleepData,
          resilience: null,
          stress: null,
          spo2: null,
          cardiovascular_age: null,
          vo2_max: null,
        });
      }
    } catch (error) {
      console.error("Error fetching sleep data:", error);
    } finally {
      setLoadingPreviousDay(false);
    }
  };

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
    // Trigger auto-resize after entering edit mode
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height =
          textareaRef.current.scrollHeight + "px";
      }
    }, 0);
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

  // Auto-resize textarea to fit content
  useEffect(() => {
    if (textareaRef.current) {
      // Store current scroll position and cursor position
      const scrollTop = window.scrollY;
      const textareaScrollTop = textareaRef.current.scrollTop;
      const selectionStart = textareaRef.current.selectionStart;
      const selectionEnd = textareaRef.current.selectionEnd;

      // Reset and set height
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";

      // Restore scroll positions
      window.scrollTo(0, scrollTop);
      textareaRef.current.scrollTop = textareaScrollTop;

      // Restore cursor position
      textareaRef.current.setSelectionRange(selectionStart, selectionEnd);
    }
  }, [editText]);

  // Helper function to get previous day's date
  const getPreviousDay = (date: Date): string => {
    const prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    return prevDay.toISOString().split("T")[0];
  };

  // Get vitals data
  const currentVitals = vitals[0];
  const entryDate = entry ? new Date(entry.date_unix * 1000) : null;
  const entryDateStr = entryDate ? entryDate.toISOString().split("T")[0] : "";
  const previousDay = entryDate ? getPreviousDay(entryDate) : null;

  if (loading) {
    return (
      <main className="p-5 max-w-2xl mx-auto">
        <p>Loading...</p>
      </main>
    );
  }

  if (!entry) {
    return (
      <main className="p-5 max-w-2xl mx-auto">
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
    <main className="flex flex-col max-w-2xl mx-auto">
      <div className="flex justify-between items-start px-5 py-12">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold font-serif">{dateDisplay}</h1>
        </div>
      </div>

      {/* Vitals Display */}
      <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
        <div className="grid grid-cols-2 gap-4">
          {/* Readiness Score */}
          <div className="flex flex-col">
            <span className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
              Readiness Score ({entryDateStr})
            </span>
            {vitalsLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="text-sm text-zinc-500">Loading...</div>
              </div>
            ) : currentVitals?.readiness ? (
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-blue-600">
                  {currentVitals.readiness.score}
                </div>
                <div className="text-sm text-zinc-500">/ 100</div>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">No data available</div>
            )}
          </div>

          {/* Sleep Score (Previous Day) */}
          <div className="flex flex-col">
            <span className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
              Sleep Score ({previousDay})
            </span>
            {loadingPreviousDay ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                <div className="text-sm text-zinc-500">Loading...</div>
              </div>
            ) : previousDayVitals?.sleep ? (
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-purple-600">
                  {previousDayVitals.sleep.score}
                </div>
                <div className="text-sm text-zinc-500">/ 100</div>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">
                <button
                  onClick={() =>
                    previousDay && fetchPreviousDaySleep(previousDay)
                  }
                  disabled={!previousDay}
                  className="text-blue-600 hover:text-blue-700 underline disabled:opacity-50"
                >
                  Fetch sleep data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isEditing ? (
        <div className="flex-1 flex flex-col px-5 py-4">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full min-h-[200px] border-none resize-none outline-none p-0 leading-relaxed font-serif"
            placeholder="Write your journal entry..."
            style={{ height: "auto" }}
          />
        </div>
      ) : (
        <div className="px-5 py-4">
          <article className="leading-relaxed whitespace-pre-wrap font-serif">
            {latestVersion?.text || "No content available."}
          </article>
        </div>
      )}

      <div className="px-5 flex flex-row justify-between items-center">
        <p className="text-zinc-600 text-sm font-serif">
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
      {/* Tags and Keywords Display */}
      {((entry?.tags && entry.tags.length > 0) ||
        (entry?.keywords && entry.keywords.length > 0)) && (
        <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg mt-4">
          <div className="space-y-4">
            {/* Tags */}
            {entry?.tags && entry.tags.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {entry.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Keywords */}
            {entry?.keywords && entry.keywords.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Keywords
                </h3>
                <div className="flex flex-wrap gap-2">
                  {entry.keywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded-full font-medium"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
