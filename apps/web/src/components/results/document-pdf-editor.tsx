"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, ArrowUp, Loader2, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import type { DocumentProps, PageProps } from "./pdf-runtime";

const PdfDocument = dynamic<DocumentProps>(
  () => import("./pdf-runtime").then((m) => m.PdfDocument as React.ComponentType<DocumentProps>),
  { ssr: false },
);

const PdfPage = dynamic<PageProps>(
  () => import("./pdf-runtime").then((m) => m.PdfPage as React.ComponentType<PageProps>),
  { ssr: false },
);

type DocumentType = "resume" | "cover_letter";

/* ── Helpers ─────────────────────────────────────────────────────────── */

function resolveContentEndpoint(appId: string, type: DocumentType) {
  return type === "resume"
    ? `/api/applications/${appId}/resume`
    : `/api/applications/${appId}/cover-letter`;
}

function resolvePdfEndpoint(appId: string, type: DocumentType, v: number) {
  const file = type === "resume" ? "resume.pdf" : "cover_letter.pdf";
  return `/api/generate/${appId}/${file}?v=${v}`;
}

function findAllIndices(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let start = 0;
  while (start <= haystack.length) {
    const idx = haystack.indexOf(needle, start);
    if (idx < 0) break;
    out.push(idx);
    start = idx + Math.max(needle.length, 1);
  }
  return out;
}

function normalizeForMatching(input: string) {
  let out = "";
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === "*" || ch === "_" || ch === "`" || ch === "#") continue;
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      out += " ";
      map.push(i);
      prevSpace = true;
      continue;
    }
    out += ch;
    map.push(i);
    prevSpace = false;
  }
  return { text: out.trim(), map };
}

function scoreCandidate(
  docText: string,
  from: number,
  needleLen: number,
  beforeProbe: string,
  afterProbe: string,
) {
  const bw = docText.slice(Math.max(0, from - 160), from);
  const aw = docText.slice(from + needleLen, from + needleLen + 160);
  let s = 0;
  if (beforeProbe && bw.endsWith(beforeProbe)) s += 4;
  else if (beforeProbe && bw.includes(beforeProbe)) s += 2;
  if (afterProbe && aw.startsWith(afterProbe)) s += 4;
  else if (afterProbe && aw.includes(afterProbe)) s += 2;
  return s;
}

function locateSelectionInDocument(
  doc: string,
  sel: string,
  before: string,
  after: string,
): { from: number; to: number } | null {
  const candidates = findAllIndices(doc, sel);
  const bp = before.trim().slice(-100);
  const ap = after.trim().slice(0, 100);

  if (candidates.length === 1) return { from: candidates[0]!, to: candidates[0]! + sel.length };
  if (candidates.length > 1) {
    let best = { from: candidates[0]!, score: -1 };
    for (const f of candidates) {
      const s = scoreCandidate(doc, f, sel.length, bp, ap);
      if (s > best.score) best = { from: f, score: s };
    }
    return { from: best.from, to: best.from + sel.length };
  }

  // Normalized fallback
  const nd = normalizeForMatching(doc);
  const ns = normalizeForMatching(sel).text;
  if (!ns) return null;
  const nb = normalizeForMatching(before).text.slice(-100);
  const na = normalizeForMatching(after).text.slice(0, 100);
  const nc = findAllIndices(nd.text, ns);
  if (!nc.length) return null;

  let best = { from: nc[0]!, score: -1 };
  for (const f of nc) {
    const s = scoreCandidate(nd.text, f, ns.length, nb, na);
    if (s > best.score) best = { from: f, score: s };
  }
  const oStart = nd.map[best.from];
  const oEnd = nd.map[best.from + ns.length - 1];
  if (oStart == null || oEnd == null) return null;
  return { from: oStart, to: oEnd + 1 };
}

/* ── Component ───────────────────────────────────────────────────────── */

export function DocumentPdfEditor({
  applicationId,
  documentType,
  initialContent,
  onContentUpdate,
}: {
  applicationId: string;
  documentType: DocumentType;
  initialContent: string;
  onContentUpdate?: (content: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const [content, setContent] = useState(initialContent);
  const [pdfVersion, setPdfVersion] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(612);
  const [saving, setSaving] = useState(false);

  // Selection + toolbar state
  const [selection, setSelection] = useState<{
    text: string;
    before: string;
    after: string;
    rect: { top: number; left: number; width: number };
  } | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pdfUrl = useMemo(
    () => resolvePdfEndpoint(applicationId, documentType, pdfVersion),
    [applicationId, documentType, pdfVersion],
  );

  useEffect(() => setContent(initialContent), [initialContent]);
  useEffect(() => {
    setPdfLoading(true);
    setPdfError(null);
  }, [pdfUrl]);

  // Auto-focus textarea when input opens
  useEffect(() => {
    if (showInput) promptRef.current?.focus();
  }, [showInput]);

  // Measure available width for PDF pages — fill the container
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      // px-4 = 16px each side
      const w = Math.max(320, Math.floor(el.clientWidth - 32));
      setPageWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setShowInput(false);
    setInstruction("");
    setError(null);
    setLoading(false);
  }, []);

  // Detect text selection on the PDF text layer
  const detectSelection = useCallback(() => {
    const root = rootRef.current;
    const scroll = scrollRef.current;
    const sel = window.getSelection();
    if (!root || !scroll || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;

    const startEl =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const textLayer = startEl?.closest(".react-pdf__Page__textContent") as HTMLElement | null;
    if (!textLayer || !root.contains(textLayer)) return;

    const text = range.toString().trim();
    if (!text || text.length < 2) return;

    // Get context
    const beforeRange = document.createRange();
    beforeRange.setStart(textLayer, 0);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const afterRange = document.createRange();
    afterRange.setStart(range.endContainer, range.endOffset);
    afterRange.setEnd(textLayer, textLayer.childNodes.length);

    // Position relative to the scroll container
    const rangeRect = range.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();

    setSelection({
      text,
      before: beforeRange.toString().slice(-600),
      after: afterRange.toString().slice(0, 600),
      rect: {
        top: rangeRect.bottom - scrollRect.top + scroll.scrollTop + 8,
        left: rangeRect.left - scrollRect.left + rangeRect.width / 2,
        width: rangeRect.width,
      },
    });
    setShowInput(false);
    setInstruction("");
    setError(null);
  }, []);

  // Global listeners
  useEffect(() => {
    const onUp = () => requestAnimationFrame(detectSelection);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-inline-toolbar]")) return;
      if (!rootRef.current?.contains(target as Node)) clearSelection();
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [detectSelection, clearSelection]);

  async function persist(next: string) {
    setSaving(true);
    try {
      const res = await fetch(resolveContentEndpoint(applicationId, documentType), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as { error?: string })?.error ?? "Failed to save");
      }
      setPdfVersion((v) => v + 1);
    } finally {
      setSaving(false);
    }
  }

  async function handleRewrite() {
    if (!selection || !instruction.trim() || loading) return;

    const snap = { ...selection };
    const located = locateSelectionInDocument(content, snap.text, snap.before, snap.after);
    if (!located) {
      setError("Couldn't locate this text in the document. Try selecting a different passage.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/refine/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          selectedText: snap.text,
          instruction: `Apply this custom change request to the selected text only.\n${instruction.trim()}`,
          paragraphText: `${snap.before}${snap.text}${snap.after}`,
          before: snap.before,
          after: snap.after,
          fullDocument: content,
          contextBefore: snap.before,
          contextAfter: snap.after,
          action: "custom",
          customInstruction: instruction.trim(),
          documentType,
        }),
      });
      const data = (await res.json()) as { replacementText?: string; error?: string };
      if (!res.ok || !data.replacementText) throw new Error(data.error ?? "Rewrite failed");

      const next = `${content.slice(0, located.from)}${data.replacementText}${content.slice(located.to)}`;
      setContent(next);
      onContentUpdate?.(next);
      await persist(next);
      clearSelection();
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={rootRef} className="relative flex h-full flex-col overflow-hidden bg-muted/30">
      {/* Status indicators */}
      {pdfError && (
        <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {pdfError}
        </div>
      )}

      {(pdfLoading || saving) && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 border bg-background px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          {saving ? "Updating…" : "Rendering…"}
        </div>
      )}

      {/* PDF viewport */}
      <div ref={scrollRef} className="relative flex-1 overflow-auto px-4 py-4">
        <div className="mx-auto" style={{ maxWidth: pageWidth }}>
          <PdfDocument
            file={pdfUrl}
            loading={null}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              setPdfLoading(false);
              setPdfError(null);
            }}
            onLoadError={(err) => {
              setPdfLoading(false);
              setPdfError(err instanceof Error ? err.message : "Failed to load PDF");
            }}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div
                key={`page-${i + 1}`}
                className="mb-6 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] last:mb-0 dark:shadow-[0_1px_4px_rgba(0,0,0,0.3)]"
              >
                <PdfPage
                  pageNumber={i + 1}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer
                />
              </div>
            ))}
          </PdfDocument>

          {!pdfLoading && numPages === 0 && !pdfError && (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No pages to display
            </div>
          )}
        </div>

        {/* ── Inline toolbar ── */}
        {selection && (
          <div
            data-inline-toolbar
            className="absolute z-30"
            style={{
              top: selection.rect.top,
              left: Math.max(
                16,
                Math.min(selection.rect.left, (scrollRef.current?.clientWidth ?? 600) - 200),
              ),
            }}
          >
            {!showInput ? (
              <button
                type="button"
                onClick={() => setShowInput(true)}
                className="inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-muted"
              >
                <Sparkles className="h-3 w-3" />
                Edit with AI
              </button>
            ) : (
              <div className="w-[340px] border border-border bg-background shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    AI Edit
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                <div className="p-2">
                  <div className="mb-2 max-h-16 overflow-auto border border-border/50 bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    "
                    {selection.text.length > 120
                      ? `${selection.text.slice(0, 120)}…`
                      : selection.text}
                    "
                  </div>

                  <div className="flex gap-1.5">
                    <textarea
                      ref={promptRef}
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && instruction.trim()) {
                          e.preventDefault();
                          void handleRewrite();
                        }
                        if (e.key === "Escape") clearSelection();
                      }}
                      rows={1}
                      className="flex-1 resize-none border border-border bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60"
                      placeholder="Describe the change…"
                    />
                    <button
                      type="button"
                      disabled={!instruction.trim() || loading}
                      onClick={() => void handleRewrite()}
                      className={cn(
                        "inline-flex h-auto w-8 shrink-0 items-center justify-center border border-border transition-colors",
                        instruction.trim() && !loading
                          ? "bg-foreground text-background hover:bg-foreground/90"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {loading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ArrowUp className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
