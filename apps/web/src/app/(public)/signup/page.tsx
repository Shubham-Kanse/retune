"use client";

import { LegalModal } from "@/components/ui/legal-modal";
import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 1) return { score, label: "Weak", color: "#dc2626" };
  if (score <= 3) return { score, label: "Fair", color: "#d97706" };
  return { score, label: "Strong", color: "#16a34a" };
}

const PW_RULES = [
  { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
  { label: "Uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "Lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "Number", test: (pw: string) => /[0-9]/.test(pw) },
];

const VALUE_PROPS = [
  "Tailored resume for every application",
  "ATS optimised, ready in under 3 minutes",
  "Cover letter + application strategy included",
];

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [legalDoc, setLegalDoc] = useState<"terms" | "privacy" | null>(null);
  const [processorConsents, setProcessorConsents] = useState({
    anthropic: false,
    openai: false,
    retune: false,
  });
  const allConsentsGranted = Object.values(processorConsents).every(Boolean);
  const emailRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef(false);

  const strength = getPasswordStrength(password);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitRef.current) return;
    submitRef.current = true;
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          fullName: form.get("fullName"),
          processorConsents,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Could not create account.");
      }
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      emailRef.current?.focus();
    } finally {
      setLoading(false);
      submitRef.current = false;
    }
  }

  return (
    <div className="min-h-screen flex bg-[#faf8f5]">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#2d8a5e] rounded-r-[3rem]" />
        <Link href="/" className="flex items-center gap-2.5 relative z-10">
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="text-white"
          >
            <rect x="3" y="15" width="2" height="2" fill="currentColor" />
            <rect x="3" y="13" width="2" height="2" fill="currentColor" />
            <rect x="3" y="11" width="2" height="2" fill="currentColor" />
            <rect x="3" y="9" width="2" height="2" fill="currentColor" />
            <rect x="3" y="7" width="2" height="2" fill="currentColor" />
            <rect x="3" y="5" width="2" height="2" fill="currentColor" />
            <rect x="5" y="3" width="2" height="2" fill="currentColor" />
            <rect x="7" y="3" width="2" height="2" fill="currentColor" />
            <rect x="9" y="3" width="2" height="2" fill="currentColor" />
            <rect x="11" y="5" width="2" height="2" fill="currentColor" />
            <rect x="11" y="7" width="2" height="2" fill="currentColor" />
            <rect x="11" y="15" width="2" height="2" fill="currentColor" />
            <rect x="9" y="13" width="2" height="2" fill="currentColor" />
            <rect x="13" y="13" width="2" height="2" fill="currentColor" />
            <rect x="7" y="11" width="2" height="2" fill="currentColor" />
            <rect x="15" y="11" width="2" height="2" fill="currentColor" />
          </svg>
          <span className="text-sm font-semibold text-white">Retuned</span>
        </Link>
        <div className="relative z-10 max-w-md">
          <p className="text-xs font-medium tracking-wider uppercase mb-6 text-white/50">
            Start here
          </p>
          <h1 className="font-serif text-5xl font-normal text-white leading-[1.1] mb-8">
            Your architect
            <br />
            <span className="text-white/50">is waiting.</span>
          </h1>
          <ul className="space-y-4 mb-8">
            {VALUE_PROPS.map((prop) => (
              <li key={prop} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm text-white/70 leading-relaxed">{prop}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs font-medium text-white/50">2 free generations. No credit card.</p>
        </div>
        <div className="text-xs text-white/30 relative z-10">Retuned © 2026</div>
      </div>

      {/* Right panel */}
      <div className="flex-1 lg:max-w-[520px] flex flex-col items-center justify-center px-8 py-12 overflow-y-auto">
        <div className="w-full max-w-sm py-8">
          <Link href="/" className="flex items-center gap-2 mb-10 lg:hidden text-[#2d8a5e]">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="3" y="15" width="2" height="2" fill="currentColor" />
              <rect x="3" y="13" width="2" height="2" fill="currentColor" />
              <rect x="3" y="11" width="2" height="2" fill="currentColor" />
              <rect x="3" y="9" width="2" height="2" fill="currentColor" />
              <rect x="3" y="7" width="2" height="2" fill="currentColor" />
              <rect x="3" y="5" width="2" height="2" fill="currentColor" />
              <rect x="5" y="3" width="2" height="2" fill="currentColor" />
              <rect x="7" y="3" width="2" height="2" fill="currentColor" />
              <rect x="9" y="3" width="2" height="2" fill="currentColor" />
              <rect x="11" y="5" width="2" height="2" fill="currentColor" />
              <rect x="11" y="7" width="2" height="2" fill="currentColor" />
              <rect x="11" y="15" width="2" height="2" fill="currentColor" />
              <rect x="9" y="13" width="2" height="2" fill="currentColor" />
              <rect x="13" y="13" width="2" height="2" fill="currentColor" />
              <rect x="7" y="11" width="2" height="2" fill="currentColor" />
              <rect x="15" y="11" width="2" height="2" fill="currentColor" />
            </svg>
            <span className="text-sm font-semibold text-[#1a1a1a]">Retuned</span>
          </Link>

          <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-2">Create account</h2>
          <p className="text-sm text-[#6b6b6b] mb-8">
            Already a member?{" "}
            <Link href="/login" className="text-[#2d8a5e] font-medium hover:underline">
              Sign in
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="fullName" className="block text-xs font-medium text-[#6b6b6b] mb-2">
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                autoComplete="name"
                disabled={loading}
                placeholder="Leonardo da Vinci"
                className="rt-input"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-[#6b6b6b] mb-2">
                Email Address
              </label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={loading}
                placeholder="you@example.com"
                className="rt-input"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-[#6b6b6b] mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="••••••••"
                  className="rt-input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#6b6b6b] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {password.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{ background: i <= strength.score ? strength.color : "#e5e2dd" }}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] font-medium" style={{ color: strength.color }}>
                    {strength.label}
                  </p>
                  <ul className="space-y-1">
                    {PW_RULES.map((rule) => (
                      <li
                        key={rule.label}
                        className="text-[10px] flex items-center gap-2"
                        style={{ color: rule.test(password) ? "#16a34a" : "#999" }}
                      >
                        <span>{rule.test(password) ? "✓" : "○"}</span>
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-3 border-t border-[#e5e2dd]">
              <p className="text-xs font-medium text-[#6b6b6b]">Data processing consent</p>
              {[
                { key: "anthropic", label: "Anthropic (AI generation)" },
                { key: "openai", label: "OpenAI (processing)" },
                { key: "retune", label: "Retuned (platform)" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={processorConsents[key as keyof typeof processorConsents]}
                    onChange={(e) =>
                      setProcessorConsents((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[#2d8a5e]"
                    required
                  />
                  <span className="text-xs text-[#6b6b6b] group-hover:text-[#1a1a1a] transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>

            {error && (
              <p
                role="alert"
                className="text-xs text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !allConsentsGranted}
              className="rt-btn w-full py-3"
            >
              {loading ? (
                "Creating account…"
              ) : (
                <>
                  <span>Create account</span> <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <LegalModal
        isOpen={legalDoc != null}
        doc={legalDoc ?? "terms"}
        onClose={() => setLegalDoc(null)}
      />
    </div>
  );
}
