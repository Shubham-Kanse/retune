import { cn } from "@/lib/utils";
import { CheckCircle2, FileText, Loader2, XCircle } from "lucide-react";

type FileChipStatus = "idle" | "uploading" | "reading" | "complete" | "error";

export function FileChip({ name, status = "idle", className }: { name: string; status?: FileChipStatus; className?: string }) {
  const Icon = status === "complete" ? CheckCircle2 : status === "error" ? XCircle : status === "uploading" || status === "reading" ? Loader2 : FileText;
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm", className)}>
      <Icon className={cn("h-3.5 w-3.5", (status === "uploading" || status === "reading") && "animate-spin", status === "complete" && "text-brand", status === "error" && "text-destructive")} />
      <span className="max-w-48 truncate">{name}</span>
      {status !== "idle" && <span className="text-muted-foreground">{status}</span>}
    </span>
  );
}
