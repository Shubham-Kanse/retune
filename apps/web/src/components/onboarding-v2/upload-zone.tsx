"use client";

import { useCallback, useRef, useState } from "react";

interface UploadZoneProps {
  onUpload: (file: File) => void;
  onPaste: (text: string) => void;
  showPasteFallback: boolean;
}

export function UploadZone({ onUpload, onPaste, showPasteFallback }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [showPaste, setShowPaste] = useState(showPasteFallback);
  const [pasteText, setPasteText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onUpload(file);
    },
    [onUpload],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onUpload(file);
    },
    [onUpload],
  );

  const handlePasteSubmit = () => {
    if (pasteText.trim().length >= 300) onPaste(pasteText.trim());
  };

  if (showPaste) {
    return (
      <div className="w-full max-w-lg space-y-4">
        <p className="text-sm text-stone-400">
          If you're having trouble with the file, you can paste your resume text directly here
          instead — just copy everything and paste it in.
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste your resume text here..."
          className="h-48 w-full rounded-xl bg-stone-800 p-4 text-sm text-stone-200 placeholder-stone-500 outline-none ring-1 ring-stone-700 focus:ring-indigo-500 resize-none"
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handlePasteSubmit}
            disabled={pasteText.trim().length < 300}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={() => setShowPaste(false)}
            className="text-sm text-stone-500 hover:text-stone-300"
          >
            Try uploading again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg space-y-4">
      <button
        type="button"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        aria-label="Upload resume file"
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-colors ${dragging ? "border-indigo-500 bg-indigo-500/10" : "border-stone-700 hover:border-stone-500 hover:bg-stone-800/50"}`}
      >
        <svg
          className="mb-4 h-10 w-10 text-stone-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>Upload resume</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
          />
        </svg>
        <p className="text-sm font-medium text-stone-300">
          Drop your resume here or click to browse
        </p>
        <p className="mt-1 text-xs text-stone-500">PDF, DOCX, or TXT — max 10MB</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.rtf"
        onChange={handleFileSelect}
        className="hidden"
      />

      {showPasteFallback && (
        <button
          type="button"
          onClick={() => setShowPaste(true)}
          className="w-full text-center text-sm text-stone-500 hover:text-stone-300 transition-colors"
        >
          Or paste your resume text instead
        </button>
      )}
    </div>
  );
}
