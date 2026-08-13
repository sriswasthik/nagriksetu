import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type ComplaintStatus } from "@/types/complaint";

export function StatusBadge({ status, className }: { status: ComplaintStatus; className?: string }) {
  const getVariant = (s: ComplaintStatus) => {
    switch (s) {
      case "resolved":
      case "verified":
        return "success";
      case "rejected":
        return "destructive";
      case "submitted":
      case "triaged":
      case "assigned":
        return "warning";
      case "ai_processing":
      case "in_progress":
      case "accepted":
        return "info";
      case "proof_submitted":
      case "supervisor_review":
      case "citizen_confirmation":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <Badge variant={getVariant(status)} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
