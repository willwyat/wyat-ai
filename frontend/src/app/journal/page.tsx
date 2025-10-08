"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_URL, WYAT_API_KEY } from "@/lib/config";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { parse } from "date-fns";
import WorkoutDisplay from "@/components/WorkoutDisplay";
import { ExerciseEntry } from "@/types/workout";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [datesWithEntries, setDatesWithEntries] = useState<Set<string>>(
    new Set()
  );

  // =================== //
  // * * * SEARCH. * * * //
  // =================== //
  const [searchInput, setSearchInput] = useState("");
  // const handleSearch = async (query: string) => {
  //   setSearchQuery(query);

  //   if (!query.trim()) {
  //     // If search is empty, show all entries
  //     setEntries(allEntries);
  //     return;
  //   }

  //   try {
  //     // Use the search/ids endpoint to get matching results with highlights
  //     const response = await fetch(
  //       `${API_URL}/journal/mongo/search/ids?q=${encodeURIComponent(query)}`,
  //       {
  //         headers: {
  //           "x-wyat-api-key": WYAT_API_KEY,
  //         },
  //       }
  //     );

  //     const searchResults = await response.json();

  //     // Filter all entries to only show those with matching IDs
  //     const filteredEntries = allEntries.filter((entry) => {
  //       const id = typeof entry._id === "object" ? entry._id.$oid : entry._id;
  //       return searchResults.some((result: any) => result._id === id);
  //     });

  //     setEntries(filteredEntries);
  //   } catch (error) {
  //     console.error("Search error:", error);
  //     // Fallback to showing all entries if search fails
  //     setEntries(allEntries);
  //   }
  // };

  // ===================== //
  // * * * PASSCODE. * * * //
  // ===================== //

  const [passcode, setPasscode] = useState("");
  const [passcodeValid, setPasscodeValid] = useState(false);
  const [passcodeError, setPasscodeError] = useState("");

  // Check localStorage for passcode
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("journal_passcode");
      if (stored === "wyat2024") {
        setPasscodeValid(true);
      }
    }
  }, []);

  // Fetch entries if passcode is valid
  useEffect(() => {
    if (!passcodeValid) return;
    fetch(`${API_URL}/journal/mongo/all`, {
      headers: {
        "x-wyat-api-key": WYAT_API_KEY,
      },
    })
      .then((res) => res.json())
      .then((data) => {
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
      });
  }, [passcodeValid]);

  // Handle passcode submit
  const handlePasscodeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (passcode === "wyat2024") {
      setPasscodeValid(true);
      setPasscodeError("");
      if (typeof window !== "undefined") {
        localStorage.setItem("journal_passcode", "wyat2024");
      }
    } else {
      setPasscodeError("Incorrect passcode");
    }
  };

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

  // =================== //
  // * * * RENDER. * * * //
  // =================== //
  // Render loading if loading is true
  if (loading) return <p>Loading...</p>;

  // Render passcode form if passcode is not valid
  if (!passcodeValid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <form
          onSubmit={handlePasscodeSubmit}
          className="bg-zinc-100 dark:bg-zinc-800 rounded px-8 py-6 flex flex-col gap-4 shadow-md"
        >
          <h2 className="text-2xl font-bold mb-2">Enter Passcode</h2>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Passcode"
            autoFocus
          />
          {passcodeError && (
            <p className="text-red-500 text-sm">{passcodeError}</p>
          )}
          <button
            type="submit"
            className="cursor-pointer text-white dark:text-black bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 font-bold text-sm px-4 py-2 rounded"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  // Render normal screen if passcode is valid
  return (
    <div className="min-h-screen">
      <div className="flex flex-col min-h-screen h-fullgap-8">
        <div className="flex flex-col md:flex-row gap-6 h-full bg-gray-50 dark:bg-gray-900 flex-grow">
          {/* SIDEBAR */}
          <div className="flex flex-col gap-2 w-full md:w-xs lg:w-sm border-r border-gray-200 dark:border-gray-800 shadow-md pt-5 md:fixed md:top-0 md:left-0 lg:left-20 md:h-full bg-gray-50 dark:bg-gray-900">
            {/* Search Bar */}
            <div className="px-4 lg:px-5 mb-2">
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
            <div className="relative flex flex-col flex-1 min-h-0">
              {/* ENTRIES LIST */}
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

          {/* CONTENT */}
          <div className="md:ml-80 lg:ml-96 w-full h-full">
            <div>
              {selectedDayEntries.length === 0 ? (
                // JOURNAL ENTRIES NOT FOUND
                <div className="px-5 py-8 w-full lg:max-w-xl xl:max-w-3xl mx-auto flex flex-col gap-8">
                  <h1 className="text-3xl font-bold">
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
                  </h1>
                  <p className="text-gray-500 italic">
                    No journal entries for this date.
                  </p>

                  {/* Show workouts even if no journal entries */}
                  {selectedDayWorkouts.length > 0 && (
                    <div className="mt-8">
                      <WorkoutDisplay workouts={selectedDayWorkouts} />
                    </div>
                  )}
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
                        className="px-9 lg:px-5 py-8 w-full lg:max-w-xl xl:max-w-3xl mx-auto flex flex-col gap-8"
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

                  {/* Show workouts after journal entries */}
                  {selectedDayWorkouts.length > 0 && (
                    <div className="px-9 lg:px-5 py-8 w-full lg:max-w-xl xl:max-w-3xl mx-auto">
                      <WorkoutDisplay workouts={selectedDayWorkouts} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
