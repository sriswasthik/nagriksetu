import { cn } from "@/lib/utils";

/**
 * Base skeleton block. Uses a travelling sheen rather than a flat
 * opacity pulse so loading reads as progress. The sheen is
 * suppressed under prefers-reduced-motion by the global CSS guard.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-neutral-200/70",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_infinite]",
        "after:bg-gradient-to-r after:from-transparent after:via-white/55 after:to-transparent",
        className
      )}
      {...props}
    />
  );
}

/** Text line skeleton. `w` lets callers vary line length naturally. */
function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn(
            "h-4",
            // Last line runs short, the way real text wraps.
            index === lines - 1 && lines > 1 ? "w-3/5" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText };
