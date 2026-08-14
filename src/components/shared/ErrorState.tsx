import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  /**
   * "banner" — compact inline row, for above a list that failed to load.
   * "panel"  — full centered card, for a page/section that has nothing else to show.
   */
  variant?: "banner" | "panel";
  /** Heading level for the panel title; keeps the outline gap-free. */
  headingLevel?: "h2" | "h3";
}

/**
 * Standard "something failed to load" state. Consolidates the
 * destructive alert-card pattern duplicated across the citizen and
 * complaint-detail pages so future screens can share one look.
 */
export function ErrorState({
  title = "Unable to load data",
  description,
  onRetry,
  retryLabel = "Try Again",
  className,
  variant = "banner",
  headingLevel: Heading = "h2",
}: ErrorStateProps) {
  if (variant === "panel") {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>

          <Heading className="text-lg font-semibold text-foreground">{title}</Heading>

          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {description}
          </p>

          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="mt-6">
              {retryLabel}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border-destructive/20 bg-destructive/5", className)}>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />

          <div>
            <p className="font-medium text-destructive">{title}</p>
            <p className="mt-1 text-sm text-destructive/80">{description}</p>
          </div>
        </div>

        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
