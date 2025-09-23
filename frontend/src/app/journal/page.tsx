"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { API_URL, WYAT_API_KEY } from "@/lib/config";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

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
  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      // If search is empty, show all entries
      setEntries(allEntries);
      return;
    }

    try {
      // Use the search/ids endpoint to get matching results with highlights
      const response = await fetch(
        `${API_URL}/journal/mongo/search/ids?q=${encodeURIComponent(query)}`,
        {
          headers: {
            "x-wyat-api-key": WYAT_API_KEY,
          },
        }
      );

      const searchResults = await response.json();

      // Filter all entries to only show those with matching IDs
      const filteredEntries = allEntries.filter((entry) => {
        const id = typeof entry._id === "object" ? entry._id.$oid : entry._id;
        return searchResults.some((result: any) => result._id === id);
      });

      setEntries(filteredEntries);
    } catch (error) {
      console.error("Search error:", error);
      // Fallback to showing all entries if search fails
      setEntries(allEntries);
    }
  };

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

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // ======================= //
  // * * * DATEPICKER. * * * //
  // ======================= //

  // Fetch entries for a specific date using the new API endpoint
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
      setEntries(data);
    } catch (error) {
      console.error("Error fetching entries for date:", error);
      setEntries([]); // Set empty array on error
    }
  };

  // Fetch entries if selected date is changed
  useEffect(() => {
    fetchEntriesForDate(selectedDate);
  }, [selectedDate]);

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
      <div className="p-6 flex flex-col gap-8 max-w-screen-xl mx-auto">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex flex-col gap-3 w-full md:w-sm">
            <h1 className="text-3xl font-bold">Journal</h1>
            {/* Search Section */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Search by tags or keywords (e.g., history, ceremonial, family)..."
            />
            {/* Date Picker */}
            <DayPicker
              mode="single"
              selected={new Date()}
              onSelect={(date) =>
                setSelectedDate(
                  date?.toISOString().split("T")[0] ??
                    new Date().toISOString().split("T")[0]
                )
              }
              modifiers={{
                hasEntry: Array.from(datesWithEntries).map(
                  (dateStr) => new Date(dateStr)
                ),
              }}
              modifiersClassNames={{
                hasEntry: "has-entry",
              }}
            />
            {/* Add New Entry Button */}
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded px-6 py-5">
              <div className="flex items-center justify-between">
                {/* <div>
                  <h2 className="text-xl font-bold mb-2">Create New Entry</h2>
                  <p className="text-gray-600">Write a new journal entry</p>
                </div> */}
                <button
                  onClick={() => router.push("/journal/new")}
                  className="cursor-pointer text-white dark:text-black bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 font-bold text-sm px-4 py-2 rounded"
                >
                  New Entry
                </button>
              </div>
            </div>
          </div>

          {/* Journal Entries */}
          <div>
            {/* <h2 className="text-xl font-bold mb-4">
              Journal Entries {searchQuery && `(${entries.length} found)`}
            </h2> */}
            {entries.length === 0 ? (
              <p>
                {searchQuery
                  ? `No journal entries found matching "${searchQuery}".`
                  : "No journal entries found."}
              </p>
            ) : (
              <div className="flex flex-col">
                {entries.map((entry, i) => {
                  const latestText =
                    entry.versions?.[entry.versions.length - 1]?.text ?? "";
                  const id =
                    typeof entry._id === "object" ? entry._id.$oid : entry._id;

                  // Use preview_text if available, otherwise fall back to latest text
                  const displayText = entry.preview_text || latestText;

                  return (
                    <div
                      key={i}
                      onClick={() => router.push(`/journal/${id}`)}
                      className="flex flex-row px-1 py-2 border-t border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ease-in-out duration-300 cursor-pointer"
                    >
                      <div className="min-w-30">
                        <h3 className="font-semibold">
                          {new Date(entry.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          (
                          {new Date(entry.date).toLocaleDateString("en-US", {
                            weekday: "short",
                          })}
                          )
                        </h3>
                      </div>
                      <p className="text-zinc-700 dark:text-zinc-300 line-clamp-1">
                        {displayText.slice(0, 200)}
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
