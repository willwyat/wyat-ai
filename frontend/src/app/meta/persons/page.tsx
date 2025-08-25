"use client";

import { useEffect, useState } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

type Person = {
  tag: string;
  name: string;
  nicknames: string[];
  visibility: string;
};

type PersonRegistry = {
  _id: string;
  type: string;
  title: string;
  version: string;
  persons: Person[];
  createdAt: string;
  updatedAt: string;
};

export default function PersonsPage() {
  const [data, setData] = useState<PersonRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/meta/person-registry`, {
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
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

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
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-bold">{data.title}</h1>
          <span className="text-sm bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded">
            v{data.version}
          </span>
        </div>

        <div className="bg-zinc-100 dark:bg-zinc-800 rounded px-6 py-5">
          <h2 className="text-2xl font-bold mb-4">Person Registry</h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Total persons: {data.persons.length}
          </p>

          <div className="grid gap-4">
            {data.persons.map((person, index) => (
              <div
                key={index}
                className="bg-white dark:bg-zinc-700 rounded-lg p-4 border border-zinc-200 dark:border-zinc-600"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold">{person.name}</h3>
                  <span className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                    {person.visibility}
                  </span>
                </div>

                <div className="mb-2">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Tag:
                  </span>
                  <code className="ml-2 text-sm bg-zinc-200 dark:bg-zinc-600 px-2 py-1 rounded">
                    {person.tag}
                  </code>
                </div>

                {person.nicknames.length > 0 && (
                  <div>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      Nicknames:
                    </span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {person.nicknames.map((nickname, nickIndex) => (
                        <span
                          key={nickIndex}
                          className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded"
                        >
                          {nickname}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <p>Created: {new Date(data.createdAt).toLocaleDateString()}</p>
          <p>Updated: {new Date(data.updatedAt).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}
