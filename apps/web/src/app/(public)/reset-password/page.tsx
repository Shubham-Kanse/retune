"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Eye, EyeOff, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

const PW_RULES = [
  { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
  { label: "Uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "Lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "Number", test: (pw: string) => /[0-9]/.test(pw) },
];

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const submitRef = useRef(false);

  const pwValid = PW_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword;
  const canSubmit = pwValid && passwordsMatch && confirmPassword.length > 0;

  useEffect(() => {
    if (!done) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          router.push("/login");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [done, router]);

  if (!token) {
    return (
      <>
        <p className="text-sm text-destructive">Invalid or missing reset token.</p>
        <Button asChild className="mt-4 w-full">
          <Link href="/forgot-password">Request a new reset link</Link>
        </Button>
      </>
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
        const msg = d.error ?? "Something went wrong.";
        const expired = msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid");
        throw new Error(expired ? "This reset link has expired. Please request a new one." : msg);
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
      <>
        <p className="text-sm text-muted-foreground">
          Your password has been reset. Redirecting to sign in in {countdown}…
        </p>
        <Button asChild className="mt-4 w-full">
          <Link href="/login">Sign in now</Link>
        </Button>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {password.length > 0 ? (
          <ul className="space-y-1 pt-1">
            {PW_RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <li key={rule.label} className="flex items-center gap-1.5 text-xs">
                  {ok ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <X className="size-3 text-muted-foreground" />
                  )}
                  <span className={ok ? "text-foreground" : "text-muted-foreground"}>{rule.label}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {confirmPassword.length > 0 && !passwordsMatch ? (
          <p className="text-xs text-destructive">Passwords do not match.</p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={loading || !canSubmit} className="w-full">
        {loading ? "Updating…" : "Set new password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Set new password" subtitle="Choose a strong password for your Retuned account.">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
