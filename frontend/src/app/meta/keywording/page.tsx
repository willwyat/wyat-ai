"use client";

import { useEffect, useState } from "react";
import { API_URL, WYAT_API_KEY } from "@/lib/config";

type KeywordingBestPractices = {
  _id: string;
  type: string;
  title: string;
  version: string;
  content: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
};

export default function KeywordingPage() {
  const [data, setData] = useState<KeywordingBestPractices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/meta/keywording-best-practices`, {
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
          <span className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
            v{data.version}
          </span>
        </div>

        <div className="bg-zinc-100 dark:bg-zinc-800 rounded px-6 py-5">
          <div className="prose dark:prose-invert max-w-none">
            <div
              className="whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: data.content.replace(/\n/g, "<br/>"),
              }}
            />
          </div>
        </div>

        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <p>Created: {new Date(data.createdAt).toLocaleDateString()}</p>
          <p>Updated: {new Date(data.updatedAt).toLocaleDateString()}</p>
          <p>Visibility: {data.visibility}</p>
        </div>
      </div>
    </div>
  );
}
