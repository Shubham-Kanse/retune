"use client";

import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
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
  return { score, label: "Strong", color: "#2d8a5e" };
}

const PW_RULES = [
  { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
  { label: "Uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "Lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "Number", test: (pw: string) => /[0-9]/.test(pw) },
];

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="pointer-events-none fixed -right-32 md:-right-48 top-20 md:top-28 w-[500px] h-[500px] md:w-[700px] md:h-[700px] animate-orb-rotate scale-125 opacity-80 z-0">
        <Image src="/images/orb.png" alt="" width={700} height={700} className="w-full h-full" priority unoptimized />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-border bg-white/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
          <Link href="/" className="inline-flex items-center font-serif text-lg font-semibold tracking-tight text-foreground mb-8">
            Retuned
          </Link>

          <h1 className="font-serif text-4xl font-normal leading-tight text-foreground mb-2">Create your account.</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Start with 3 free generations. No credit card required.
          </p>

          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full py-2.5 px-4 mb-6 rounded-lg border border-border bg-white hover:bg-muted transition-colors text-sm font-medium text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
              <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
            </svg>
            Continue with Google
          </a>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="fullName" className="block text-xs font-medium text-muted-foreground mb-2">
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
              <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-2">
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
              <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-2">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
                        style={{ color: rule.test(password) ? "#2d8a5e" : "#6b6b6b" }}
                      >
                        <span>{rule.test(password) ? "✓" : "○"}</span>
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground">Data processing consent</p>
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
                    className="w-4 h-4 accent-brand"
                    required
                  />
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              Already a member? <Link href="/login" className="text-foreground hover:underline">Sign in</Link>
            </p>

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
      </main>
    </div>
  );
}
