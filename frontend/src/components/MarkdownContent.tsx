"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  materialLight,
  materialDark,
} from "react-syntax-highlighter/dist/cjs/styles/prism";

interface MarkdownContentProps {
  content: string;
  isDarkMode?: boolean;
}

export default function MarkdownContent({
  content,
  isDarkMode = false,
}: MarkdownContentProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set()
  );

  const generateHeadingId = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const toggleSection = (headingId: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(headingId)) {
      newCollapsed.delete(headingId);
    } else {
      newCollapsed.add(headingId);
    }
    setCollapsedSections(newCollapsed);
  };

  const isSectionCollapsed = (headingId: string) => {
    return collapsedSections.has(headingId);
  };

  const isAnyParentCollapsed = (parentIds: string[]) => {
    return parentIds.some((parentId) => collapsedSections.has(parentId));
  };

  // Split content into sections based on all heading levels
  const splitContentIntoSections = (content: string) => {
    const lines = content.split("\n");
    const sections: Array<{
      headingId: string | null;
      headingLevel: number | null;
      content: string;
      parentIds: string[];
    }> = [];
    let currentSection: string[] = [];
    let currentHeadingId: string | null = null;
    let currentHeadingLevel: number | null = null;

    // Track parent headings for hierarchical collapsing
    const headingStack: Array<{ id: string; level: number }> = [];

    // Track used IDs to ensure uniqueness
    const usedIds = new Map<string, number>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if this is any heading (h1-h6)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        // Save the previous section
        if (currentSection.length > 0 || currentHeadingId !== null) {
          // Exclude the current heading from its own parent list
          const parentIds = headingStack
            .filter((h) => h.id !== currentHeadingId)
            .map((h) => h.id);
          sections.push({
            headingId: currentHeadingId,
            headingLevel: currentHeadingLevel,
            content: currentSection.join("\n"),
            parentIds,
          });
        }

        // Start new section with the current heading
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        let baseId = generateHeadingId(text);

        // Ensure unique ID by appending number if needed
        if (usedIds.has(baseId)) {
          const count = usedIds.get(baseId)!;
          usedIds.set(baseId, count + 1);
          currentHeadingId = `${baseId}-${count}`;
        } else {
          usedIds.set(baseId, 1);
          currentHeadingId = baseId;
        }

        currentHeadingLevel = level;
        currentSection = [line];

        // Update heading stack for hierarchy
        // Remove headings that are at the same level or deeper
        while (
          headingStack.length > 0 &&
          headingStack[headingStack.length - 1].level >= level
        ) {
          headingStack.pop();
        }

        // Add current heading to stack
        if (currentHeadingId) {
          headingStack.push({ id: currentHeadingId, level });
        }
      } else {
        currentSection.push(line);
      }
    }

    // Add the last section
    if (currentSection.length > 0) {
      const parentIds = headingStack
        .filter((h) => currentHeadingId && h.id !== currentHeadingId)
        .map((h) => h.id);
      sections.push({
        headingId: currentHeadingId,
        headingLevel: currentHeadingLevel,
        content: currentSection.join("\n"),
        parentIds,
      });
    }

    return sections;
  };

  return (
    <div className="prose dark:prose-invert max-w-none">
      {splitContentIntoSections(content).map((section, index) => {
        // Hide section if any parent is collapsed
        if (isAnyParentCollapsed(section.parentIds)) {
          return null;
        }

        const isCollapsed = section.headingId
          ? isSectionCollapsed(section.headingId)
          : false;

        return (
          <div key={index}>
            <ReactMarkdown
              components={{
                h1: ({ children }) => {
                  const text = String(children);
                  const id = generateHeadingId(text);

                  return (
                    <h1
                      id={id}
                      className={`text-3xl font-extrabold my-6 text-red-900 dark:text-red-100 scroll-mt-20`}
                    >
                      <button
                        onClick={() => toggleSection(id)}
                        className="relative flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                      >
                        <span
                          className={`absolute -left-8 pt-1.5 material-symbols-outlined transform transition-transform opacity-60 ${
                            isSectionCollapsed(id)
                              ? "rotate-[-90deg]"
                              : "rotate-0"
                          }`}
                        >
                          keyboard_arrow_down
                        </span>
                        {children}
                      </button>
                    </h1>
                  );
                },
                h2: ({ children }) => {
                  const text = String(children);
                  const id = generateHeadingId(text);

                  return (
                    <h2
                      id={id}
                      className={`text-2xl font-extrabold mt-8 mb-4 text-blue-800 dark:text-blue-300 scroll-mt-20`}
                    >
                      <button
                        onClick={() => toggleSection(id)}
                        className="relative flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                      >
                        <span
                          className={`absolute -left-8 pt-1 material-symbols-outlined transform transition-transform opacity-40 ${
                            isSectionCollapsed(id)
                              ? "rotate-[-90deg]"
                              : "rotate-0"
                          }`}
                        >
                          keyboard_arrow_down
                        </span>
                        <span className="opacity-40">##</span> {children}
                      </button>
                    </h2>
                  );
                },
                h3: ({ children }) => {
                  const text = String(children);
                  const id = generateHeadingId(text);

                  return (
                    <h3
                      id={id}
                      className="text-xl font-semibold mt-5 mb-4 text-blue-800 dark:text-blue-400 scroll-mt-20"
                    >
                      <button
                        onClick={() => toggleSection(id)}
                        className="relative flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                      >
                        <span
                          className={`absolute -left-8 pt-0.75 material-symbols-outlined transform transition-transform opacity-40 ${
                            isSectionCollapsed(id)
                              ? "rotate-[-90deg]"
                              : "rotate-0"
                          }`}
                        >
                          keyboard_arrow_down
                        </span>
                        <span className="opacity-40">###</span> {children}
                      </button>
                    </h3>
                  );
                },
                h4: ({ children }) => {
                  const text = String(children);
                  const id = generateHeadingId(text);

                  return (
                    <h4
                      id={id}
                      className="text-base font-medium my-2 text-gray-700 dark:text-gray-300 scroll-mt-20"
                    >
                      <button
                        onClick={() => toggleSection(id)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                      >
                        <span
                          className={`material-symbols-outlined transform transition-transform opacity-60 ${
                            isSectionCollapsed(id)
                              ? "rotate-[-90deg]"
                              : "rotate-0"
                          }`}
                        >
                          keyboard_arrow_down
                        </span>
                        {children}
                      </button>
                    </h4>
                  );
                },
                h5: ({ children }) => {
                  const text = String(children);
                  const id = generateHeadingId(text);

                  return (
                    <h5
                      id={id}
                      className="text-base italic font-medium my-2 text-gray-700 dark:text-gray-300 scroll-mt-20"
                    >
                      <button
                        onClick={() => toggleSection(id)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                      >
                        <span
                          className={`material-symbols-outlined transform transition-transform opacity-60 ${
                            isSectionCollapsed(id)
                              ? "rotate-[-90deg]"
                              : "rotate-0"
                          }`}
                        >
                          keyboard_arrow_down
                        </span>
                        {children}
                      </button>
                    </h5>
                  );
                },
                h6: ({ children }) => {
                  const text = String(children);
                  const id = generateHeadingId(text);

                  return (
                    <h6
                      id={id}
                      className="text-base font-medium my-2 text-gray-700 dark:text-gray-300 scroll-mt-20"
                    >
                      <button
                        onClick={() => toggleSection(id)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                      >
                        <span
                          className={`material-symbols-outlined transform transition-transform opacity-60 ${
                            isSectionCollapsed(id)
                              ? "rotate-[-90deg]"
                              : "rotate-0"
                          }`}
                        >
                          keyboard_arrow_down
                        </span>
                        {children}
                      </button>
                    </h6>
                  );
                },
                p: ({ children }) => (
                  <p className="font-serif mt-2 mb-2 text-gray-700 dark:text-gray-300 leading-relaxed">
                    {children}
                  </p>
                ),
                code: ({ className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || "");
                  const language = match ? match[1] : "";
                  const inline = !match;

                  if (!inline && language) {
                    return (
                      <div className="my-4">
                        <SyntaxHighlighter
                          language={language}
                          style={isDarkMode ? materialDark : materialLight}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: "1rem",
                            borderRadius: "0.375rem",
                            fontSize: "0.875rem",
                            lineHeight: "1.5",
                            fontFamily:
                              'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          }}
                          codeTagProps={{
                            style: {
                              fontFamily:
                                'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                            },
                          }}
                          {...props}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }

                  return (
                    <code
                      className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm font-mono text-orange-700 dark:text-orange-300"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                ul: ({ children }) => (
                  <ul className="font-serif list-disc pl-4 mb-6 text-gray-700 dark:text-gray-300">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="font-serif list-decimal pl-4 mb-6 text-gray-700 dark:text-gray-300">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="font-serif mb-2 pl-2">{children}</li>
                ),
                strong: ({ children }) => (
                  <strong className="font-serif font-bold text-gray-800 dark:text-gray-200">
                    {children}
                  </strong>
                ),
                em: ({ children }) => (
                  <em className="font-serif italic text-gray-600 dark:text-gray-400">
                    {children}
                  </em>
                ),
                hr: () => (
                  <hr className="my-6 border-gray-300 dark:border-gray-600" />
                ),
              }}
            >
              {isCollapsed ? section.content.split("\n")[0] : section.content}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}
