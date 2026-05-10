"use client";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitRef.current) return;
    submitRef.current = true;
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Invalid email or password.");
      }
      router.refresh();
      router.push("/dashboard");
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
        <Link href="/" className="flex items-center gap-2.5 relative z-10 text-white">
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
          <span className="text-sm font-semibold">Retuned</span>
        </Link>
        <div className="relative z-10 max-w-md">
          <h1 className="font-serif text-5xl font-normal text-white leading-[1.1] mb-6">
            Welcome
            <br />
            <span className="text-white/50">back.</span>
          </h1>
          <p className="text-white/60 text-sm leading-relaxed">
            Every decision the system makes is preserved. You can audit every specialist, every
            claim, every reason — all the way back.
          </p>
        </div>
        <div className="text-xs text-white/30 relative z-10">Retuned © 2026</div>
      </div>

      {/* Right panel */}
      <div className="flex-1 lg:max-w-[480px] flex flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-sm">
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

          <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-2">Sign in</h2>
          <p className="text-sm text-[#6b6b6b] mb-8">
            New here?{" "}
            <Link href="/signup" className="text-[#2d8a5e] font-medium hover:underline">
              Create an account
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-[#6b6b6b] mb-2">
                Email
              </label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                disabled={loading}
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
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={loading}
                  className="rt-input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#6b6b6b] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            {error && (
              <p
                role="alert"
                className="text-xs text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2"
              >
                {error}
              </p>
            )}
            <button type="submit" disabled={loading} className="rt-btn w-full py-3">
              {loading ? (
                "Signing in…"
              ) : (
                <>
                  <span>Sign in</span> <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
