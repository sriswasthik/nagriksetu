"use client";

import { Logo } from "@/components/shared/Logo";
import { UserMenu } from "@/components/shared/UserMenu";
import { NotificationPanel } from "@/components/shared/NotificationPanel";
import { MobileNavDrawer } from "@/components/layout/MobileNav";
import { type NavType } from "@/config/navigation";

const ROLE_LABELS: Record<NavType, string> = {
  citizen: "Citizen",
  officer: "Field Operations",
  government: "City Operations",
};

interface NavbarProps {
  navType: NavType;
}

/**
 * Application header. Deliberately quiet — the logo anchors the
 * left, a workspace label clarifies which side of the product the
 * user is in, and actions sit right. Navigation itself lives in the
 * sidebar (desktop) or drawer/tab bar (mobile).
 */
export function Navbar({ navType }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-card/95 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
        <MobileNavDrawer navType={navType} />

        <div className="flex min-w-0 items-center gap-3">
          <Logo href="/" size="md" markOnly className="sm:hidden" />
          <Logo href="/" size="md" className="hidden sm:inline-flex" />

          <span
            aria-hidden="true"
            className="hidden h-5 w-px bg-border md:block"
          />

          <span className="hidden truncate text-sm font-medium text-muted-foreground md:block">
            {ROLE_LABELS[navType]}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <NotificationPanel />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
