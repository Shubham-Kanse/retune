"use client";

import { useState } from "react";
import { ProfileHealthBadge } from "./profile-health-badge";

interface AuditGap {
  field: string;
  reason?: string;
  simplified_question?: string;
  current_value?: string;
  confidence?: string;
  clarification_question?: string;
}

interface AuditContradiction {
  field: string;
  extracted_value: string;
  user_stated_value: string;
  resolution_question: string;
}

export interface AuditSummaryData {
  ready_to_commit: boolean;
  profile_quality_score: number;
  profile_quality_note: string;
  critical_gaps: AuditGap[];
  important_gaps: AuditGap[];
  contradictions: AuditContradiction[];
}

interface AuditSummaryProps {
  audit: AuditSummaryData;
  onCommit: () => void;
  onResolveCriticalGap?: (gap: AuditGap, answer: string) => void;
  onSkipCriticalGap?: (gap: AuditGap) => void;
  onResolveContradiction?: (contradiction: AuditContradiction, answer: "yes" | "no") => void;
  loading?: boolean;
}

/**
 * Stage 9 final review card. Shows the user their profile quality score,
 * any unresolved gaps, and a commit button. Critical gaps block commit;
 * important gaps and contradictions are surfaced but optional.
 */
export function AuditSummary({
  audit,
  onCommit,
  onResolveCriticalGap,
  onSkipCriticalGap,
  onResolveContradiction,
  loading,
}: AuditSummaryProps) {
  const blocked = !audit.ready_to_commit && audit.critical_gaps.length > 0;
  const firstCritical = audit.critical_gaps[0];
  const [editingField, setEditingField] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  const isUrlField = (field: string) => /url|link|website/i.test(field);

  const getUrlPattern = (field: string): { host: RegExp; hint: string } | null => {
    const f = field.toLowerCase();
    if (f.includes("linkedin")) return { host: /linkedin\.com/, hint: "LinkedIn URL (linkedin.com/in/...)" };
    if (f.includes("github")) return { host: /github\.com/, hint: "GitHub URL (github.com/...)" };
    if (f.includes("project")) return { host: /\./, hint: "valid project URL" };
    if (isUrlField(field)) return { host: /\./, hint: "valid URL" };
    return null;
  };

  const isValidUrl = (value: string, field: string) => {
    const pattern = getUrlPattern(field);
    if (!pattern) return true;
    try {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      return url.hostname.includes(".") && pattern.host.test(url.hostname);
    } catch {
      return false;
    }
  };

  const getValidationError = (field: string): string | null => {
    if (!inputValue.trim()) return null;
    const pattern = getUrlPattern(field);
    if (!pattern) return null;
    if (!isValidUrl(inputValue.trim(), field)) return `Please enter a valid ${pattern.hint}`;
    return null;
  };

  const canSubmit = (field: string) => {
    if (!inputValue.trim()) return false;
    if (getUrlPattern(field)) return isValidUrl(inputValue.trim(), field);
    return true;
  };

  const handleSubmit = (gap: AuditGap) => {
    if (!canSubmit(gap.field)) return;
    onResolveCriticalGap?.(gap, inputValue.trim());
    setInputValue("");
    setEditingField(null);
  };

  const isConfirmationGap = (g: AuditGap): boolean => {
    // Has a current value that just needs confirming
    if (g.current_value) return true;
    // Question text implies yes/no confirmation
    const q = (g.simplified_question || g.clarification_question || "").toLowerCase();
    return /\b(is this|is your|should|would you like|do you want|do you prefer|are you|were you)\b/.test(q)
      && !/\bwhat is\b/.test(q);
  };

  return (
    <div className="mt-3 space-y-3">
      {/* Score card */}
      <div className="rounded-xl border border-border bg-card/60 p-3">
        <ProfileHealthBadge score={audit.profile_quality_score} note={audit.profile_quality_note} />
      </div>

      {/* Critical gaps — one card per gap with inline input */}
      {audit.critical_gaps.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-red-400/80">
            Needs your input ({audit.critical_gaps.length})
          </p>
          {audit.critical_gaps.map((g) => (
            <div key={g.field} className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground/80">{labelize(g.field)}</p>
                <p className="text-xs text-muted-foreground">{g.simplified_question || g.reason}</p>
              </div>
              {editingField === g.field ? (
                <div className="space-y-2">
                  <input
                    type={getUrlPattern(g.field) ? "url" : "text"}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(g); }}
                    placeholder={getUrlPattern(g.field)?.hint ?? "Type your answer..."}
                    autoFocus
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-indigo-500/50"
                  />
                  {getValidationError(g.field) && (
                    <p className="text-[10px] text-red-400">{getValidationError(g.field)}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSubmit(g)}
                      disabled={!canSubmit(g.field)}
                      className="rounded-full bg-indigo-600/30 px-2.5 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-600/50 disabled:opacity-40"
                    >
                      Submit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingField(null); setInputValue(""); }}
                      className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {isConfirmationGap(g) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onResolveCriticalGap?.(g, g.current_value || "confirmed")}
                        className="rounded-full bg-indigo-600/30 px-2.5 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-600/50"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingField(g.field); setInputValue(""); }}
                        className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Edit
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { setEditingField(g.field); setInputValue(""); }}
                        className="rounded-full bg-indigo-600/30 px-2.5 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-600/50"
                      >
                        Answer
                      </button>
                      {onSkipCriticalGap && (
                        <button
                          type="button"
                          onClick={() => onSkipCriticalGap(g)}
                          className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Skip
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Important gaps — same inline input pattern */}
      {audit.important_gaps.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80">
            Could be sharper ({audit.important_gaps.length})
          </p>
          {audit.important_gaps.slice(0, 3).map((g) => (
            <div key={g.field} className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground/80">{labelize(g.field)}</p>
                <p className="text-xs text-muted-foreground">{g.clarification_question}</p>
              </div>
              {editingField === g.field ? (
                <div className="space-y-2">
                  <input
                    type={getUrlPattern(g.field) ? "url" : "text"}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(g); }}
                    placeholder={getUrlPattern(g.field)?.hint ?? "Type your answer..."}
                    autoFocus
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-indigo-500/50"
                  />
                  {getValidationError(g.field) && (
                    <p className="text-[10px] text-red-400">{getValidationError(g.field)}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSubmit(g)}
                      disabled={!canSubmit(g.field)}
                      className="rounded-full bg-indigo-600/30 px-2.5 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-600/50 disabled:opacity-40"
                    >
                      Submit
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingField(null); setInputValue(""); }}
                      className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {isConfirmationGap(g) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onResolveCriticalGap?.(g, g.current_value || "confirmed")}
                        className="rounded-full bg-indigo-600/30 px-2.5 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-600/50"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingField(g.field); setInputValue(""); }}
                        className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Edit
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { setEditingField(g.field); setInputValue(""); }}
                        className="rounded-full bg-indigo-600/30 px-2.5 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-600/50"
                      >
                        Answer
                      </button>
                      {onSkipCriticalGap && (
                        <button
                          type="button"
                          onClick={() => onSkipCriticalGap(g)}
                          className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Skip
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Contradictions */}
      {audit.contradictions.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 p-3">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Worth a second look
          </p>
          <div className="space-y-2.5">
            {audit.contradictions.map((c) => (
              <div key={c.field} className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{c.resolution_question}</p>
                {editingField === `contradiction:${c.field}` ? (
                  <div className="space-y-2">
                    <input
                      type={getUrlPattern(c.field) ? "url" : "text"}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) { onResolveContradiction?.(c, "no"); setEditingField(null); setInputValue(""); } }}
                      placeholder="Enter the correct value..."
                      autoFocus
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-indigo-500/50"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { onResolveContradiction?.(c, "no"); setEditingField(null); setInputValue(""); }}
                        disabled={!inputValue.trim()}
                        className="rounded-full bg-indigo-600/30 px-2.5 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-600/50 disabled:opacity-40"
                      >
                        Submit
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingField(null); setInputValue(""); }}
                        className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : onResolveContradiction && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onResolveContradiction(c, "yes")}
                      className="rounded-full bg-indigo-600/30 px-2.5 py-1 text-[11px] text-indigo-200 transition-colors hover:bg-indigo-600/50"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingField(`contradiction:${c.field}`); setInputValue(""); }}
                      className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action */}
      <button
        type="button"
        onClick={onCommit}
        disabled={loading || blocked}
        className="w-full rounded-xl border border-border bg-indigo-600/30 px-4 py-2.5 text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-600/50 disabled:opacity-40"
      >
        {loading
          ? "Saving your profile..."
          : audit.ready_to_commit
            ? "Looks good — take me to my dashboard"
            : firstCritical
              ? "Answer required fields first"
              : "Continue with what we have"}
      </button>
    </div>
  );
}

function labelize(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
