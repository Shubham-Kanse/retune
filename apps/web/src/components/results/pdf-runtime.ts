"use client";

import { Document, Page, pdfjs } from "react-pdf";

// Use workerSrc instead of constructing/destroying Worker instances ourselves.
// This avoids lifecycle warnings during remounts/HMR:
// "PDFWorker.create - the worker is being destroyed..."
if (typeof window !== "undefined") {
  // Worker file is served from /public/pdf.worker.min.mjs.
  // The cache-bust ?v= parameter ensures the browser reloads when pdfjs-dist is updated.
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjs.version}`;
}

export { Document as PdfDocument, Page as PdfPage };
export type { DocumentProps, PageProps } from "react-pdf";
