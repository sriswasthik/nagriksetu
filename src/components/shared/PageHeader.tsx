import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Trail above the title, for nested pages. */
  breadcrumbs?: Breadcrumb[];
  /** Simple back affordance, as an alternative to breadcrumbs. */
  backHref?: string;
  backLabel?: string;
  /** Small label above the title (e.g. a tracking ID). */
  eyebrow?: React.ReactNode;
  className?: string;
}

/**
 * Page-level heading. Renders the single `h1` for a page and
 * establishes hierarchy through type scale rather than surrounding
 * chrome.
 */
export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
  backHref,
  backLabel = "Back",
  eyebrow,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-8", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;

              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 opacity-50"
                      aria-hidden="true"
                    />
                  )}

                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={isLast ? "font-medium text-foreground" : undefined}
                      aria-current={isLast ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {backHref && !breadcrumbs && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5">{eyebrow}</div>}

          <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>

          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {description}
            </p>
          )}
        </div>

        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}
