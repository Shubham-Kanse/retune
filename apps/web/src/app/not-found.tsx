import { Logo } from "@/components/ui/logo";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
      {/* Decorative shapes — absolutely positioned behind content */}
      <div
        className="pointer-events-none absolute left-[8%] top-[20%] w-32 h-48 border border-foreground/[0.04]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-[12%] bottom-[15%] w-px h-40 bg-foreground/[0.05]"
        aria-hidden="true"
      />

      <div className="absolute top-0 left-0 right-0 border-b border-border px-8 py-4 flex">
        <Link href="/">
          <Logo variant="text" size="sm" />
        </Link>
      </div>

      <p
        className="text-[120px] font-normal leading-none tracking-tighter text-muted-foreground/30 animate-in zoom-in-50 duration-500 select-none"
        style={{ animationFillMode: "both" }}
        aria-hidden="true"
      >
        404
      </p>
      <h1
        className="text-xl font-normal mt-4 animate-in fade-in slide-in-from-bottom-2 duration-400"
        style={{ animationDelay: "150ms", animationFillMode: "both" }}
      >
        Page not found
      </h1>
      <p
        className="text-sm text-muted-foreground mt-2 max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-400"
        style={{ animationDelay: "220ms", animationFillMode: "both" }}
      >
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div
        className="mt-6 flex items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-400"
        style={{ animationDelay: "300ms", animationFillMode: "both" }}
      >
        <Link href="/dashboard" className="rt-btn">
          Go to dashboard
        </Link>
        <Link href="/" className="rt-btn-ghost">
          Go home
        </Link>
      </div>
    </div>
  );
}
