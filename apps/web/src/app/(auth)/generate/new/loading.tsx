import { PageHeader, PageShell } from "@/components/app/page-shell";
import { Skeleton } from "@/components/ui/skeletons";

export default function GenerateLoading() {
  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow={<Skeleton className="h-3 w-20" />}
        title={<Skeleton className="h-8 w-72" />}
        subtitle={<Skeleton className="h-3 w-96" />}
        action={<Skeleton className="h-3 w-24" />}
      />

      {/* JdPrompt card */}
      <div className="rounded-3xl border border-border bg-card/60 p-3 shadow-sm">
        <div className="space-y-3 p-3">
          <Skeleton className="h-[140px] w-full rounded-md" />
          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {["w-[140px]", "w-[200px]", "w-[160px]", "w-[180px]"].map((w, i) => (
          <Skeleton key={i} className={`h-8 rounded-full ${w}`} />
        ))}
      </div>

      {/* Reasoning blocks */}
      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
