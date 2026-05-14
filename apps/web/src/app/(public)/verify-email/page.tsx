"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/prompt-kit/loader";
import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params?.get("token");
  const email = params?.get("email");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading");
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
    (async () => {
      try {
        const res = await fetch("/api/auth/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          const msg: string = d.error ?? "Failed to verify email.";
          if (msg.toLowerCase().includes("already")) setStatus("already");
          else {
            setStatus("error");
            setMessage(msg);
          }
          return;
        }
        setStatus("success");
      } catch {
        setStatus("error");
        setMessage("An error occurred while verifying your email.");
      }
    })();
  }, [token, email]);

  useEffect(() => {
    if (status !== "success") return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          router.push("/dashboard");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
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
        throw new Error(d.error ?? "Failed to resend.");
      }
      setResendDone(true);
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setResending(false);
    }
  }

  const titles = {
    loading: "Verifying your email",
    success: "Email verified",
    already: "Already verified",
    error: "Verification failed",
  } as const;

  return (
    <AuthShell title={titles[status]}>
      {status === "loading" ? (
        <div className="flex items-center justify-center py-8">
          <Loader variant="circular" />
        </div>
      ) : null}

      {status === "success" ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
          <p className="text-sm text-muted-foreground">
            Your email has been verified. Redirecting in {countdown}…
          </p>
          <Button asChild className="w-full">
            <Link href="/dashboard">Continue to dashboard</Link>
          </Button>
        </div>
      ) : null}

      {status === "already" ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
          <p className="text-sm text-muted-foreground">Your email is already verified.</p>
          <Button asChild className="w-full">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="space-y-4 text-center">
          <XCircle className="mx-auto size-10 text-destructive" />
          <p className="text-sm text-destructive">{message}</p>
          {email && !resendDone ? (
            <Button onClick={handleResend} disabled={resending} variant="outline" className="w-full">
              {resending ? "Sending…" : "Resend verification email"}
            </Button>
          ) : null}
          {resendError ? <p className="text-xs text-destructive">{resendError}</p> : null}
          {resendDone ? (
            <p className="text-sm text-emerald-500">New verification email sent. Check your inbox.</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Or <Link href="/login" className="text-foreground underline-offset-4 hover:underline">sign in</Link> to your account.
          </p>
        </div>
      ) : null}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthShell title="Loading…"><div /></AuthShell>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
