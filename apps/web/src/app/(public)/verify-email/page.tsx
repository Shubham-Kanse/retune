"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function VerifyEmailContent() {
  const params = useSearchParams();
  const email = params?.get("email") ?? "";
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [resendError, setResendError] = useState("");

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

  return (
    <AuthShell title="Check your email">
      <div className="space-y-4 text-center">
        <Mail className="mx-auto size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          We sent a verification link to{" "}
          {email ? <strong className="text-foreground">{email}</strong> : "your email address"}.
          Click the link to activate your account.
        </p>
        {!resendDone ? (
          <Button
            onClick={handleResend}
            disabled={resending || !email}
            variant="outline"
            className="w-full"
          >
            {resending ? "Sending…" : "Resend verification email"}
          </Button>
        ) : (
          <p className="text-sm text-emerald-500">New verification email sent. Check your inbox.</p>
        )}
        {resendError ? <p className="text-xs text-destructive">{resendError}</p> : null}
        <p className="text-sm text-muted-foreground">
          Already verified?{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
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
