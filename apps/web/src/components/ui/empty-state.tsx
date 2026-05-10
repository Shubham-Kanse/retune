"use client";

import { Clock, FileText, Mail, Target } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface EmptyStateProps {
  type: "resume" | "cover-letter" | "strategy";
  onRetry?: () => void;
}

export function EmptyState({ type, onRetry }: EmptyStateProps) {
  const config = {
    resume: {
      icon: FileText,
      title: "Resume pending",
      subtitle: "Generation in progress",
      description:
        "Your tailored resume is being crafted. This typically takes 2–5 minutes depending on your profile complexity.",
      tip: "You can come back to this application anytime to view your resume once it's ready.",
    },
    "cover-letter": {
      icon: Mail,
      title: "Cover letter pending",
      subtitle: "Coming soon",
      description:
        "Your personalized cover letter is being written to match the specific role and company.",
      tip: "Cover letters are generated after the resume to ensure perfect alignment with your qualifications.",
    },
    strategy: {
      icon: Target,
      title: "Application strategy pending",
      subtitle: "Final step",
      description:
        "Your application strategy with networking tips, LinkedIn recommendations, and follow-up guidance is being prepared.",
      tip: "This comprehensive strategy helps you stand out from other applicants and maximize your chances.",
    },
  };

  const { icon: Icon, title, subtitle, description, tip } = config[type];

  const [pulseIcon, setPulseIcon] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setPulseIcon(false);
    }, 2000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in zoom-in-95 duration-400">
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-muted rounded-full blur opacity-40" />
        <Icon
          className={`relative h-14 w-14 text-muted-foreground/60 transition-all${pulseIcon ? " animate-pulse" : ""}`}
        />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4 font-medium">
        <Clock className="inline h-3 w-3 mr-1" />
        {subtitle}
      </p>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm leading-relaxed">{description}</p>
      <div className="mb-6 max-w-sm bg-muted/50 border border-border p-3 text-xs text-muted-foreground rounded-sm">
        {tip}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="rt-btn text-sm">
          Regenerate
        </button>
      )}
    </div>
  );
}
