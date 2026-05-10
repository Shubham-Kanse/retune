"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token");
  const email = searchParams?.get("email");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "already_verified">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState(3);
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [resendError, setResendError] = useState("");
  const didVerify = useRef(false);

  useEffect(() => {
    if (didVerify.current) return;
    didVerify.current = true;

    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link. No token provided.");
      return;
    }

    const verifyEmail = async () => {
      try {
        const res = await fetch("/api/auth/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg: string = data.error ?? "Failed to verify email.";
          if (msg.toLowerCase().includes("already")) {
            setStatus("already_verified");
          } else {
            setStatus("error");
            setMessage(msg);
          }
          return;
        }

        setStatus("success");
      } catch {
        setStatus("error");
        setMessage("An error occurred while verifying your email. Please try again.");
      }
    };

    verifyEmail();
  }, [token, email]);

  // Countdown + redirect on success
  useEffect(() => {
    if (status !== "success") return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          router.push("/dashboard");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status, router]);

  async function handleResend() {
    if (!email || resending) return;
    setResending(true);
    setResendError("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to resend. Please try again.");
      }
      setResendDone(true);
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setResending(false);
    }
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen flex items-center justify-center bg-background px-6"
    >
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">
            {status === "success"
              ? "Email Verified"
              : status === "already_verified"
                ? "Already Verified"
                : "Verify Your Email"}
          </h1>

          {status === "loading" && (
            <div className="mt-8" aria-live="polite" aria-label="Verifying email">
              <div className="inline-block">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="mt-4 text-muted-foreground">Verifying your email...</p>
            </div>
          )}

          {status === "success" && (
            <div className="mt-8" aria-live="polite">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="mt-4 text-muted-foreground">
                Your email has been verified. Redirecting in {countdown}…
              </p>
              <Link href="/dashboard" className="rt-btn inline-flex mt-4 text-sm">
                Continue to dashboard
              </Link>
            </div>
          )}

          {status === "already_verified" && (
            <div className="mt-8" aria-live="polite">
              <p className="text-muted-foreground mb-4">Your email is already verified.</p>
              <Link href="/dashboard" className="rt-btn inline-flex text-sm">
                Go to dashboard
              </Link>
            </div>
          )}

          {status === "error" && (
            <div className="mt-8" aria-live="assertive">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <p className="mt-4 text-destructive font-medium">{message}</p>

              {email && !resendDone && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="rt-btn text-sm"
                  >
                    {resending ? "Sending..." : "Resend verification email"}
                  </button>
                  {resendError && (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {resendError}
                    </p>
                  )}
                </div>
              )}

              {resendDone && (
                <p
                  className="mt-4 text-sm text-emerald-600 dark:text-emerald-400"
                  aria-live="polite"
                >
                  New verification email sent. Check your inbox.
                </p>
              )}

              <p className="mt-4 text-sm text-muted-foreground">
                Or{" "}
                <Link href="/login" className="text-foreground hover:underline">
                  sign in
                </Link>{" "}
                to your account.
              </p>
            </div>
          )}

          <Link
            href="/"
            className="mt-8 inline-block text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-screen flex items-center justify-center bg-background"
        >
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
