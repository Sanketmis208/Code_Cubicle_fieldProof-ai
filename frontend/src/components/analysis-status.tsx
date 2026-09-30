import { BrainCircuit, CircleDashed, CircleX, Loader2 } from "lucide-react";
import type { AnalysisStatus } from "@/types";
import { cn } from "@/lib/utils";

const config: Record<
  AnalysisStatus,
  { label: string; className: string; icon: typeof BrainCircuit }
> = {
  COMPLETED: {
    label: "Analyzed",
    className: "bg-emerald-50 text-emerald-700",
    icon: BrainCircuit,
  },
  PROCESSING: {
    label: "Analyzing",
    className: "bg-violet-50 text-violet-700",
    icon: Loader2,
  },
  PENDING: {
    label: "Queued",
    className: "bg-amber-50 text-amber-700",
    icon: CircleDashed,
  },
  NOT_REQUESTED: {
    label: "Uploaded",
    className: "bg-slate-100 text-slate-600",
    icon: CircleDashed,
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-50 text-red-700",
    icon: CircleX,
  },
};
export function AnalysisStatusBadge({
  status,
  compact = false,
}: {
  status: AnalysisStatus;
  compact?: boolean;
}) {
  const item = config[status];
  const Icon = item.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
        item.className,
      )}
    >
      <Icon
        size={12}
        className={status === "PROCESSING" ? "animate-spin" : ""}
      />
      {!compact && item.label}
    </span>
  );
}
