"use client";

import type { EducationEntry, ExperienceEntry, SkillEntry } from "@/lib/profile-domain/contracts";
import type { DisplayCard, Pill } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";
import { Check, Upload } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState } from "react";

// ─── QuickReplyChips ──────────────────────────────────────────────────────────

interface QuickReplyChipsProps {
  pills: Pill[];
  onSelect: (pill: Pill) => void;
  disabled?: boolean;
}

export function QuickReplyChips({ pills, onSelect, disabled }: QuickReplyChipsProps) {
  if (!pills.length) return null;
  return (
    <motion.div
      className="flex flex-wrap gap-2"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.2 }}
    >
      {pills.map((pill, i) => {
        const disabledUntilSelected =
          pill.action === "confirm_field" &&
          pill.label === "Continue" &&
          !pills.some((candidate) => candidate.field === pill.field && candidate.action === "set_field" && candidate.selected);
        const isDisabled = disabled || disabledUntilSelected;

        return (
          <motion.button
            key={`${pill.field}-${pill.value}-${i}`}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(pill)}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            whileHover={isDisabled ? {} : { scale: 1.04, y: -1 }}
            whileTap={isDisabled ? {} : { scale: 0.96 }}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-[0.8125rem] font-medium transition-colors",
              pill.selected
                ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
                : pill.recommended
                  ? "border-brand/30 bg-brand/10 text-brand hover:bg-brand/15"
                  : "border-border bg-card text-foreground hover:bg-muted",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {pill.selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {pill.label}
            {pill.recommended && !pill.selected && <span className="ml-1 text-[0.65rem]">Recommended</span>}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

// ─── ProfileDisplayCard ──────────────────────────────────────────────────────

export function ProfileDisplayCard({ card }: { card: DisplayCard }) {
  return (
    <motion.div
      className="rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-md"
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.72rem] uppercase tracking-widest text-muted-foreground">
            {card.type.replace("_", " ")}
          </p>
          <p className="mt-1 text-[0.92rem] font-medium text-card-foreground">{card.title}</p>
          {card.subtitle && <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{card.subtitle}</p>}
        </div>
        {card.status && (
          <span className="rounded-full bg-muted px-2 py-1 text-[0.68rem] text-muted-foreground">
            {card.status.replace("_", " ")}
          </span>
        )}
      </div>

      {card.metadata?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from(new Set(card.metadata)).slice(0, 12).map((item, idx) => (
            <span key={`${item}-${idx}`} className="rounded-full bg-muted px-2.5 py-1 text-[0.75rem] text-muted-foreground">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: "experience" | "skills" | "education";
  data: unknown;
}

export function SectionCard({ section, data }: SectionCardProps) {
  const label =
    section === "experience" ? "Work History" : section === "skills" ? "Skills" : "Education";
  return (
    <motion.div
      className="rounded-2xl border border-border bg-card/80 overflow-hidden backdrop-blur-md"
      style={{
        boxShadow:
          "rgba(14,63,126,0.04) 0px 0px 0px 1px, rgba(42,51,69,0.04) 0px 1px 1px -0.5px, rgba(42,51,70,0.04) 0px 3px 3px -1.5px",
      }}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="px-4 py-2.5 border-b border-border bg-muted/45">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
      </div>
      <div className="p-4 space-y-3 max-h-52 overflow-y-auto">
        {section === "experience" && <ExperienceList items={data as ExperienceEntry[]} />}
        {section === "skills" && (
          <SkillsList
            data={data as { tier1: SkillEntry[]; tier2: SkillEntry[]; tier3: SkillEntry[] }}
          />
        )}
        {section === "education" && <EducationList items={data as EducationEntry[]} />}
      </div>
    </motion.div>
  );
}

function ExperienceList({ items }: { items: ExperienceEntry[] }) {
  return (
    <div className="space-y-3">
      {items.map((exp, i) => (
        <div key={`${exp.company}-${exp.title}-${exp.startDate ?? i}`}>
          <p className="text-[0.875rem] font-medium text-card-foreground">{exp.title}</p>
          <p className="text-[0.8125rem] text-muted-foreground">
            {exp.company}
            {(exp.startDate || exp.endDate) && (
              <span className="text-muted-foreground/60">
                {" "}
                · {exp.startDate ?? "?"} – {exp.endDate ?? "Present"}
              </span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

function SkillsList({
  data,
}: { data: { tier1: SkillEntry[]; tier2: SkillEntry[]; tier3: SkillEntry[] } }) {
  const all = [...data.tier1, ...data.tier2, ...data.tier3];
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((s) => (
        <span
          key={s.name}
          className="px-2.5 py-1 rounded-full bg-muted text-[0.75rem] text-muted-foreground font-medium"
        >
          {s.name}
        </span>
      ))}
    </div>
  );
}

function EducationList({ items }: { items: EducationEntry[] }) {
  return (
    <div className="space-y-3">
      {items.map((edu, i) => (
        <div key={`${edu.institution}-${edu.degree}-${edu.endDate ?? i}`}>
          <p className="text-[0.875rem] font-medium text-card-foreground">{edu.degree}</p>
          <p className="text-[0.8125rem] text-muted-foreground">
            {edu.institution}
            {(edu.endDate || edu.status) && (
              <span className="text-muted-foreground/60"> · {edu.endDate ?? edu.status}</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── UploadDropzone ───────────────────────────────────────────────────────────

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onFile, disabled }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <motion.div
      className={cn(
        "rounded-2xl border-2 border-dashed p-5 text-center cursor-pointer transition-all duration-200",
        isDragging ? "border-brand bg-brand/10" : "border-border bg-card/70",
        !disabled && "hover:border-brand/60 hover:bg-brand/10",
        disabled && "opacity-60 cursor-not-allowed",
      )}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (!disabled) {
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }
      }}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center">
          <Upload className="w-4 h-4 text-brand" />
        </div>
        <div>
          <p className="text-[0.875rem] font-medium text-foreground">
            {disabled ? "Reading your resume…" : "Drop your resume here"}
          </p>
          <p className="text-[0.75rem] text-muted-foreground mt-0.5">PDF or DOCX · max 10MB</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </motion.div>
  );
}

// ─── CompletionAnimation ──────────────────────────────────────────────────────

export function CompletionAnimation() {
  return (
    <motion.div
      className="flex flex-col items-center justify-center gap-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{
          background: "radial-gradient(circle at 35% 35%, var(--color-brand-light), var(--color-brand) 60%, var(--color-primary))",
          boxShadow: "0 4px 24px color-mix(in srgb, var(--color-brand) 35%, transparent)",
        }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 360, damping: 22 }}
      >
        <Check className="w-9 h-9 text-white" strokeWidth={2.5} />
      </motion.div>
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.3 }}
      >
        <p className="text-[2rem] font-semibold tracking-tight text-foreground leading-tight mb-1">
          Welcome to retune
        </p>
        <p className="text-[0.875rem] text-muted-foreground">Taking you to your dashboard…</p>
      </motion.div>
    </motion.div>
  );
}
