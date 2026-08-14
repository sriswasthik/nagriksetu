import { cn } from "@/lib/utils";
import { getPriorityMeta } from "@/lib/design/status";
import { type PriorityLevel } from "@/types/complaint";

interface PriorityBadgeProps {
  level: PriorityLevel;
  /** AI priority score, shown alongside the label when provided. */
  score?: number;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md";
}

/**
 * Canonical priority pill. Critical/high carry an icon by default
 * so urgency is legible without relying on color alone.
 */
export function PriorityBadge({
  level,
  score,
  className,
  showIcon,
  size = "md",
}: PriorityBadgeProps) {
  const meta = getPriorityMeta(level);
  const Icon = meta.icon;

  // Urgent levels always get the icon — color alone is not an
  // accessible signal for "this needs attention now".
  const withIcon = showIcon ?? (level === "critical" || level === "high");

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        meta.badge,
        className
      )}
    >
      {withIcon ? (
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", meta.dot)}
          aria-hidden="true"
        />
      )}
      {meta.label}
      {score !== undefined && (
        <span className="tabular opacity-70">· {score}</span>
      )}
    </span>
  );
}
