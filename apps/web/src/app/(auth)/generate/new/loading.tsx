import { Skeleton } from "@/components/ui/skeletons";

export default function GenerateLoading() {
  return (
    <div className="px-10 py-12 max-w-3xl mx-auto">
      <Skeleton className="h-10 w-64 mb-4" />
      <Skeleton className="h-4 w-96 mb-8" />
      <div className="border border-[#e5e2dd] rounded-2xl p-8 bg-white">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}
