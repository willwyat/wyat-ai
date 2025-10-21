"use client";

import React from "react";
import { Document as PDFDocument, Page as PDFPage, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  fileUrl: string;
  pageNumber: number;
  onLoadSuccess: (data: { numPages: number }) => void;
  options?: any;
}

export default function PDFViewer({
  fileUrl,
  pageNumber,
  onLoadSuccess,
  options,
}: PDFViewerProps) {
  return (
    <PDFDocument
      file={fileUrl}
      options={options}
      onLoadSuccess={onLoadSuccess}
      loading={
        <div className="text-center py-8 text-gray-500">Loading PDF...</div>
      }
      error={
        <div className="text-center py-8 text-red-600">
          Failed to load PDF. Please try again.
        </div>
      }
    >
      <PDFPage
        pageNumber={pageNumber}
        renderTextLayer={true}
        renderAnnotationLayer={true}
        className="shadow-lg"
      />
    </PDFDocument>
  );
}
