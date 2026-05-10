"use client";

import { Check, Crown, Sparkles, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PLANS = [
  {
    id: "free",
    name: "Starter",
    price: "$0",
    period: "forever",
    credits: "30 credits",
    features: [
      "3 resume generations",
      "3 refinements per application",
      "ATS optimization",
      "Cover letter generation",
    ],
    cta: null,
    highlight: false,
    icon: Zap,
    iconColor: "#5fc3ff",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$20",
    period: "/month",
    credits: "500 credits",
    features: [
      "~50 resume generations",
      "10 refinements per application",
      "Priority generation queue",
      "Advanced ATS optimization",
      "Application strategy insights",
      "Email support",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
    icon: Crown,
    iconColor: "#f59e0b",
  },
  {
    id: "max",
    name: "Max",
    price: "$50",
    period: "/month",
    credits: "1,500 credits",
    features: [
      "~150 resume generations",
      "Unlimited refinements",
      "Priority generation queue",
      "Advanced ATS optimization",
      "Application strategy insights",
      "Priority email support",
      "Early access to new features",
    ],
    cta: "Go Max",
    highlight: false,
    icon: Sparkles,
    iconColor: "#b84ed1",
  },
] as const;

export function UpgradeButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const modal = open && (
    <>
      <div
        className="fixed inset-0 z-[9998] bg-[#1a1a1a]/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-0 z-[9999] overflow-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-[#faf8f5] border border-[#e5e2dd] rounded-2xl w-full max-w-3xl my-8 shadow-xl">
            {/* Header */}
            <div className="px-8 pt-8 pb-4 flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl text-[#1a1a1a]">Choose your plan</h2>
                <p className="text-sm text-[#6b6b6b] mt-1">
                  1 generation = 10 credits · 1 refinement = 1 credit
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[#9a9690] hover:text-[#1a1a1a] transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Plan cards */}
            <div className="px-8 pb-8 pt-4">
              <div className="grid gap-4 md:grid-cols-3">
                {PLANS.map((plan) => {
                  const Icon = plan.icon;
                  return (
                    <div
                      key={plan.id}
                      className={`relative rounded-xl p-5 flex flex-col ${
                        plan.highlight
                          ? "bg-white border-2 border-[#2d8a5e] shadow-md"
                          : "bg-white border border-[#e5e2dd]"
                      }`}
                    >
                      {plan.highlight && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-[#2d8a5e] text-white text-[10px] font-semibold px-3 py-0.5 rounded-full uppercase tracking-wide">
                          Most popular
                        </span>
                      )}

                      {/* Icon + name */}
                      <div className="flex items-center gap-2 mb-3">
                        <div
                          className="w-8 h-8 rounded-lg bg-[#f0ede8] flex items-center justify-center"
                          style={{ color: plan.iconColor }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-semibold text-[#1a1a1a]">{plan.name}</h3>
                      </div>

                      {/* Price */}
                      <div className="mb-1">
                        <span className="font-serif text-3xl text-[#1a1a1a]">{plan.price}</span>
                        <span className="text-xs text-[#6b6b6b] ml-1">{plan.period}</span>
                      </div>
                      <p className="text-xs text-[#2d8a5e] font-medium mb-4">{plan.credits}</p>

                      {/* Features */}
                      <ul className="space-y-2 text-xs text-[#1a1a1a] flex-1 mb-5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <Check className="h-3.5 w-3.5 mt-0.5 text-[#2d8a5e] shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA */}
                      {plan.cta ? (
                        <a
                          href={`mailto:hello@retuned.cv?subject=Upgrade to ${plan.name}`}
                          className={`block text-center text-xs font-medium py-2.5 rounded-lg transition-all ${
                            plan.highlight
                              ? "bg-[#2d8a5e] text-white hover:bg-[#236e4a]"
                              : "bg-[#f0ede8] text-[#1a1a1a] hover:bg-[#e5e2dd]"
                          }`}
                        >
                          {plan.cta}
                        </a>
                      ) : (
                        <div className="text-center text-xs text-[#9a9690] py-2.5">
                          Current plan
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-[#9a9690] text-center mt-6">
                Online payment coming soon — email us to activate immediately. All plans include ATS-optimized resume, cover letter, and strategy generation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "text-xs text-[#2d8a5e] hover:underline underline-offset-2"
            : "flex items-center gap-1.5 bg-[#2d8a5e]/10 text-[#2d8a5e] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#2d8a5e]/20 transition-colors"
        }
      >
        {compact ? (
          "Upgrade"
        ) : (
          <>
            <Crown className="h-3.5 w-3.5" /> Upgrade
          </>
        )}
      </button>
      {mounted && createPortal(modal, document.body)}
    </>
  );
}
