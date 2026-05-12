import { getSession } from "@/lib/session";
import { safeFetch, safeQuery } from "@/lib/errors";
import { computeCompletenessScore, db } from "@retune/db";
import { applications, profiles } from "@retune/db/schema";
import { eq } from "drizzle-orm";
import { ChevronRight, CreditCard, FileText, Sparkles, User } from "lucide-react";
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
    <div className="w-full max-w-4xl px-10 md:px-16 py-12 pb-16">
      <p className="rt-label mb-3">Overview</p>
      <h1 className="font-serif text-5xl md:text-6xl font-normal text-foreground leading-[1] tracking-tight">
        {greeting}
      </h1>
      <p className="text-muted-foreground text-base mt-3 mb-14">here&apos;s a quick overview of your hub.</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Applications card */}
        <Link
          href="/applications"
          className="relative flex flex-col rounded-3xl border border-[#e0ddd9] bg-white/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] hover:shadow-lg transition-shadow group min-h-[220px] overflow-hidden"
        >
          <div className="w-9 h-9 rounded-full bg-amber-500/12 flex items-center justify-center">
            <FileText className="w-4 h-4 text-amber-700 icon-shine" />
          </div>
          <div className="mt-6 flex-1">
            <p className="font-serif text-2xl text-foreground mb-1 leading-tight">
              {shipped.length === 0 ? "All caught up" : `${shipped.length} shipped`}
            </p>
            <p className="text-sm font-medium text-foreground">Applications</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {generations.length === 0
                ? "No active generations"
                : `${generations.length} total generations`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 mt-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-amber-500 rounded-full opacity-10" style={{ filter: "blur(72px)" }} />
        </Link>

        {/* Profile card */}
        <Link
          href="/profile"
          className="relative flex flex-col rounded-3xl border border-[#e0ddd9] bg-white/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] hover:shadow-lg transition-shadow group min-h-[220px] overflow-hidden"
        >
          <div className="w-9 h-9 rounded-full bg-rose-500/12 flex items-center justify-center">
            <User className="w-4 h-4 text-rose-700 icon-shine" />
          </div>
          <div className="mt-6 flex-1">
            <p className="font-serif text-2xl text-foreground mb-1 leading-tight">
              {profileScore > 0 ? `${profileScore}% complete` : "Incomplete"}
            </p>
            <p className="text-sm font-medium text-foreground">Profile</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add: Salary target, Work mode...</p>
            <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-brand rounded-full"
                style={{ width: `${profileScore}%` }}
              />
            </div>
          </div>
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-rose-500 rounded-full opacity-10" style={{ filter: "blur(72px)" }} />
        </Link>

        {/* Generate card */}
        <Link
          href="/generate/new"
          className="relative flex flex-col rounded-3xl border border-[#e0ddd9] bg-white/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] hover:shadow-lg transition-shadow group min-h-[220px] overflow-hidden"
        >
          <div className="w-9 h-9 rounded-full bg-violet-500/12 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-700 icon-shine" />
          </div>
          <div className="mt-6 flex-1">
            <p className="font-serif text-2xl text-foreground mb-1 leading-tight">New</p>
            <p className="text-sm font-medium text-foreground">Generate</p>
            <p className="text-xs text-muted-foreground mt-0.5">Paste a JD, get your package</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 mt-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-violet-500 rounded-full opacity-10" style={{ filter: "blur(72px)" }} />
        </Link>

        {/* Billing / Settings card */}
        <Link
          href="/settings"
          className="relative flex flex-col rounded-3xl border border-[#e0ddd9] bg-white/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] hover:shadow-lg transition-shadow group min-h-[220px] overflow-hidden"
        >
          <div className="w-9 h-9 rounded-full bg-sky-500/12 flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-sky-700 icon-shine" />
          </div>
          <div className="mt-6 flex-1">
            <p className="font-serif text-2xl text-foreground mb-1 leading-tight">Manage</p>
            <p className="text-sm font-medium text-foreground">Account &amp; Billing</p>
            <p className="text-xs text-muted-foreground mt-0.5">Plan, usage, data, privacy</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 mt-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-sky-500 rounded-full opacity-10" style={{ filter: "blur(72px)" }} />
        </Link>
      </div>
    </div>
  );
}
