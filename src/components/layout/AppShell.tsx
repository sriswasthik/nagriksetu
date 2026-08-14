import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTabBar } from "@/components/layout/MobileNav";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/utils";
import { type NavType } from "@/config/navigation";

interface AppShellProps {
  navType: NavType;
  children: React.ReactNode;
  /** Content width for this workspace. */
  width?: "content" | "wide" | "full";
  /** Drop the container/padding entirely — for full-bleed map pages. */
  bleed?: boolean;
}

/**
 * The single application shell for every authenticated workspace.
 *
 * Replaces the three near-identical citizen/officer/government
 * layouts that previously differed only by nav type and max-width,
 * so chrome changes now happen in exactly one place.
 */
export function AppShell({
  navType,
  children,
  width = "content",
  bleed = false,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Skip link — first focusable element on the page. */}
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50",
          "focus:rounded-md focus:bg-primary focus:px-4 focus:py-2",
          "focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg"
        )}
      >
        Skip to main content
      </a>

      <Navbar navType={navType} />

      <div className="flex flex-1">
        <Sidebar navType={navType} />

        <main
          id="main-content"
          className={cn(
            "min-w-0 flex-1 bg-background",
            // Clear the mobile tab bar so content is never hidden behind it.
            "pb-20 lg:pb-0"
          )}
        >
          {bleed ? (
            children
          ) : (
            <Container width={width} className="py-6 md:py-10">
              {children}
            </Container>
          )}
        </main>
      </div>

      <MobileTabBar navType={navType} />
    </div>
  );
}
