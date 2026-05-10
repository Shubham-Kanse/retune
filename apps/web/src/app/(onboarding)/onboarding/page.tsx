"use client";

import { ColorOrb } from "@/components/ui/color-orb";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUp, Check, MessageSquare, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "intro" | "choice" | "extracting" | "collection" | "done";

interface ProfileData {
  fullName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
  visaStatus?: string;
  currentTitle?: string;
  relocationPreferences?: string[];
  targetRoles?: string[];
  experienceLevel?: string;
  experience?: Array<Record<string, unknown>>;
  education?: Array<Record<string, unknown>>;
  certifications?: string[];
  projects?: Array<Record<string, unknown>>;
  skillsTier1?: Array<Record<string, unknown>>;
  skillsTier2?: Array<Record<string, unknown>>;
  skillsTier3?: Array<Record<string, unknown>>;
}

interface CollectionStep {
  id: string;
  question: string;
  type: "chips" | "multi-chips" | "text";
  field: keyof ProfileData;
  options?: Array<{ label: string; value: string; sublabel?: string }>;
  placeholder?: string;
  optional?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ORB_TONES = {
  base: "oklch(96% 0.01 120)",
  accent1: "oklch(60% 0.16 155)",
  accent2: "oklch(82% 0.12 155)",
  accent3: "oklch(55% 0.12 170)",
};
const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };
const SPRING_POP = { type: "spring" as const, stiffness: 420, damping: 28 };

// ─── Collection Steps Definition ──────────────────────────────────────────────
const ALL_STEPS: CollectionStep[] = [
  {
    id: "fullName",
    question: "What's your full name?",
    type: "text",
    field: "fullName",
    placeholder: "e.g. Jane Smith",
  },
  {
    id: "currentTitle",
    question: "What's your current job title?",
    type: "text",
    field: "currentTitle",
    placeholder: "e.g. Senior Software Engineer",
  },
  {
    id: "experienceLevel",
    question: "How many years of professional experience do you have?",
    type: "chips",
    field: "experienceLevel",
    options: [
      { label: "Entry Level", value: "entry", sublabel: "0–2 years" },
      { label: "Early Career", value: "early", sublabel: "2–4 years" },
      { label: "Mid-Level", value: "mid", sublabel: "4–7 years" },
      { label: "Senior", value: "senior", sublabel: "7–10 years" },
      { label: "Staff / Lead", value: "staff", sublabel: "10+ years" },
    ],
  },
  {
    id: "targetRoles",
    question: "What roles are you targeting next?",
    type: "multi-chips",
    field: "targetRoles",
    options: [
      { label: "Software Engineer", value: "Software Engineer" },
      { label: "Backend Engineer", value: "Backend Engineer" },
      { label: "Frontend Engineer", value: "Frontend Engineer" },
      { label: "Full Stack Engineer", value: "Full Stack Engineer" },
      { label: "AI / ML Engineer", value: "AI/ML Engineer" },
      { label: "Data Engineer", value: "Data Engineer" },
      { label: "DevOps / SRE", value: "DevOps/SRE" },
      { label: "Product Manager", value: "Product Manager" },
      { label: "Engineering Manager", value: "Engineering Manager" },
      { label: "Designer", value: "Designer" },
    ],
  },
  {
    id: "linkedin",
    question: "What's your LinkedIn profile URL?",
    type: "text",
    field: "linkedin",
    placeholder: "https://linkedin.com/in/yourname",
    optional: true,
  },
  {
    id: "visaStatus",
    question: "What's your work authorization status?",
    type: "chips",
    field: "visaStatus",
    options: [
      { label: "Citizen", value: "Citizen" },
      { label: "Permanent Resident", value: "Permanent Resident" },
      { label: "Work Visa", value: "Work Visa" },
      { label: "Student Visa", value: "Student Visa" },
      { label: "Need Sponsorship", value: "Need Sponsorship" },
    ],
  },
  {
    id: "relocationPreferences",
    question: "Are you open to relocation?",
    type: "chips",
    field: "relocationPreferences",
    options: [
      { label: "Yes, anywhere", value: "open" },
      { label: "Remote only", value: "remote" },
      { label: "Same city / country", value: "local" },
      { label: "Not right now", value: "no" },
    ],
  },
  {
    id: "location",
    question: "Where are you currently based?",
    type: "text",
    field: "location",
    placeholder: "e.g. Dublin, Ireland",
  },
  {
    id: "email",
    question: "What's the best email to reach you?",
    type: "text",
    field: "email",
    placeholder: "you@example.com",
  },
  {
    id: "phone",
    question: "What's your phone number?",
    type: "text",
    field: "phone",
    placeholder: "+353 ...",
    optional: true,
  },
];

// ─── Intro Phase ──────────────────────────────────────────────────────────────
function IntroPhase({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setStep(1), 800),
      setTimeout(() => setStep(2), 2000),
      setTimeout(() => setStep(3), 3400),
      setTimeout(onComplete, 5200),
    ];
    return () => t.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <motion.div
      className="flex-1 flex flex-col items-center justify-center gap-6"
      exit={{ opacity: 0, y: -20 }}
      transition={SPRING}
    >
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING_POP, delay: 0.1 }}
      >
        <ColorOrb dimension="120px" tones={ORB_TONES} spinDuration={16} />
      </motion.div>

      <div className="text-center space-y-3 min-h-[100px]">
        <AnimatePresence>
          {step >= 1 && (
            <motion.p key="hello" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="font-serif text-3xl md:text-4xl text-[#1a1a1a]">
              Hello
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {step >= 2 && (
            <motion.p key="tagline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="text-sm text-[#6b6b6b] max-w-xs mx-auto">
              I&apos;m retune — your career companion.
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {step >= 3 && (
            <motion.p key="action" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="text-sm text-[#6b6b6b] max-w-xs mx-auto">
              Let&apos;s build your professional profile together.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Choice Phase ─────────────────────────────────────────────────────────────
function ChoicePhase({ onFileClick, onScratch }: { onFileClick: () => void; onScratch: () => void }) {
  return (
    <motion.div className="flex-1 flex flex-col items-center pt-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }} transition={SPRING}>
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING_POP}>
        <ColorOrb dimension="48px" tones={ORB_TONES} spinDuration={18} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, ...SPRING }} className="text-center mt-6 mb-10">
        <h1 className="font-serif text-3xl md:text-4xl text-[#1a1a1a] leading-tight tracking-tight mb-2">How would you like to start?</h1>
        <p className="text-sm text-[#6b6b6b] max-w-md">Upload your resume and I&apos;ll extract everything, or we&apos;ll build it step by step.</p>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-4 w-full max-w-lg">
        <motion.button type="button" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, ...SPRING }} onClick={onFileClick} className="group relative bg-white border border-[#e5e2dd] rounded-2xl p-6 text-left hover:border-[#2d8a5e] hover:shadow-md transition-all duration-200 cursor-pointer">
          <span className="absolute top-3 right-3 text-[10px] font-medium uppercase tracking-wider bg-[#d4f5e0] text-[#2d8a5e] px-2 py-0.5 rounded-full">Recommended</span>
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#d4f5e0] mb-4 group-hover:scale-105 transition-transform">
            <Upload className="w-[18px] h-[18px] text-[#2d8a5e]" />
          </div>
          <p className="font-medium text-[#1a1a1a] text-sm mb-1">Upload resume</p>
          <p className="text-xs text-[#6b6b6b] leading-relaxed">I&apos;ll read it and extract your details instantly.</p>
          <p className="text-[10px] text-[#999] mt-2">PDF or DOCX, max 10MB</p>
        </motion.button>

        <motion.button type="button" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, ...SPRING }} onClick={onScratch} className="group bg-white border border-[#e5e2dd] rounded-2xl p-6 text-left hover:border-[#ccc8c3] hover:shadow-md transition-all duration-200 cursor-pointer">
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#f0ede8] mb-4 group-hover:scale-105 transition-transform">
            <MessageSquare className="w-[18px] h-[18px] text-[#6b6b6b]" />
          </div>
          <p className="font-medium text-[#1a1a1a] text-sm mb-1">Build from scratch</p>
          <p className="text-xs text-[#6b6b6b] leading-relaxed">Quick step-by-step — takes about 2 minutes.</p>
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Extracting Phase ─────────────────────────────────────────────────────────
function ExtractingPhase({ fileName }: { fileName: string }) {
  return (
    <motion.div className="flex-1 flex flex-col items-center justify-center gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -20 }} transition={SPRING}>
      <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}>
        <ColorOrb dimension="80px" tones={ORB_TONES} spinDuration={8} />
      </motion.div>
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-[#1a1a1a]">Reading your resume...</p>
        <p className="text-xs text-[#6b6b6b]">{fileName}</p>
      </div>
    </motion.div>
  );
}

// ─── Collection Phase ─────────────────────────────────────────────────────────
function CollectionPhase({
  steps,
  currentStepIndex,
  profile,
  onSelect,
  onTextSubmit,
  onSkip,
  onSkipAll,
}: {
  steps: CollectionStep[];
  currentStepIndex: number;
  profile: ProfileData;
  onSelect: (field: keyof ProfileData, value: string | string[]) => void;
  onTextSubmit: (field: keyof ProfileData, value: string) => void;
  onSkip: () => void;
  onSkipAll: () => void;
}) {
  const [textValue, setTextValue] = useState("");
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const step = steps[currentStepIndex];

  if (!step) return null;

  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <motion.div className="flex-1 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING}>
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-[#999] font-medium">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
          {step.optional && (
            <button type="button" onClick={onSkip} className="text-xs text-[#999] hover:text-[#1a1a1a] transition-colors">
              Skip
            </button>
          )}
        </div>
        <div className="h-1 bg-[#e5e2dd] rounded-full overflow-hidden">
          <motion.div className="h-full bg-[#2d8a5e] rounded-full" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={SPRING} />
        </div>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={step.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING} className="flex-1">
          <div className="flex gap-3 mb-8">
            <div className="flex-shrink-0 mt-0.5">
              <ColorOrb dimension="28px" tones={ORB_TONES} spinDuration={20} />
            </div>
            <p className="text-base text-[#1a1a1a] font-medium leading-relaxed">{step.question}</p>
          </div>

          {/* Chips (single select) */}
          {step.type === "chips" && step.options && (
            <div className="flex flex-wrap gap-2">
              {step.options.map((opt, i) => (
                <motion.button
                  key={opt.value}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, ...SPRING }}
                  onClick={() => onSelect(step.field, opt.value)}
                  className="group flex flex-col items-start px-4 py-3 rounded-xl border border-[#e5e2dd] bg-white hover:border-[#2d8a5e] hover:bg-[#f8fffe] transition-all duration-150 cursor-pointer"
                >
                  <span className="text-sm font-medium text-[#1a1a1a] group-hover:text-[#2d8a5e]">{opt.label}</span>
                  {opt.sublabel && <span className="text-[11px] text-[#999]">{opt.sublabel}</span>}
                </motion.button>
              ))}
            </div>
          )}

          {/* Multi-select chips */}
          {step.type === "multi-chips" && step.options && (
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
                {step.options.map((opt, i) => {
                  const selected = multiSelected.includes(opt.value);
                  return (
                    <motion.button
                      key={opt.value}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, ...SPRING }}
                      onClick={() => {
                        setMultiSelected((prev) =>
                          selected ? prev.filter((v) => v !== opt.value) : [...prev, opt.value],
                        );
                      }}
                      className={cn(
                        "px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 cursor-pointer",
                        selected
                          ? "border-[#2d8a5e] bg-[#d4f5e0] text-[#2d8a5e]"
                          : "border-[#e5e2dd] bg-white text-[#1a1a1a] hover:border-[#ccc8c3]",
                      )}
                    >
                      {selected && <Check className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />}
                      {opt.label}
                    </motion.button>
                  );
                })}
              </div>
              {multiSelected.length > 0 && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => {
                    onSelect(step.field, multiSelected);
                    setMultiSelected([]);
                  }}
                  className="rt-btn inline-flex items-center gap-2"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          )}

          {/* Text input */}
          {step.type === "text" && (
            <div className="space-y-3">
              <div className="flex items-end gap-2 bg-white border border-[#e5e2dd] rounded-xl px-3 py-2 focus-within:border-[#2d8a5e] focus-within:shadow-[0_0_0_3px_rgba(45,138,94,0.08)] transition-all">
                <input
                  type="text"
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && textValue.trim()) {
                      onTextSubmit(step.field, textValue.trim());
                      setTextValue("");
                    }
                  }}
                  placeholder={step.placeholder}
                  className="flex-1 text-sm text-[#1a1a1a] placeholder:text-[#999] outline-none bg-transparent py-1"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    if (textValue.trim()) {
                      onTextSubmit(step.field, textValue.trim());
                      setTextValue("");
                    }
                  }}
                  disabled={!textValue.trim()}
                  className={cn(
                    "flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all",
                    textValue.trim() ? "bg-[#2d8a5e] text-white hover:bg-[#236e4a]" : "bg-[#f0ede8] text-[#999]",
                  )}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Global skip — bottom, away from per-step skip */}
      <div className="mt-auto pt-6 text-center">
        <button type="button" onClick={onSkipAll} className="text-xs text-[#999] hover:text-[#1a1a1a] transition-colors">
          Skip for now →
        </button>
      </div>
    </motion.div>
  );
}

// ─── Done Phase ───────────────────────────────────────────────────────────────
function DonePhase({ profile, onConfirm }: { profile: ProfileData; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <motion.div className="flex-1 flex flex-col items-center justify-center" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING}>
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING_POP}>
        <ColorOrb dimension="64px" tones={ORB_TONES} spinDuration={12} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, ...SPRING }} className="text-center mt-6 mb-8">
        <h2 className="font-serif text-3xl md:text-4xl text-[#1a1a1a] leading-tight tracking-tight mb-2">You&apos;re all set</h2>
        <p className="text-sm text-[#6b6b6b] max-w-sm">Your profile is ready. You can add education, certifications, and more details later in the Profile section.</p>
      </motion.div>

      {/* Profile summary card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, ...SPRING }} className="bg-white border border-[#e5e2dd] rounded-2xl p-6 mb-8 w-full max-w-sm">
        <div className="flex items-center gap-4 mb-4">
          {profile.fullName && (
            <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center font-semibold text-sm rounded-xl bg-[#2d8a5e] text-white">
              {profile.fullName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            {profile.fullName && <p className="font-medium text-[#1a1a1a] text-sm">{profile.fullName}</p>}
            {profile.currentTitle && <p className="text-xs text-[#6b6b6b]">{profile.currentTitle}</p>}
            {profile.location && <p className="text-xs text-[#999]">{profile.location}</p>}
          </div>
        </div>
        {profile.targetRoles && profile.targetRoles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-[#e5e2dd]">
            {profile.targetRoles.map((role) => (
              <span key={role} className="text-[11px] px-2 py-0.5 rounded-full bg-[#f0ede8] text-[#6b6b6b]">{role}</span>
            ))}
          </div>
        )}
      </motion.div>

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, ...SPRING }}
        onClick={async () => { setConfirming(true); await onConfirm(); }}
        disabled={confirming}
        className="rt-btn flex items-center gap-2 w-full max-w-sm justify-center"
      >
        {confirming ? "Setting up..." : "Go to dashboard"}
        <ArrowRight className="h-4 w-4" />
      </motion.button>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [profile, setProfile] = useState<ProfileData>({});
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [collectionSteps, setCollectionSteps] = useState<CollectionStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Determine which steps to show ───────────────────────────────────────────
  const buildSteps = useCallback((missing: string[]) => {
    if (missing.length === 0) {
      // From scratch: show all steps
      setCollectionSteps(ALL_STEPS);
    } else {
      // Resume path: only missing fields
      setCollectionSteps(ALL_STEPS.filter((s) => missing.includes(s.id)));
    }
    setCurrentStep(0);
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (file: File) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|docx)$/i)) return;
    if (file.size > 10 * 1024 * 1024) return;

    setFileName(file.name);
    setPhase("extracting");

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/onboarding/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      if (data.extracted) {
        setProfile(data.extracted);
        setMissingFields(data.missing ?? []);
        buildSteps(data.missing ?? []);
      } else {
        // AI didn't return JSON — treat as from scratch
        buildSteps([]);
      }
      setPhase("collection");
    } catch {
      // Fallback to from-scratch on failure
      buildSteps([]);
      setPhase("collection");
    }
  }, [buildSteps]);

  const handleScratch = useCallback(() => {
    buildSteps([]);
    setPhase("collection");
  }, [buildSteps]);

  const handleSelect = useCallback((field: keyof ProfileData, value: string | string[]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setCurrentStep((prev) => prev + 1);
  }, []);

  const handleTextSubmit = useCallback((field: keyof ProfileData, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setCurrentStep((prev) => prev + 1);
  }, []);

  const handleSkip = useCallback(() => {
    setCurrentStep((prev) => prev + 1);
  }, []);

  // Check if collection is complete
  useEffect(() => {
    if (phase === "collection" && collectionSteps.length > 0 && currentStep >= collectionSteps.length) {
      setPhase("done");
    }
  }, [phase, currentStep, collectionSteps.length]);

  const handleConfirm = useCallback(async () => {
    await fetch("/api/onboarding/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    router.push("/dashboard");
  }, [profile, router]);

  const handleSkipAll = useCallback(async () => {
    await fetch("/api/onboarding/skip", { method: "POST" });
    router.push("/dashboard");
  }, [router]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="relative max-w-2xl mx-auto min-h-[calc(100vh-120px)] flex flex-col">
      {phase !== "done" && phase !== "intro" && phase !== "collection" && (
        <motion.button type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={handleSkipAll} className="absolute top-0 right-0 text-xs text-[#999] hover:text-[#1a1a1a] transition-colors z-10">
          Skip for now
        </motion.button>
      )}

      <AnimatePresence mode="wait">
        {phase === "intro" && <IntroPhase key="intro" onComplete={() => setPhase("choice")} />}
        {phase === "choice" && <ChoicePhase key="choice" onFileClick={() => fileInputRef.current?.click()} onScratch={handleScratch} />}
        {phase === "extracting" && <ExtractingPhase key="extracting" fileName={fileName} />}
        {phase === "collection" && (
          <CollectionPhase
            key="collection"
            steps={collectionSteps}
            currentStepIndex={currentStep}
            profile={profile}
            onSelect={handleSelect}
            onTextSubmit={handleTextSubmit}
            onSkip={handleSkip}
            onSkipAll={handleSkipAll}
          />
        )}
        {phase === "done" && <DonePhase key="done" profile={profile} onConfirm={handleConfirm} />}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
    </div>
  );
}
