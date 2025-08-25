"use client";

import Link from "next/link";

export default function MetaPage() {
  const metaSections = [
    {
      title: "Keywording Best Practices",
      description:
        "Guidelines and best practices for assigning high-quality keywords to journal entries",
      href: "/meta/keywording",
      color: "bg-blue-500 hover:bg-blue-600",
      icon: "🔑",
    },
    {
      title: "Tag Taxonomy",
      description:
        "Comprehensive tagging system and classification structure for organizing content",
      href: "/meta/tagging",
      color: "bg-green-500 hover:bg-green-600",
      icon: "🏷️",
    },
    {
      title: "Person Registry",
      description:
        "Registry of people with their tags, names, nicknames, and visibility settings",
      href: "/meta/persons",
      color: "bg-purple-500 hover:bg-purple-600",
      icon: "👥",
    },
    {
      title: "Place Registry",
      description:
        "Registry of places with their tags, names, aliases, notes, and visibility settings",
      href: "/meta/places",
      color: "bg-orange-500 hover:bg-orange-600",
      icon: "🌍",
    },
  ];

  return (
    <div className="min-h-screen">
      <div className="p-6 flex flex-col gap-8 max-w-screen-xl mx-auto">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Meta Data Management</h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400">
            Access and view system metadata, taxonomies, and registries
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {metaSections.map((section, index) => (
            <Link key={index} href={section.href} className="group block">
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-6 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all duration-200 hover:shadow-lg">
                <div className="flex items-start gap-4">
                  <div className="text-3xl">{section.icon}</div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {section.title}
                    </h2>
                    <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
                      {section.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Click to view →
                  </span>
                  <div
                    className={`w-8 h-8 rounded-full ${section.color} flex items-center justify-center text-white text-sm font-bold transition-transform group-hover:scale-110`}
                  >
                    →
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-8">
          <p>
            These pages display metadata from the MongoDB database, including
            system configurations, taxonomies, and registries used by the Wyat
            AI system.
          </p>
        </div>
      </div>
    </div>
  );
}
