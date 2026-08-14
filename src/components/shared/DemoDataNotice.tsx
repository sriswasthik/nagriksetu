import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marks a view whose figures come from local sample data rather than
 * the live backend.
 *
 * Work orders and city analytics have no Supabase tables yet — they
 * are served from src/lib/mock. Labelling that plainly matters in a
 * civic product: unlabelled sample numbers on an operations
 * dashboard read as real municipal statistics.
 */
export function DemoDataNotice({
  className,
  detail,
}: {
  className?: string;
  detail?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5",
        className
      )}
    >
      <FlaskConical
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <p className="text-xs leading-relaxed text-amber-900">
        <span className="font-semibold">Sample data.</span>{" "}
        {detail ??
          "These figures come from local demonstration data, not live city records."}
      </p>
    </div>
  );
}
