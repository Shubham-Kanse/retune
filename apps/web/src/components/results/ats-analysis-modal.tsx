"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ATSAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  atsScore: number | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  keywordCoverage: { required: number; preferred: number } | null;
}

export function ATSAnalysisModal({
  isOpen,
  onClose,
  atsScore,
  matchedKeywords,
  missingKeywords,
  keywordCoverage,
}: ATSAnalysisModalProps) {
  if (!isOpen) return null;

  const scoreColor =
    atsScore && atsScore >= 85
      ? "text-emerald-500"
      : atsScore && atsScore >= 70
        ? "text-amber-500"
        : "text-red-500";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />

      {/* Bottom Sheet Modal */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-border",
          "max-h-[80vh] overflow-y-auto",
          "lg:hidden",
          "transform transition-transform duration-300",
          isOpen ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">ATS Analysis</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-muted transition-colors"
            aria-label="Close ATS analysis"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          {/* Score Badge */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
              ATS Score
            </p>
            <div className={cn("text-5xl font-bold", scoreColor)}>
              {atsScore !== null ? `${atsScore}%` : "-"}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {atsScore && atsScore >= 85
                ? "✓ Excellent ATS compatibility"
                : atsScore && atsScore >= 70
                  ? "⚠ Fair ATS compatibility"
                  : "✗ Poor ATS compatibility"}
            </p>
          </div>

          {/* Keyword Coverage */}
          {keywordCoverage && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Keyword Coverage</h3>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-muted-foreground">Required</span>
                    <span className="text-xs font-medium">{keywordCoverage.required}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${Math.min(100, keywordCoverage.required)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-muted-foreground">Preferred</span>
                    <span className="text-xs font-medium">{keywordCoverage.preferred}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${Math.min(100, keywordCoverage.preferred)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Matched Keywords */}
          {matchedKeywords.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Matched Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {matchedKeywords.slice(0, 10).map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  >
                    ✓ {keyword}
                  </span>
                ))}
                {matchedKeywords.length > 10 && (
                  <span className="text-xs text-muted-foreground pt-1">
                    +{matchedKeywords.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Missing Keywords */}
          {missingKeywords.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Missing Keywords</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Consider adding these to improve ATS compatibility:
              </p>
              <div className="flex flex-wrap gap-2">
                {missingKeywords.slice(0, 8).map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-red-500/10 text-red-700 dark:text-red-400"
                  >
                    ✗ {keyword}
                  </span>
                ))}
                {missingKeywords.length > 8 && (
                  <span className="text-xs text-muted-foreground pt-1">
                    +{missingKeywords.length - 8} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Close button */}
          <button onClick={onClose} className="w-full rt-btn mt-4">
            Close
          </button>
        </div>
      </div>
    </>
  );
}
