import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/shared/Logo";
import { APP_NAME } from "@/lib/constants";

interface AuthLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
  /** Rendered under the card (e.g. "Already have an account?"). */
  footer?: React.ReactNode;
  /** Trust/context panel content for the desktop split view. */
  aside?: React.ReactNode;
}

/**
 * Shared chrome for authentication screens.
 *
 * Split layout: a dark brand panel carries context on desktop, and
 * the form column stands alone on mobile. Both auth pages use this,
 * so login and register cannot drift apart visually.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
  aside,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[1fr_1.1fr]">
      {/* ---------- Brand panel (desktop only) ---------- */}
      <aside className="relative hidden overflow-hidden bg-neutral-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="backdrop-grid-invert mask-fade-edges absolute inset-0"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_30%_0%,rgba(133,57,83,0.42),transparent_70%)]"
        />

        <div className="relative">
          <Logo href="/" size="lg" invert />
        </div>

        {aside && <div className="relative">{aside}</div>}

        <p className="relative text-xs text-white/40">
          © 2026 {APP_NAME}
        </p>
      </aside>

      {/* ---------- Form column ---------- */}
      <main className="flex flex-1 flex-col bg-background">
        {/* Mobile header */}
        <div className="flex items-center justify-between border-b bg-card px-4 py-4 lg:hidden">
          <Logo href="/" size="md" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>

            {children}

            {footer && (
              <div className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
                {footer}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Reusable trust panel content for the auth brand column. */
export function AuthAside({
  heading,
  points,
}: {
  heading: string;
  points: { title: string; body: string }[];
}) {
  return (
    <div className="max-w-sm">
      <h2 className="text-balance text-2xl font-bold leading-snug tracking-tight text-white">
        {heading}
      </h2>

      <ul className="mt-8 space-y-5">
        {points.map((point) => (
          <li key={point.title} className="flex gap-3.5">
            <span
              aria-hidden="true"
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-300"
            />
            <div>
              <p className="text-sm font-semibold text-white/90">{point.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-white/55">
                {point.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
