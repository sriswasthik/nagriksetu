import { Badge } from "@/components/ui/badge";
import { type ComplaintStatus } from "@/types/complaint";

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  ai_analyzed: 'AI Analyzed',
  assigned: 'Assigned',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  proof_submitted: 'Proof Submitted',
  supervisor_review: 'Under Review',
  citizen_confirmation: 'Awaiting Confirmation',
  resolved: 'Resolved',
  reopened: 'Reopened',
  rejected: 'Rejected',
};

const STATUS_DOT_COLORS: Record<ComplaintStatus, string> = {
  submitted: 'bg-amber-500',
  ai_analyzed: 'bg-blue-500',
  assigned: 'bg-amber-500',
  accepted: 'bg-blue-500',
  in_progress: 'bg-blue-500',
  proof_submitted: 'bg-violet-500',
  supervisor_review: 'bg-violet-500',
  citizen_confirmation: 'bg-violet-500',
  resolved: 'bg-emerald-500',
  reopened: 'bg-orange-500',
  rejected: 'bg-red-500',
};

export function StatusBadge({ status, className }: { status: ComplaintStatus; className?: string }) {
  const getVariant = (s: ComplaintStatus) => {
    switch (s) {
      case "resolved":
        return "success";
      case "rejected":
        return "destructive";
      case "submitted":
      case "assigned":
        return "warning";
      case "ai_analyzed":
      case "in_progress":
      case "accepted":
        return "info";
      case "proof_submitted":
      case "supervisor_review":
      case "citizen_confirmation":
        return "secondary";
      case "reopened":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <Badge variant={getVariant(status)} className={className}>
      <span className={`status-dot ${STATUS_DOT_COLORS[status]}`} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
