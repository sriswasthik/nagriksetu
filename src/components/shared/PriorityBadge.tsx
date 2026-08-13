import { Badge } from "@/components/ui/badge";
import { type PriorityLevel } from "@/types/complaint";

const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
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
      {PRIORITY_LABELS[level]} {score !== undefined && `(${score})`}
    </Badge>
  );
}
