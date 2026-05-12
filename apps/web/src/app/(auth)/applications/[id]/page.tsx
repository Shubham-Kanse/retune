import { BlackboardResumeRenderer } from "@/components/results/blackboard-resume-renderer";
import { apiClient } from "@/lib/api-client";
import { notFound, redirect } from "next/navigation";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let application;
  try {
    application = await apiClient.getApplication(id);
  } catch (error) {
    console.error("Failed to fetch application:", error);
    notFound();
  }

  if (application.status !== "completed") {
    redirect(`/generate/${id}`);
  }

  const hasResumeContent =
    application.blackboard?.draft?.bullets &&
    Object.keys(application.blackboard.draft.bullets).length > 0;

  if (!hasResumeContent) {
    redirect(`/generate/${id}`);
  }

  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-3xl">
        <div className="mb-6">
          <h1 className="font-serif text-2xl font-normal text-[#1a1a1a]">Application Results</h1>
          <p className="text-sm text-[#6b6b6b] mt-1">
            Generated in {application.ticks_executed} ticks · ${application.total_cost_usd.toFixed(4)}
          </p>
        </div>

        <BlackboardResumeRenderer blackboard={application.blackboard} />

        {application.blackboard.draft.cover_letter_text && (
          <div className="mt-8">
            <h2 className="font-serif text-xl font-normal text-[#1a1a1a] mb-4">Cover Letter</h2>
            <div className="whitespace-pre-wrap bg-white border border-[#e5e2dd] rounded-2xl p-6 text-sm text-[#1a1a1a] leading-relaxed">
              {application.blackboard.draft.cover_letter_text}
            </div>
          </div>
        )}

        {application.blackboard.draft.strategy_text && (
          <div className="mt-8">
            <h2 className="font-serif text-xl font-normal text-[#1a1a1a] mb-4">Application Strategy</h2>
            <div className="whitespace-pre-wrap bg-white border border-[#e5e2dd] rounded-2xl p-6 text-sm text-[#1a1a1a] leading-relaxed">
              {application.blackboard.draft.strategy_text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
