"use client";

import { useEffect, useState } from "react";
import MarkdownContent from "@/components/MarkdownContent";
import { usePreferencesStore } from "@/stores/preferences-store";

export default function Privacy() {
  const [content, setContent] = useState("");
  const isDarkMode = usePreferencesStore((state) => state.isDarkMode);

  useEffect(() => {
    // Set page title
    document.title = "Privacy Policy - Wyat AI";

    // Load markdown content
    fetch("/privacy-policy.md")
      .then((res) => res.text())
      .then((text) => setContent(text))
      .catch((err) => console.error("Failed to load privacy policy:", err));
  }, []);

  if (!content) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-gray-500 dark:text-gray-400">
          Loading privacy policy...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <MarkdownContent content={content} isDarkMode={isDarkMode} />
    </div>
  );
}
