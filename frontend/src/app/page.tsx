"use client";

import Link from "next/link";
import { API_URL } from "@/lib/config";
import { useNav } from "@/contexts/NavContext";

export default function Home() {
  const { navigationSections } = useNav();

  return (
    <div className="min-h-screen bg-background text-foreground p-6 pb-20 md:pb-6">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 font-serif">Wyat AI</h1>
          <p className="text-xl text-gray-600 mb-2">
            Your Personal AI Assistant
          </p>
          <p className="text-sm text-gray-500">API URL: {API_URL}</p>
        </header>

        <main className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {navigationSections.map((section, sectionIndex) => (
            <div
              key={sectionIndex}
              className="bg-white rounded-lg shadow-md p-6"
            >
              <h2 className="text-xl font-semibold mb-4 font-serif text-gray-800">
                {section.title}
              </h2>
              <nav className="space-y-3">
                {section.links.map((link, linkIndex) => (
                  <Link
                    key={linkIndex}
                    href={link.href}
                    className="block p-3 rounded-md hover:bg-gray-50 transition-colors group"
                  >
                    <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                      {link.label}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {link.description}
                    </div>
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </main>

        <footer className="mt-16 text-center text-gray-500 text-sm">
          <p>Built with Next.js, Rust, and MongoDB</p>
        </footer>
      </div>
    </div>
  );
}
