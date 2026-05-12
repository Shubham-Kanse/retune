"use client";

import { Logo } from "@/components/ui/logo";
import { FadeIn, PageEnter } from "@/lib/motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const submitRef = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitRef.current) return;
    submitRef.current = true;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      emailRef.current?.focus();
    } finally {
      setLoading(false);
      submitRef.current = false;
    }
  }

  return (
    <PageEnter>
      <div className="min-h-screen flex items-center justify-center px-5">
        <main id="main-content" className="w-full max-w-md">
          <div className="rounded-3xl border border-border bg-white/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            {/* Logo */}
            <FadeIn delay={0}>
              <Link href="/" className="inline-block mb-8">
                <Logo variant="full" size="sm" />
              </Link>
            </FadeIn>

            {sent ? (
              <FadeIn delay={60}>
                <div>
                  <h1 className="text-2xl font-normal tracking-tight mb-1">Check your inbox</h1>
                  <p className="text-sm text-muted-foreground mb-8">
                    If an account exists for <strong className="text-foreground">{email}</strong>,
                    you&apos;ll receive a reset link within a few minutes.
                  </p>
                  <Link href="/login" className="rt-btn inline-flex text-sm h-11 items-center px-6">
                    Back to login
                  </Link>
                </div>
              </FadeIn>
            ) : (
              <>
                <SlideInField delay={60}>
                  <div className="mb-8">
                    <h1 className="text-2xl font-normal tracking-tight mb-1">Reset password</h1>
                    <p className="text-sm text-muted-foreground">
                      Enter your email and we&apos;ll send you a reset link.
                    </p>
                  </div>
                </SlideInField>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <SlideInField delay={150}>
                    <div>
                      <label className="rt-label" htmlFor="email">
                        Email{" "}
                        <span className="text-destructive" aria-hidden="true">
                          *
                        </span>
                      </label>
                      <div className="relative mt-1 overflow-hidden">
                        <input
                          ref={emailRef}
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={loading}
                          className="rt-input"
                          onFocus={() => setEmailFocused(true)}
                          onBlur={() => setEmailFocused(false)}
                        />
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            bottom: 0,
                            left: 0,
                            height: "1px",
                            width: "100%",
                            background: "var(--color-brand)",
                            transform: emailFocused ? "scaleX(1)" : "scaleX(0)",
                            transformOrigin: "left",
                            transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1)",
                          }}
                        />
                      </div>
                    </div>
                  </SlideInField>

                  {error && (
                    <p role="alert" aria-live="assertive" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <FadeIn delay={230}>
                    <button
                      type="submit"
                      disabled={loading}
                      className="rt-btn w-full justify-center h-11"
                    >
                      {loading ? "Sending..." : "Send reset link"}
                    </button>
                  </FadeIn>
                </form>

                <FadeIn delay={300}>
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Remember your password?{" "}
                    <Link href="/login" className="text-foreground hover:underline">
                      Log in
                    </Link>
                  </p>
                </FadeIn>
              </>
            )}
          </div>
        </main>
      </div>
    </PageEnter>
  );
}

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
