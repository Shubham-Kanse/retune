"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const PW_RULES = [
  { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
  { label: "Uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "Lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "Number", test: (pw: string) => /[0-9]/.test(pw) },
];

function strength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 1) return { score, label: "Weak", tone: "text-destructive" };
  if (score <= 3) return { score, label: "Fair", tone: "text-amber-500" };
  return { score, label: "Strong", tone: "text-emerald-500" };
}

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [consents, setConsents] = useState({ anthropic: false, openai: false, retune: false });
  const allConsentsGranted = Object.values(consents).every(Boolean);
  const emailRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef(false);

  const s = strength(password);

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
          processorConsents: consents,
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
    <AuthShell
      title="Create your account."
      subtitle="Start with 3 free generations. No credit card required."
      footer={
        <>
          Already a member?{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton />
      <OrDivider />
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" autoComplete="name" disabled={loading} placeholder="Leonardo da Vinci" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={loading}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
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
              placeholder="••••••••"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {password.length > 0 ? (
            <div className="space-y-2 pt-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= s.score ? "bg-foreground" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <p className={`text-[11px] font-medium ${s.tone}`}>{s.label}</p>
              <ul className="space-y-1">
                {PW_RULES.map((rule) => (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-2 text-[11px] ${
                      rule.test(password) ? "text-emerald-500" : "text-muted-foreground"
                    }`}
                  >
                    <span>{rule.test(password) ? "✓" : "○"}</span>
                    {rule.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">Data processing consent</p>
          {(
            [
              { key: "anthropic", label: "Anthropic (AI generation)" },
              { key: "openai", label: "OpenAI (processing)" },
              { key: "retune", label: "Retuned (platform)" },
            ] as const
          ).map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <input
                type="checkbox"
                checked={consents[key]}
                onChange={(e) => setConsents((p) => ({ ...p, [key]: e.target.checked }))}
                className="size-4 accent-foreground"
                required
              />
              {label}
            </label>
          ))}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={loading || !allConsentsGranted} className="w-full">
          {loading ? "Creating account…" : (
            <>
              Create account <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
