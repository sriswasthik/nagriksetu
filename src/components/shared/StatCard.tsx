import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "@/components/shared/AnimatedCounter";

type StatTone = "default" | "brand" | "warning" | "danger" | "success";

const TONE: Record<StatTone, { icon: string; value: string; border?: string }> = {
  default: { icon: "bg-muted text-muted-foreground", value: "text-foreground" },
  brand: { icon: "bg-primary/10 text-primary", value: "text-foreground" },
  warning: { icon: "bg-amber-50 text-amber-700", value: "text-foreground" },
  danger: {
    icon: "bg-red-50 text-red-700",
    value: "text-destructive",
    border: "border-destructive/30",
  },
  success: { icon: "bg-emerald-50 text-emerald-700", value: "text-foreground" },
};

interface StatCardProps {
  label: string;
  value: number | string;
  /** Context line under the value — say what the number means. */
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  suffix?: string;
  decimals?: number;
  /** Makes the whole tile a link to the underlying records. */
  href?: string;
  className?: string;
}

/**
 * Canonical metric tile. Replaces the ad-hoc Card+CardHeader+
 * CardContent stat blocks that were re-implemented on every
 * dashboard.
 *
 * Numeric values count up on first view; strings render as-is.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  suffix,
  decimals = 0,
  href,
  className,
}: StatCardProps) {
  const t = TONE[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>

        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              t.icon
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>

      <p
        className={cn(
          "mt-3 text-3xl font-bold tracking-tight tabular",
          t.value
        )}
      >
        {typeof value === "number" ? (
          <AnimatedCounter value={value} suffix={suffix} decimals={decimals} />
        ) : (
          <>
            {value}
            {suffix}
          </>
        )}
      </p>

      {hint && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </>
  );

  const base = cn(
    "rounded-lg border bg-card p-5 transition-shadow",
    t.border,
    className
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          "group relative block hover:border-primary/40 hover:shadow-md",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      >
        {body}
        <ArrowUpRight
          className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      </Link>
    );
  }

  return <div className={base}>{body}</div>;
}
