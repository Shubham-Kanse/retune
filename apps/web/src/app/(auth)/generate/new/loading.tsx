import { Skeleton } from "@/components/ui/skeletons";

export default function GenerateLoading() {
  return (
    <div className="w-full max-w-4xl px-10 md:px-16 py-12 pb-16">
      {/* Header */}
      <div className="mb-12">
        <Skeleton className="h-3 w-28 mb-3 rounded-full" />
        <Skeleton className="h-14 w-48 rounded-lg" />
      </div>
      {/* Form card */}
      <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e0ddd9]">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
        <div className="p-4">
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-12 w-full mt-3 rounded-full" />
    </div>
  );
}
