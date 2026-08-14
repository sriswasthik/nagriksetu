import { cn } from "@/lib/utils";

type ContainerWidth = "prose" | "form" | "content" | "wide" | "full";

const WIDTHS: Record<ContainerWidth, string> = {
  /** Long-form reading width. */
  prose: "max-w-2xl",
  /** Single-column forms (report flow, auth). */
  form: "max-w-3xl",
  /** Standard app content (citizen views). */
  content: "max-w-5xl",
  /** Data-dense operational views (officer, authority). */
  wide: "max-w-7xl",
  /** Edge-to-edge (maps, full-bleed dashboards). */
  full: "max-w-none",
};

interface ContainerProps extends React.ComponentProps<"div"> {
  width?: ContainerWidth;
}

/**
 * Horizontal rhythm primitive. One place defines the app's content
 * widths and gutters, so pages stay aligned instead of each picking
 * its own max-width.
 */
export function Container({
  width = "content",
  className,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", WIDTHS[width], className)}
      {...props}
    />
  );
}

interface SectionProps extends React.ComponentProps<"section"> {
  /** Vertical spacing scale between major page sections. */
  spacing?: "none" | "sm" | "md" | "lg";
}

const SPACING: Record<NonNullable<SectionProps["spacing"]>, string> = {
  none: "",
  sm: "py-8",
  md: "py-12 md:py-16",
  lg: "py-16 md:py-24",
};

/** Vertical rhythm primitive for landing/marketing sections. */
export function Section({
  spacing = "md",
  className,
  ...props
}: SectionProps) {
  return <section className={cn(SPACING[spacing], className)} {...props} />;
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}

/**
 * Section-level heading. Establishes hierarchy through type scale
 * and an optional eyebrow label rather than wrapping content in
 * yet another card.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      {eyebrow && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {eyebrow}
        </p>
      )}

      <h2 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>

      {description && (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
