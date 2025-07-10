import { notFound } from "next/navigation";

interface JournalEntry {
  _id: string;
  title: string;
  versions: { text: string; timestamp: string }[];
  timestamp: string;
}

export default async function JournalEntryPage({
  params,
}: {
  params: { id: string };
}) {
  const res = await fetch(`http://localhost:3001/journal/mongo/${params.id}`, {
    cache: "no-store",
  });

  if (!res.ok) return notFound();

  const entry: JournalEntry = await res.json();

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">{entry.title}</h1>
      <p className="text-gray-600 text-sm mb-2">
        {entry.versions && entry.versions.length > 0
          ? new Date(
              entry.versions[entry.versions.length - 1].timestamp
            ).toLocaleString()
          : "Unknown date"}
      </p>
      <article className="text-lg leading-relaxed whitespace-pre-wrap">
        {entry.versions && entry.versions.length > 0
          ? entry.versions[entry.versions.length - 1].text
          : "No content available."}
      </article>
    </main>
  );
}
