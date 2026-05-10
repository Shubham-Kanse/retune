import { BlackboardResumeRenderer } from "@/components/results/blackboard-resume-renderer";
import { apiClient } from "@/lib/api-client";
import { notFound, redirect } from "next/navigation";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch application from Hono API
  let application;
  try {
    application = await apiClient.getApplication(id);
  } catch (error) {
    console.error("Failed to fetch application:", error);
    notFound();
  }

  // Redirect to pipeline view if still generating
  if (application.status !== "completed") {
    redirect(`/generate/${id}`);
  }

  // Check if we have resume content in the blackboard
  const hasResumeContent =
    application.blackboard?.draft?.bullets &&
    Object.keys(application.blackboard.draft.bullets).length > 0;

  if (!hasResumeContent) {
    redirect(`/generate/${id}`);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Application Results</h1>
        <p className="text-sm text-muted-foreground">
          Generated in {application.ticks_executed} ticks • ${application.total_cost_usd.toFixed(4)}
        </p>
      </div>

      <BlackboardResumeRenderer blackboard={application.blackboard} />

      {/* Cover Letter */}
      {application.blackboard.draft.cover_letter_text && (
        <div className="mt-8">
          <h2 className="mb-4 text-base font-semibold">Cover Letter</h2>
          <div className="whitespace-pre-wrap rounded-lg border bg-card p-6">
            {application.blackboard.draft.cover_letter_text}
          </div>
        </div>
      )}

      {/* Strategy */}
      {application.blackboard.draft.strategy_text && (
        <div className="mt-8">
          <h2 className="mb-4 text-base font-semibold">Application Strategy</h2>
          <div className="whitespace-pre-wrap rounded-lg border bg-card p-6">
            {application.blackboard.draft.strategy_text}
          </div>
        </div>
      )}
    </div>
  );
}
