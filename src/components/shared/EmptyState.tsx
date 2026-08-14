import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
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
}: EmptyStateProps) {
  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        {Icon && (
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
        )}

        <h3 className="text-lg font-semibold text-foreground">{title}</h3>

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
