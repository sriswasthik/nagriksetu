import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /**
   * Heading level for the title. Use "h2" directly under a page h1,
   * "h3" when nested inside a section that already has an h2 — so
   * the document outline never skips a level.
   */
  headingLevel?: "h2" | "h3";
}

/**
 * Standard "nothing here yet" panel — icon, title, description and
 * an optional call-to-action, in a dashed card. Consolidates the
 * pattern duplicated across the citizen/officer list and dashboard
 * pages so future screens can share one look.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  headingLevel: Heading = "h2",
}: EmptyStateProps) {
  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        {Icon && (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
        )}

        <Heading className="text-lg font-semibold text-foreground">{title}</Heading>

        {description && (
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}

        {action && <div className="mt-6">{action}</div>}
      </CardContent>
    </Card>
  );
}
