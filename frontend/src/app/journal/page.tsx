"use client";

import { useEffect, useState, FormEvent, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_URL, WYAT_API_KEY } from "@/lib/config";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { parse } from "date-fns";
import WorkoutDisplay from "@/components/WorkoutDisplay";
import { ExerciseEntry } from "@/types/workout";
import { Heading } from "@/components/ui/Heading";

type JournalEntry = {
  title?: string; // Deprecated field
  versions: { text: string; timestamp: string }[];
  timestamp: string;
  date_unix?: number; // Deprecated field
  date: string; // Primary date field
  preview_text: string;
  tags?: string[];
  keywords?: string[];
  _id: string | { $oid: string };
};

export default function JournalPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [allEntries, setAllEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [datesWithEntries, setDatesWithEntries] = useState<Set<string>>(
    new Set()
  );

  // =================== //
  // * * * SEARCH. * * * //
  // =================== //
  const [searchInput, setSearchInput] = useState("");

  // Fetch entries on mount
  useEffect(() => {
    document.title = "Journal - Wyat AI";

    console.log(
      "🔍 Fetching journal entries from:",
      `${API_URL}/journal/mongo/all`
    );

    fetch(`${API_URL}/journal/mongo/all`, {
      headers: {
        "x-wyat-api-key": WYAT_API_KEY,
      },
    })
      .then((res) => {
        console.log("📥 Response status:", res.status, res.statusText);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("✅ Successfully fetched", data.length, "journal entries");
        // Sort entries by date in descending order (newest first)
        const sortedEntries = data.sort((a: JournalEntry, b: JournalEntry) =>
          b.date.localeCompare(a.date)
        );
        setAllEntries(sortedEntries);
        setEntries(sortedEntries);

        // Extract unique dates that have entries
        const dates = new Set<string>(
          data.map((entry: JournalEntry) => entry.date)
        );
        setDatesWithEntries(dates);

        setLoading(false);
      })
      .catch((error) => {
        console.error("❌ Error fetching journal entries:", error);
        console.error("🔧 Check:");
        console.error("  1. Backend is running");
        console.error(
          "  2. FRONTEND_ORIGIN in backend .env is set to:",
          window.location.origin
        );
        console.error("  3. CORS configuration allows this domain");
        console.error("  4. API_URL is correct:", API_URL);

        // Set error message for UI
        if (
          error.message.includes("Failed to fetch") ||
          error.name === "TypeError"
        ) {
          setError(
            "Cannot connect to backend. This is likely a CORS issue. Check backend FRONTEND_ORIGIN environment variable."
          );
        } else {
          setError(`Error loading journal entries: ${error.message}`);
        }

        setLoading(false); // Stop loading even on error
      });
  }, []);

  // ======================= //
  // * * * DATEPICKER. * * * //
  // ======================= //
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date());

  function scrollToMonthEnd(month: Date) {
    const yyyy = month.getFullYear();
    const mm = String(month.getMonth() + 1).padStart(2, "0");

    const entriesOfMonth = document.querySelectorAll(
      `[data-entry-date^="${yyyy}-${mm}"]`
    );
    if (entriesOfMonth.length > 0) {
      const last = entriesOfMonth[entriesOfMonth.length - 1] as HTMLElement;
      last.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ======================= //
  // * * * VIEW ENTRY. * * * //
  // ======================= //

  // Fetch entries for a specific date using the new API endpoint

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const [selectedDayEntries, setSelectedDayEntries] = useState<JournalEntry[]>(
    []
  );
  const [selectedDayWorkouts, setSelectedDayWorkouts] = useState<
    ExerciseEntry[]
  >([]);

  // Mobile modal states
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [modalHeight, setModalHeight] = useState<"half" | "full">("full");
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [currentY, setCurrentY] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);

  // Open modal on mobile when page loads
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsMobileModalOpen(true);
    }
  }, []);

  // Fetch entries if selected date is changed
  useEffect(() => {
    const fetchEntriesForDate = async (date: string) => {
      try {
        const response = await fetch(`${API_URL}/journal/mongo/date/${date}`, {
          headers: {
            "x-wyat-api-key": WYAT_API_KEY,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch entries: ${response.statusText}`);
        }

        const data = await response.json();
        console.log("fetchEntriesForDate data", data);
        setEntries(data);
        setSelectedDayEntries(data);
      } catch (error) {
        console.error("Error fetching entries for date:", error);
        setEntries([]); // Set empty array on error
        setSelectedDayEntries([]);
      }
    };

    const fetchWorkoutsForDate = async (date: string) => {
      try {
        // Convert YYYY-MM-DD to Unix timestamp (noon local time)
        const dateObj = new Date(date + "T12:00:00");
        const unixTimestamp = Math.floor(dateObj.getTime() / 1000);

        // Get user's timezone
        const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const response = await fetch(
          `${API_URL}/workout/exercise-entries/day/${unixTimestamp}?tz=${encodeURIComponent(
            userTz
          )}`,
          {
            headers: {
              "x-wyat-api-key": WYAT_API_KEY,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch workouts: ${response.statusText}`);
        }

        const data = await response.json();
        console.log("fetchWorkoutsForDate data", data);
        setSelectedDayWorkouts(data);
      } catch (error) {
        console.error("Error fetching workouts for date:", error);
        setSelectedDayWorkouts([]);
      }
    };

    if (datesWithEntries.has(selectedDate)) {
      fetchEntriesForDate(selectedDate);
    } else {
      console.log("No entries for selected date:", selectedDate);
      setSelectedDayEntries([]);
    }

    // Always fetch workouts for the selected date
    fetchWorkoutsForDate(selectedDate);
  }, [selectedDate, datesWithEntries]);

  // ======================== //
  // * * * DRAG HANDLERS. * * * //
  // ======================== //
  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartY === null) return;
    const deltaY = e.touches[0].clientY - dragStartY;
    if (deltaY > 0) {
      // Only allow dragging down
      setCurrentY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (dragStartY === null) return;

    // If dragged down more than 100px, close the modal
    if (currentY > 100) {
      setIsMobileModalOpen(false);
    } else if (currentY > 50 && modalHeight === "full") {
      // If dragged 50-100px from full, switch to half
      setModalHeight("half");
    }

    // Reset
    setDragStartY(null);
    setCurrentY(0);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragStartY(e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartY === null) return;
    const deltaY = e.clientY - dragStartY;
    if (deltaY > 0) {
      setCurrentY(deltaY);
    }
  };

  const handleMouseUp = () => {
    if (dragStartY === null) return;

    if (currentY > 100) {
      setIsMobileModalOpen(false);
    } else if (currentY > 50 && modalHeight === "full") {
      setModalHeight("half");
    }

    setDragStartY(null);
    setCurrentY(0);
  };

  // =================== //
  // * * * RENDER. * * * //
  // =================== //
  // Render loading if loading is true
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Loading journal entries...
          </p>
        </div>
      </div>
    );
  }

  // Render error if there's an error
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-2xl w-full border border-red-500">
          <div className="flex items-start gap-4">
            <svg
              className="w-6 h-6 text-red-500 flex-shrink-0 mt-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
                Connection Error
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
              <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-md text-sm font-mono mb-4">
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  <strong>Troubleshooting:</strong>
                </p>
                <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400">
                  <li>Check backend is running</li>
                  <li>
                    Update backend{" "}
                    <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">
                      FRONTEND_ORIGIN
                    </code>{" "}
                    to:{" "}
                    <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">
                      {window.location.origin}
                    </code>
                  </li>
                  <li>Restart backend service</li>
                  <li>
                    API URL:{" "}
                    <code className="bg-gray-200 dark:bg-gray-800 px-1 rounded">
                      {API_URL}
                    </code>
                  </li>
                </ol>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render journal page
  return (
    <div className="min-h-screen">
      <div className="flex flex-col min-h-screen h-fullgap-8">
        <div className="flex flex-col md:flex-row gap-6 h-full bg-gray-50 dark:bg-gray-900 flex-grow">
          {/* SIDEBAR */}
          <div className="flex flex-col gap-2 w-full md:w-xs lg:w-sm border-r border-gray-200 dark:border-gray-800 shadow-md pt-5 md:pt-5 fixed top-0 left-0 md:left-0 lg:left-20 h-full bg-gray-50 dark:bg-gray-900 z-10">
            {/* Search Bar - Hidden on mobile */}
            <div className="px-4 lg:px-5 mb-2 hidden md:block">
              <input
                type="text"
                value={searchInput}
                // onChange={(e) => handleSearch(e.target.value)}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm h-12"
                placeholder="Search by tags or keywords ..."
              />
            </div>
            {/* {selectedDate}
            {visibleMonth.toISOString().split("T")[0]} */}
            {/* Date Picker */}
            <DayPicker
              onMonthChange={(month) => {
                setVisibleMonth(month);
                scrollToMonthEnd(month);
              }}
              animate={true}
              className="rdp-root"
              mode="single"
              showOutsideDays
              fixedWeeks
              navLayout="around"
              selected={parse(selectedDate, "yyyy-MM-dd", new Date())}
              onSelect={(date) => {
                if (date) {
                  const localDateStr = date.toISOString().split("T")[0];
                  setSelectedDate(localDateStr);
                  // Open mobile modal when date is selected on mobile
                  setIsMobileModalOpen(true);
                  setModalHeight("full");
                }
              }}
              modifiers={{
                hasEntry: Array.from(datesWithEntries).map((dateStr) =>
                  parse(dateStr, "yyyy-MM-dd", new Date())
                ),
              }}
              modifiersClassNames={{
                hasEntry: "has-entry",
              }}
            />
            <div className="relative flex-col flex-1 min-h-0 hidden md:flex">
              {/* ENTRIES LIST - Hidden on mobile, shown on desktop */}
              <div className="text-sm flex flex-col py-3 px-4 overflow-y-auto border-t border-gray-100 dark:border-gray-800 h-full">
                {allEntries.map((entry, i) => {
                  const latestText =
                    entry.versions?.[entry.versions.length - 1]?.text ?? "";
                  const id =
                    typeof entry._id === "object" ? entry._id.$oid : entry._id;

                  // Use preview_text if available, otherwise fall back to latest text
                  const displayText = entry.preview_text || latestText;

                  return (
                    <div
                      key={i}
                      data-entry-date={entry.date}
                      onClick={() => setSelectedDate(entry.date)}
                      className={`rounded-xs flex flex-row px-3 py-2 border-b border-gray-100 dark:border-gray-800 transition-colors ease-in-out duration-200 cursor-pointer ${
                        selectedDate === entry.date
                          ? "bg-gray-700 dark:bg-gray-300 text-white dark:text-black"
                          : "hover:bg-gray-300 active:bg-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600"
                      }`}
                    >
                      <div className="min-w-30">
                        <h3 className="font-semibold">
                          {parse(
                            entry.date,
                            "yyyy-MM-dd",
                            new Date()
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          {" ("}
                          {parse(
                            entry.date,
                            "yyyy-MM-dd",
                            new Date()
                          ).toLocaleDateString("en-US", {
                            weekday: "short",
                          })}
                          {")"}
                        </h3>
                      </div>
                      <p
                        className={`line-clamp-1 ${
                          selectedDate === entry.date
                            ? "text-white dark:text-black"
                            : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {displayText.slice(0, 200)}
                      </p>
                    </div>
                  );
                })}
              </div>
              {/* <div className="h-4 w-full absolute top-0 left-0 bg-gradient-to-b from-gray-50 to-transparent dark:from-gray-900 pointer-events-none" /> */}
            </div>
          </div>

          {/* DESKTOP CONTENT */}
          <div className="hidden md:block md:ml-80 lg:ml-96 w-full h-full">
            <div>
              {selectedDayEntries.length === 0 ? (
                // JOURNAL ENTRIES NOT FOUND
                <div className="px-6 py-8 w-full lg:max-w-xl xl:max-w-3xl mx-auto flex flex-col gap-8">
                  <Heading level={2}>
                    {parse(
                      selectedDate,
                      "yyyy-MM-dd",
                      new Date()
                    ).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                    })}
                    {" ("}
                    {parse(
                      selectedDate,
                      "yyyy-MM-dd",
                      new Date()
                    ).toLocaleDateString("en-US", {
                      weekday: "long",
                    })}
                    {")"}
                  </Heading>
                  <div className="h-24 flex flex-col items-center justify-center">
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      この日は日記なし
                    </p>
                  </div>
                </div>
              ) : (
                // JOURNAL ENTRIES FOUND
                <div className="flex flex-col">
                  {selectedDayEntries.map((entry, i) => {
                    const latestVersion =
                      entry.versions?.[entry.versions.length - 1]?.text ?? "";
                    const id =
                      typeof entry._id === "object"
                        ? entry._id.$oid
                        : entry._id;
                    return (
                      <div
                        key={i}
                        data-entry-date={entry.date}
                        // onClick={() => router.push(`/journal/${id}`)}
                        className="px-6 py-8 w-full lg:max-w-xl xl:max-w-3xl mx-auto flex flex-col gap-8"
                      >
                        <div className="flex flex-col gap-1">
                          <Heading level={2}>
                            {parse(
                              entry.date,
                              "yyyy-MM-dd",
                              new Date()
                            ).toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                            })}
                            {" ("}
                            {parse(
                              entry.date,
                              "yyyy-MM-dd",
                              new Date()
                            ).toLocaleDateString("en-US", {
                              weekday: "long",
                            })}
                            {")"}
                          </Heading>
                        </div>
                        <article className="leading-relaxed whitespace-pre-wrap font-serif text-base ">
                          {latestVersion || "No content available."}
                        </article>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Show workouts - single location regardless of journal entry state */}
              <div className="px-6 py-4 w-full lg:max-w-xl xl:max-w-3xl mx-auto">
                <WorkoutDisplay workouts={selectedDayWorkouts} />
              </div>

              <div className="px-6 py-4 w-full lg:max-w-xl xl:max-w-3xl mx-auto">
                <Heading level={3}>支出</Heading>
              </div>
            </div>
          </div>

          {/* MOBILE MODAL */}
          {isMobileModalOpen && (
            <>
              {/* Backdrop */}
              <div
                className="md:hidden fixed inset-0 bg-black/50 z-[60]"
                onClick={() => setIsMobileModalOpen(false)}
              />

              {/* Modal */}
              <div
                ref={modalRef}
                className={`md:hidden fixed left-0 right-0 bg-white dark:bg-gray-900 z-[70] rounded-t-2xl shadow-2xl transition-all duration-300 ease-out ${
                  modalHeight === "full"
                    ? "top-16 bottom-20"
                    : "top-1/2 bottom-20"
                }`}
                style={{
                  transform: `translateY(${currentY}px)`,
                }}
              >
                {/* Drag Handle */}
                <div
                  className="flex justify-center py-3 cursor-grab active:cursor-grabbing"
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onClick={() =>
                    setModalHeight(modalHeight === "full" ? "half" : "full")
                  }
                >
                  <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
                </div>

                {/* Close button */}
                <button
                  onClick={() => setIsMobileModalOpen(false)}
                  className="absolute top-3 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>

                {/* Modal Content */}
                <div className="overflow-y-auto h-full">
                  {selectedDayEntries.length === 0 ? (
                    // JOURNAL ENTRIES NOT FOUND
                    <div className="px-6 py-8 w-full flex flex-col gap-8">
                      <Heading level={1}>
                        {parse(
                          selectedDate,
                          "yyyy-MM-dd",
                          new Date()
                        ).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                        })}
                        {" ("}
                        {parse(
                          selectedDate,
                          "yyyy-MM-dd",
                          new Date()
                        ).toLocaleDateString("en-US", {
                          weekday: "long",
                        })}
                        {")"}
                      </Heading>
                      {/* <h1 className="text-3xl font-bold">
                        {parse(
                          selectedDate,
                          "yyyy-MM-dd",
                          new Date()
                        ).toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                        })}
                        {" ("}
                        {parse(
                          selectedDate,
                          "yyyy-MM-dd",
                          new Date()
                        ).toLocaleDateString("en-US", {
                          weekday: "long",
                        })}
                        {")"}
                      </h1> */}
                      <div className="h-24 flex flex-col items-center justify-center">
                        <p className="text-sm text-gray-400 dark:text-gray-500">
                          この日は日記なし
                        </p>
                      </div>
                    </div>
                  ) : (
                    // JOURNAL ENTRIES FOUND
                    <div className="flex flex-col">
                      {selectedDayEntries.map((entry, i) => {
                        const latestVersion =
                          entry.versions?.[entry.versions.length - 1]?.text ??
                          "";
                        const id =
                          typeof entry._id === "object"
                            ? entry._id.$oid
                            : entry._id;
                        return (
                          <div
                            key={i}
                            data-entry-date={entry.date}
                            className="px-6 py-8 w-full flex flex-col gap-8"
                          >
                            <div className="flex flex-col gap-1">
                              <h1 className="text-3xl font-bold">
                                {parse(
                                  entry.date,
                                  "yyyy-MM-dd",
                                  new Date()
                                ).toLocaleDateString("en-US", {
                                  month: "long",
                                  day: "numeric",
                                })}
                                {" ("}
                                {parse(
                                  entry.date,
                                  "yyyy-MM-dd",
                                  new Date()
                                ).toLocaleDateString("en-US", {
                                  weekday: "long",
                                })}
                                {")"}
                              </h1>
                            </div>
                            <article className="leading-relaxed whitespace-pre-wrap font-serif text-base ">
                              {latestVersion || "No content available."}
                            </article>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Show workouts */}
                  <div className="px-6 py-4 w-full">
                    <WorkoutDisplay workouts={selectedDayWorkouts} />
                  </div>

                  <div className="px-6 py-4 w-full">
                    <h2 className="text-2xl font-bold">支出</h2>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
