import { AlertTriangle, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSLATime, getSLAUrgency } from "@/lib/utils";

interface SLAIndicatorProps {
  hoursRemaining: number;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Remaining time against the service-level target.
 *
 * Answers an operational question — "will this breach?" — so it
 * leads with urgency, not a raw number. Breached and at-risk states
 * carry an icon as well as colour so urgency survives greyscale and
 * colour-blindness.
 */
export function SLAIndicator({
  hoursRemaining,
  className,
  size = "md",
}: SLAIndicatorProps) {
  const urgency = getSLAUrgency(hoursRemaining);
  const isBreached = hoursRemaining <= 0;

  const TONES = {
    danger: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    safe: "border-neutral-300 bg-neutral-100 text-neutral-700",
  } as const;

  const Icon = urgency === "safe" ? Clock3 : AlertTriangle;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        TONES[urgency],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="tabular">
        {isBreached ? "SLA breached" : formatSLATime(hoursRemaining)}
      </span>
    </span>
  );
}
