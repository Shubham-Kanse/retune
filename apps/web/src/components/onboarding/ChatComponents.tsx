"use client";

import type { EducationEntry, ExperienceEntry, SkillEntry } from "@/lib/profile-domain/contracts";
import { cn } from "@/lib/utils";
import { Check, Upload } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState } from "react";

// ─── QuickReplyChips ──────────────────────────────────────────────────────────

interface QuickReplyChipsProps {
  chips: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function QuickReplyChips({ chips, onSelect, disabled }: QuickReplyChipsProps) {
  if (!chips.length) return null;
  return (
    <motion.div
      className="flex flex-wrap gap-2"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.2 }}
    >
      {chips.map((chip, i) => (
        <motion.button
          key={chip}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(chip)}
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 + i * 0.05, duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          whileHover={disabled ? {} : { scale: 1.04, y: -1 }}
          whileTap={disabled ? {} : { scale: 0.96 }}
          className={cn(
            "px-4 py-2 rounded-full border text-[0.8125rem] font-medium transition-colors",
            "border-transparent bg-[#1a1a1a] text-white",
            "hover:bg-[#333]",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {chip}
        </motion.button>
      ))}
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
      className="rounded-2xl border border-[#e8e5e0] bg-white overflow-hidden"
      style={{
        boxShadow:
          "rgba(14,63,126,0.04) 0px 0px 0px 1px, rgba(42,51,69,0.04) 0px 1px 1px -0.5px, rgba(42,51,70,0.04) 0px 3px 3px -1.5px",
      }}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="px-4 py-2.5 border-b border-[#f0ede8] bg-[#fafaf9]">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-[#bbb]">
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
          <p className="text-[0.875rem] font-medium text-[#1a1a1a]">{exp.title}</p>
          <p className="text-[0.8125rem] text-[#6b6b6b]">
            {exp.company}
            {(exp.startDate || exp.endDate) && (
              <span className="text-[#bbb]">
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
          className="px-2.5 py-1 rounded-full bg-[#f0ede8] text-[0.75rem] text-[#555] font-medium"
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
          <p className="text-[0.875rem] font-medium text-[#1a1a1a]">{edu.degree}</p>
          <p className="text-[0.8125rem] text-[#6b6b6b]">
            {edu.institution}
            {(edu.endDate || edu.status) && (
              <span className="text-[#bbb]"> · {edu.endDate ?? edu.status}</span>
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
        isDragging ? "border-[#b84ed1] bg-[#f3e8ff]" : "border-[#e5e2dd] bg-[#fafaf9]",
        !disabled && "hover:border-[#b84ed1] hover:bg-[#f3e8ff]",
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
        <div className="w-9 h-9 rounded-xl bg-[#f3e8ff] flex items-center justify-center">
          <Upload className="w-4 h-4 text-[#7e22ce]" />
        </div>
        <div>
          <p className="text-[0.875rem] font-medium text-[#1a1a1a]">
            {disabled ? "Reading your resume…" : "Drop your resume here"}
          </p>
          <p className="text-[0.75rem] text-[#aaa] mt-0.5">PDF or DOCX · max 10MB</p>
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
          background: "radial-gradient(circle at 35% 35%, #e9d5ff, #b84ed1 55%, #7e22ce)",
          boxShadow: "0 4px 24px rgba(126,34,206,0.4)",
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
        <p className="font-serif text-[2rem] text-[#1a1a1a] leading-tight mb-1">
          Welcome to retune
        </p>
        <p className="text-[0.875rem] text-[#6b6b6b]">Taking you to your dashboard…</p>
      </motion.div>
    </motion.div>
  );
}
