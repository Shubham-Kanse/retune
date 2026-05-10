import { getSession } from "@/lib/session";
import { computeCompletenessScore, db } from "@retune/db";
import { profiles } from "@retune/db/schema";
import { eq } from "drizzle-orm";
import { ChevronRight, CreditCard, FileText, Sparkles, User } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const profileRows = await db
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
    .limit(1);
  const profile = profileRows[0];

  const safeJson = (v: string | null | undefined) => { try { return v ? JSON.parse(v) : []; } catch { return []; } };
  const profileScore = profile
    ? computeCompletenessScore({
        ...profile,
        targetRoles: safeJson(profile.targetRoles),
        experience: safeJson(profile.experience),
        education: safeJson(profile.education),
        skillsTier1: safeJson(profile.skillsTier1),
      })
    : 0;

  let generations: { id: string; verdict: string | null }[] = [];
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/brain/generations`,
      {
        headers: { cookie: `session=${session.userId}` },
        cache: "no-store",
      },
    );
    if (res.ok) {
      const data = await res.json();
      generations = Array.isArray(data) ? data : [];
    }
  } catch {
    /* silent — show 0 */
  }

  const shipped = generations.filter((i) => i.verdict === "ship" || i.verdict === "completed");

  const greetings = [
    "Good to see you!",
    "Welcome back.",
    "What's next?",
    "Let's build.",
    "Ready when you are.",
  ];
  const greeting = greetings[new Date().getMinutes() % greetings.length];

  return (
    <div className="px-10 py-12 max-w-3xl mx-auto">
      <h1 className="font-serif text-5xl md:text-[3.25rem] font-normal text-[#1a1a1a] leading-[0.95] tracking-tight">
        {greeting}
      </h1>
      <p className="text-[#6b6b6b] text-sm mt-1 mb-12">here&apos;s a quick overview of your hub.</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Applications card */}
        <Link
          href="/applications"
          className="flex flex-col border border-[#e5e2dd] rounded-2xl p-6 hover:shadow-md transition-all group bg-white min-h-[220px]"
        >
          <div className="w-10 h-10 rounded-xl bg-[#f0ede8] flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#00d4d4] icon-shine" />
          </div>
          <div className="mt-6 flex-1">
            <p className="font-serif text-2xl text-[#1a1a1a] mb-1 leading-tight">
              {shipped.length === 0 ? "All caught up" : `${shipped.length} shipped`}
            </p>
            <p className="text-sm font-medium text-[#1a1a1a]">Applications</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              {generations.length === 0
                ? "No active generations"
                : `${generations.length} total generations`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#ccc8c3] mt-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        {/* Profile card */}
        <Link
          href="/profile"
          className="flex flex-col border border-[#e5e2dd] rounded-2xl p-6 hover:shadow-md transition-all group bg-white min-h-[220px]"
        >
          <div className="w-10 h-10 rounded-xl bg-[#f0ede8] flex items-center justify-center">
            <User className="w-5 h-5 text-[#ff5555] icon-shine" />
          </div>
          <div className="mt-6 flex-1">
            <p className="font-serif text-2xl text-[#1a1a1a] mb-1 leading-tight">
              {profileScore > 0 ? `${profileScore}% complete` : "Incomplete"}
            </p>
            <p className="text-sm font-medium text-[#1a1a1a]">Profile</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">Add: Salary target, Work mode...</p>
            <div className="mt-2 h-1.5 bg-[#e5e2dd] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#2d8a5e] rounded-full"
                style={{ width: `${profileScore}%` }}
              />
            </div>
          </div>
        </Link>

        {/* Generate card */}
        <Link
          href="/generate/new"
          className="flex flex-col border border-[#e5e2dd] rounded-2xl p-6 hover:shadow-md transition-all group bg-white min-h-[220px]"
        >
          <div className="w-10 h-10 rounded-xl bg-[#f0ede8] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#b84ed1] icon-shine" />
          </div>
          <div className="mt-6 flex-1">
            <p className="font-serif text-2xl text-[#1a1a1a] mb-1 leading-tight">New</p>
            <p className="text-sm font-medium text-[#1a1a1a]">Generate</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">Paste a JD, get your package</p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#ccc8c3] mt-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        {/* Billing / Settings card */}
        <Link
          href="/settings"
          className="flex flex-col border border-[#e5e2dd] rounded-2xl p-6 hover:shadow-md transition-all group bg-white min-h-[220px]"
        >
          <div className="w-10 h-10 rounded-xl bg-[#f0ede8] flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-[#5fc3ff] icon-shine" />
          </div>
          <div className="mt-6 flex-1">
            <p className="font-serif text-2xl text-[#1a1a1a] mb-1 leading-tight">Manage</p>
            <p className="text-sm font-medium text-[#1a1a1a]">Account &amp; Billing</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">Plan, usage, data, privacy</p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#ccc8c3] mt-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>
    </div>
  );
}
