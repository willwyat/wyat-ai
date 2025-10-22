"use client";

import React from "react";
import { Document as PDFDocument, Page as PDFPage, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Set up PDF.js worker - use local node_modules version for reliability
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
}

interface PDFViewerProps {
  fileUrl: string;
  pageNumber?: number; // Optional for single-page mode
  onLoadSuccess: (data: { numPages: number }) => void;
  options?: any;
  continuousScroll?: boolean; // New prop for continuous scrolling
}

export default function PDFViewer({
  fileUrl,
  pageNumber = 1,
  onLoadSuccess,
  options,
  continuousScroll = true, // Default to continuous scroll
}: PDFViewerProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [numPages, setNumPages] = React.useState<number>(0);

  const handleLoadError = (error: Error) => {
    console.error("PDF load error:", error);
    setError(error.message || "Failed to load PDF");
  };

  const handleLoadSuccess = (data: { numPages: number }) => {
    setError(null);
    setNumPages(data.numPages);
    onLoadSuccess(data);
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-800">
            <strong>PDF Error:</strong> {error}
          </p>
          <p className="text-xs text-red-600 mt-1">
            Check console for details. Ensure the PDF URL is accessible.
          </p>
        </div>
      )}
      <PDFDocument
        file={fileUrl}
        options={options}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={handleLoadError}
        loading={
          <div className="text-center py-8 text-gray-500">
            <div className="animate-pulse">Loading PDF...</div>
            <p className="text-xs mt-2 text-gray-400">{fileUrl}</p>
          </div>
        }
      >
        {continuousScroll ? (
          // Continuous scroll mode: render all pages
          <div className="space-y-4">
            {Array.from(new Array(numPages), (_, index) => (
              <div key={`page_${index + 1}`} className="flex justify-center">
                <PDFPage
                  pageNumber={index + 1}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-lg"
                  loading={
                    <div className="text-center py-8 text-gray-400">
                      Loading page {index + 1}...
                    </div>
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          // Single page mode: render only the current page
          <PDFPage
            pageNumber={pageNumber}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg"
            loading={
              <div className="text-center py-8 text-gray-400">
                Loading page {pageNumber}...
              </div>
            }
          />
        )}
      </PDFDocument>
    </div>
  );
}
