import { cn } from "@/lib/utils";
import { getStatusMeta, getToneClasses } from "@/lib/design/status";
import { type ComplaintStatus } from "@/types/complaint";

interface StatusBadgeProps {
  status: ComplaintStatus;
  className?: string;
  /** Show the status icon alongside the label. */
  showIcon?: boolean;
  size?: "sm" | "md";
}

/**
 * Canonical status pill. Reads label + tone from the shared status
 * system so a given status is presented identically wherever it
 * appears (lists, detail headers, map panels, admin queue).
 */
export function StatusBadge({
  status,
  className,
  showIcon = false,
  size = "md",
}: StatusBadgeProps) {
  const meta = getStatusMeta(status);
  const tone = getToneClasses(meta.tone);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        tone.badge,
        className
      )}
    >
      {showIcon ? (
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", tone.dot)}
          aria-hidden="true"
        />
      )}
      {meta.label}
    </span>
  );
}
