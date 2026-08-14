import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

interface LogoProps {
  href?: string;
  className?: string;
  /** Hide the wordmark, keeping only the mark (tight headers). */
  markOnly?: boolean;
  size?: "sm" | "md" | "lg";
  /** Light treatment for dark surfaces. */
  invert?: boolean;
}

const SIZES = {
  sm: { mark: "h-7 w-7", glyph: "h-3.5 w-3.5", text: "text-base" },
  md: { mark: "h-9 w-9", glyph: "h-4 w-4", text: "text-lg" },
  lg: { mark: "h-11 w-11", glyph: "h-5 w-5", text: "text-xl" },
} as const;

/**
 * CityTrace brand mark: a location pin whose centre is a traced
 * path — the "trace" in the name. Custom SVG so the identity is
 * ours rather than a stock icon-library glyph.
 */
export function Logo({
  href = "/",
  className,
  markOnly = false,
  size = "md",
  invert = false,
}: LogoProps) {
  const s = SIZES[size];

  const content = (
    <>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-[0.6rem] shadow-sm",
          "bg-gradient-to-br from-primary-500 to-secondary-700 text-white",
          s.mark
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={s.glyph}
          aria-hidden="true"
        >
          {/* Pin outline */}
          <path
            d="M12 22s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11Z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Traced route inside the pin */}
          <path
            d="M8.6 12.4h2.2v-2.6h2.6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.95"
          />
          <circle cx="15.1" cy="9.8" r="1.5" fill="currentColor" />
        </svg>
      </span>

      {!markOnly && (
        <span
          className={cn(
            "font-bold tracking-tight",
            invert ? "text-white" : "text-foreground",
            s.text
          )}
        >
          {APP_NAME}
        </span>
      )}
    </>
  );

  const classes = cn(
    "inline-flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-90",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    className
  );

  if (!href) {
    return <span className={classes}>{content}</span>;
  }

  return (
    <Link href={href} className={classes} aria-label={`${APP_NAME} home`}>
      {content}
    </Link>
  );
}
