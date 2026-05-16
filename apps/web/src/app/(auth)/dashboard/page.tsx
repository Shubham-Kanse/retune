import { getSession } from "@/lib/session";
import { safeFetch, safeQuery } from "@/lib/errors";
import { computeCompletenessScore, db } from "@retune/db";
import { applications, profiles } from "@retune/db/schema";
import { eq } from "drizzle-orm";
import { ArrowRight, FileText, ShieldCheck, Sparkles, Target, User, Zap } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const profileRows = await safeQuery(
    () =>
      db
      .select({
        fullName: profiles.fullName,
        email: profiles.email,
        phone: profiles.phone,
        linkedin: profiles.linkedin,
        location: profiles.location,
        currentTitle: profiles.currentTitle,
        targetRoles: profiles.targetRoles,
        experience: profiles.experience,
        education: profiles.education,
        skillsTier1: profiles.skillsTier1,
        voiceNotes: profiles.voiceNotes,
        profileMarkdown: profiles.profileMarkdown,
      })
      .from(profiles)
      .where(eq(profiles.userId, session.userId))
      .limit(1),
    [] as Array<{
      fullName: string;
      email: string;
      phone: string | null;
      linkedin: string | null;
      location: string;
      currentTitle: string | null;
      targetRoles: string;
      experience: string;
      education: string;
      skillsTier1: string | null;
      voiceNotes: string | null;
      profileMarkdown: string;
    }>,
  );
  const profile = profileRows[0];

  const safeJson = (v: string | null | undefined) => { 
    try { return v ? JSON.parse(v) : []; } catch { return []; } 
  };

  const generations = await safeQuery(
    () =>
      db
        .select({
          id: applications.id,
          status: applications.status,
        })
        .from(applications)
        .where(eq(applications.userId, session.userId))
        .limit(50),
    [],
  );

  const profileScore = profile
    ? computeCompletenessScore({
        ...profile,
        targetRoles: safeJson(profile.targetRoles),
        experience: safeJson(profile.experience),
        education: safeJson(profile.education),
        skillsTier1: safeJson(profile.skillsTier1),
      })
    : 0;

  const shipped = generations.filter((i) => i.status === "completed" || i.status === "submitted");

  const greetings = [
    "Good to see you!",
    "Welcome back.",
    "What's next?",
    "Let's build.",
    "Ready when you are.",
  ];
  const greeting = greetings[new Date().getMinutes() % greetings.length];

  return (
    <div className="w-full max-w-6xl px-6 py-10 md:px-10">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-brand">Dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] md:text-6xl">{greeting}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Paste a role, check profile drift, and ship a complete application package from one workspace.
          </p>
        </div>
        <Link href="/generate/new" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5">
          New application
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <Link href="/generate/new" className="mt-10 block rounded-[2rem] border border-border bg-card/75 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-transform hover:-translate-y-1">
        <div className="rounded-[1.4rem] border border-border bg-background/75 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-brand" />
            What are we applying to today?
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-3xl border border-input bg-popover px-4 py-3 text-left">
            <span className="text-sm text-muted-foreground">Paste a job URL or description...</span>
            <span className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              Generate
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {["URL or pasted JD", "US resume / UK CV", "Drift check", "Resume + cover letter + strategy"].map((item) => (
              <span key={item} className="rounded-full border border-border bg-card px-3 py-1.5">{item}</span>
            ))}
          </div>
        </div>
      </Link>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          { label: "Applications shipped", value: shipped.length || "—", icon: FileText },
          { label: "Profile readiness", value: `${profileScore}%`, icon: User },
          { label: "Total generations", value: generations.length || "—", icon: Zap },
          { label: "Next best action", value: profileScore >= 60 ? "Apply" : "Profile", icon: Target },
        ].map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-md">
            <stat.icon className="h-4 w-4 text-brand" />
            <p className="mt-6 text-2xl font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-md">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Recent applications</h2>
              <p className="text-sm text-muted-foreground">Your latest generated packages.</p>
            </div>
            <Link href="/applications" className="text-sm text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          {generations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No application packages yet. Generate your first from a job description.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {generations.slice(0, 6).map((item) => (
                <Link key={item.id} href={`/generate/${item.id}`} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium">Application package</span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">{item.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-border bg-card/70 p-6 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <h2 className="text-lg font-semibold tracking-tight">Retuned noticed</h2>
          </div>
          <div className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Your profile readiness is {profileScore}%. Higher readiness improves role-specific evidence mapping.</p>
            <p>{profileScore >= 60 ? "You are ready to generate strong application packages." : "Add more profile evidence before high-quality generation."}</p>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand" style={{ width: `${profileScore}%` }} />
          </div>
          <Link href="/profile" className="mt-5 inline-flex text-sm font-medium text-foreground hover:text-brand">
            Improve profile
          </Link>
        </div>
      </div>
    </div>
  );
}
