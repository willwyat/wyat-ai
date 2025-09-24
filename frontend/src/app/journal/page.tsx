"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_URL, WYAT_API_KEY } from "@/lib/config";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { parse } from "date-fns";

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

    if (datesWithEntries.has(selectedDate)) {
      fetchEntriesForDate(selectedDate);
    } else {
      console.log("No entries for selected date:", selectedDate);
      setSelectedDayEntries([]);
    }
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
      <div className="flex flex-col min-h-screen h-fullgap-8 md:ml-20">
        <div className="flex flex-col md:flex-row gap-6 h-full bg-gray-50 dark:bg-gray-900">
          {/* SIDEBAR */}
          <div className="flex flex-col gap-6 w-full md:w-md border-r border-gray-200 dark:border-gray-800 shadow-md pt-5 md:fixed md:top-0 md:left-20 md:h-full bg-gray-50 dark:bg-gray-900">
            {/* Search Bar */}
            <div className="px-8">
              <input
                type="text"
                value={searchQuery}
                // onChange={(e) => handleSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            {/* ENTRIES LIST */}
            <div className="flex flex-col px-8 overflow-y-auto">
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
                    className="flex flex-row px-1 py-2 border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ease-in-out duration-200 cursor-pointer"
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
                    <p className="text-zinc-600 dark:text-zinc-400 line-clamp-1">
                      {displayText.slice(0, 200)}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* Add New Entry Button */}
            {/* <div className="bg-zinc-100 dark:bg-zinc-800 rounded px-6 py-5">
              <div className="flex items-center justify-between">
                {/* <div>
                  <h2 className="text-xl font-bold mb-2">Create New Entry</h2>
                  <p className="text-gray-600">Write a new journal entry</p>
                </div> 
                <button
                  onClick={() => router.push("/journal/new")}
                  className="cursor-pointer text-white dark:text-black bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 font-bold text-sm px-4 py-2 rounded"
                >
                  New Entry
                </button>
              </div>
            </div> */}
          </div>

          {/* CONTENT */}
          <div className="md:ml-112 w-full h-full">
            <div>
              {/* {datesWithEntries}
              {selectedDayEntries.length} */}
              {selectedDayEntries.length === 0 ? (
                <p className="text-gray-500 italic">
                  No entries for this date.
                </p>
              ) : (
                <div className="flex flex-col">
                  {selectedDayEntries.map((entry, i) => {
                    const latestVersion =
                      entry.versions?.[entry.versions.length - 1]?.text ?? "";
                    const id =
                      typeof entry._id === "object"
                        ? entry._id.$oid
                        : entry._id;
                    // const displayText = entry.preview_text || latestText;

                    return (
                      <div
                        key={i}
                        data-entry-date={entry.date}
                        // onClick={() => router.push(`/journal/${id}`)}
                        className="px-5 py-8 w-full lg:max-w-xl xl:max-w-3xl mx-auto flex flex-col gap-8"
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
                        <article className="leading-relaxed whitespace-pre-wrap font-serif text-lg lg:text-base ">
                          {latestVersion || "No content available."}
                        </article>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
