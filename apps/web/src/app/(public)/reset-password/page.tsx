"use client";

import { Logo } from "@/components/ui/logo";
import { FadeIn, PageEnter } from "@/lib/motion";
import { Check, Eye, EyeOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 1) return { score, label: "Weak", color: "bg-destructive" };
  if (score <= 3) return { score, label: "Fair", color: "bg-yellow-500" };
  return { score, label: "Strong", color: "bg-emerald-500" };
}

const PW_RULES = [
  { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
  { label: "Uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "Lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "Number", test: (pw: string) => /[0-9]/.test(pw) },
];

function SlideInField({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(10px)",
        transition: `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const submitRef = useRef(false);

  const pwStrength = getPasswordStrength(password);
  const pwValid = PW_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword;
  const canSubmit = pwValid && passwordsMatch && confirmPassword.length > 0;

  useEffect(() => {
    if (!done) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          router.push("/login");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [done, router]);

  if (!token) {
    return (
      <FadeIn delay={60}>
        <div>
          <p className="text-sm text-destructive mb-6">Invalid or missing reset token.</p>
          <Link
            href="/forgot-password"
            className="rt-btn inline-flex text-sm h-11 items-center px-6"
          >
            Request a new reset link
          </Link>
        </div>
      </FadeIn>
    );
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitRef.current || !canSubmit) return;
    submitRef.current = true;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const msg = d.error ?? "Something went wrong. Please try again.";
        const isExpired =
          msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid");
        throw new Error(isExpired ? "This reset link has expired. Please request a new one." : msg);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      submitRef.current = false;
    }
  }

  if (done) {
    return (
      <FadeIn delay={0}>
        <div>
          <h1 className="text-2xl font-normal tracking-tight mb-1">Password updated</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Your password has been reset. Redirecting to login in {countdown}…
          </p>
          <Link href="/login" className="rt-btn inline-flex text-sm h-11 items-center px-6">
            Log in now
          </Link>
        </div>
      </FadeIn>
    );
  }

  return (
    <>
      <SlideInField delay={60}>
        <div className="mb-8">
          <h1 className="text-2xl font-normal tracking-tight mb-1">Set new password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a strong password for your Retuned account.
          </p>
        </div>
      </SlideInField>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* New password */}
        <SlideInField delay={150}>
          <div>
            <label className="rt-label" htmlFor="password">
              New password{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <div className="relative mt-1 overflow-hidden">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="rt-input pr-10"
                aria-describedby="pw-requirements"
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  height: "1px",
                  width: "100%",
                  background: "var(--color-brand)",
                  transform: passwordFocused ? "scaleX(1)" : "scaleX(0)",
                  transformOrigin: "left",
                  transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>

            {password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 transition-colors ${
                        i <= pwStrength.score ? pwStrength.color : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{pwStrength.label}</p>
              </div>
            )}

            {password.length > 0 && (
              <ul
                id="pw-requirements"
                className="mt-2 space-y-1"
                aria-label="Password requirements"
              >
                {PW_RULES.map((rule) => {
                  const met = rule.test(password);
                  return (
                    <li key={rule.label} className="flex items-center gap-1.5 text-xs">
                      {met ? (
                        <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                      ) : (
                        <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className={met ? "text-foreground" : "text-muted-foreground"}>
                        {rule.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SlideInField>

        {/* Confirm password */}
        <SlideInField delay={230}>
          <div>
            <label className="rt-label" htmlFor="confirmPassword">
              Confirm password{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <div className="relative mt-1 overflow-hidden">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="rt-input pr-10"
                onFocus={() => setConfirmFocused(true)}
                onBlur={() => setConfirmFocused(false)}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  height: "1px",
                  width: "100%",
                  background: "var(--color-brand)",
                  transform: confirmFocused ? "scaleX(1)" : "scaleX(0)",
                  transformOrigin: "left",
                  transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-xs text-destructive" role="alert">
                Passwords do not match.
              </p>
            )}
          </div>
        </SlideInField>

        {error && (
          <p role="alert" aria-live="assertive" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <FadeIn delay={310}>
          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="rt-btn w-full justify-center h-11"
          >
            {loading ? "Updating..." : "Set new password"}
          </button>
        </FadeIn>
      </form>

      <FadeIn delay={370}>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <Link href="/login" className="text-foreground hover:underline">
            Log in
          </Link>
        </p>
      </FadeIn>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <PageEnter>
      <div className="min-h-screen flex items-center justify-center px-5">
        <main id="main-content" className="w-full max-w-sm">
          <div className="py-10 px-8">
            {/* Logo */}
            <FadeIn delay={0}>
              <Link href="/" className="inline-block mb-8">
                <Logo variant="full" size="sm" />
              </Link>
            </FadeIn>

            <Suspense
              fallback={
                <div className="flex items-center justify-center py-12">
                  <span className="inline-flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
                      />
                    ))}
                  </span>
                </div>
              }
            >
              <ResetPasswordForm />
            </Suspense>
          </div>
        </main>
      </div>
    </PageEnter>
  );
}
