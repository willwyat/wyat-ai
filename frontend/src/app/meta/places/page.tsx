"use client";

import { useEffect, useState } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

type Place = {
  tag: string;
  name: string;
  aliases: string[];
  notes: string;
  visibility: string;
};

type PlaceRegistry = {
  _id: string;
  type: string;
  title: string;
  version: string;
  places: Place[];
  createdAt: string;
  updatedAt: string;
};

export default function PlacesPage() {
  const [data, setData] = useState<PlaceRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/meta/place-registry`, {
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
          <span className="text-sm bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 px-2 py-1 rounded">
            v{data.version}
          </span>
        </div>

        <div className="bg-zinc-100 dark:bg-zinc-800 rounded px-6 py-5">
          <h2 className="text-2xl font-bold mb-4">Place Registry</h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Total places: {data.places.length}
          </p>

          <div className="grid gap-4">
            {data.places.map((place, index) => (
              <div
                key={index}
                className="bg-white dark:bg-zinc-700 rounded-lg p-4 border border-zinc-200 dark:border-zinc-600"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold">{place.name}</h3>
                  <span className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                    {place.visibility}
                  </span>
                </div>

                <div className="mb-2">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Tag:
                  </span>
                  <code className="ml-2 text-sm bg-zinc-200 dark:bg-zinc-600 px-2 py-1 rounded">
                    {place.tag}
                  </code>
                </div>

                {place.aliases.length > 0 && (
                  <div className="mb-2">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      Aliases:
                    </span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {place.aliases.map((alias, aliasIndex) => (
                        <span
                          key={aliasIndex}
                          className="text-sm bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded"
                        >
                          {alias}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {place.notes && (
                  <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-600 rounded border-l-4 border-blue-500">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      Notes:
                    </span>
                    <p className="text-sm mt-1 text-zinc-700 dark:text-zinc-300">
                      {place.notes}
                    </p>
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
