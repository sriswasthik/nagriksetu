import { Badge } from "@/components/ui/badge";
import { type PriorityLevel } from "@/types/complaint";

const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const PRIORITY_DOT_COLORS: Record<PriorityLevel, string> = {
  critical: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-emerald-500',
};

export function PriorityBadge({ level, score, className }: { level: PriorityLevel; score?: number; className?: string }) {
  const getVariant = (l: PriorityLevel) => {
    switch (l) {
      case "critical":
        return "critical";
      case "high":
        return "warning";
      case "medium":
        return "info";
      case "low":
        return "success";
      default:
        return "default";
    }
  };

  return (
    <Badge variant={getVariant(level)} className={className}>
      <span className={`status-dot ${PRIORITY_DOT_COLORS[level]}`} />
      {PRIORITY_LABELS[level]}
    </Badge>
  );
}
