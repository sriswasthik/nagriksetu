"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Logo } from "@/components/shared/Logo";
import {
  getNavSections,
  getPrimaryNavItems,
  isNavItemActive,
  type NavType,
} from "@/config/navigation";

/**
 * ============================================================
 * MOBILE NAVIGATION
 * ============================================================
 *
 * Two coordinated surfaces:
 *  - MobileNavDrawer: full navigation behind the header menu button.
 *  - MobileTabBar: thumb-reachable bottom bar for the top tasks.
 *
 * Both resolve their active state through isNavItemActive so they
 * never disagree with the desktop sidebar.
 */

export function MobileNavDrawer({ navType }: { navType: NavType }) {
  const [open, setOpen] = useState(false);
  const sections = getNavSections(navType);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="mr-1 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-[300px] p-0 sm:w-[340px]">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>

        <div className="border-b px-5 py-4">
          <Logo href="/" size="md" />
        </div>

        <nav
          aria-label="Main navigation"
          className="overflow-y-auto px-3 py-4"
        >
          {sections.map((section, sectionIndex) => (
            <div key={section.label} className={cn(sectionIndex > 0 && "mt-6")}>
              {sections.length > 1 && (
                <p className="mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                  {section.label}
                </p>
              )}

              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = isNavItemActive(item, pathname);
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-start gap-3 rounded-md px-3 py-3 transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isActive
                            ? "bg-primary/8 text-primary"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        <Icon
                          className={cn(
                            "mt-0.5 h-5 w-5 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground"
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block text-sm",
                              isActive ? "font-semibold" : "font-medium"
                            )}
                          >
                            {item.label}
                          </span>
                          {item.hint && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {item.hint}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Bottom tab bar. Only rendered below `lg`, where the sidebar is
 * hidden. Touch targets are a minimum of 44px tall.
 */
export function MobileTabBar({ navType }: { navType: NavType }) {
  const items = getPrimaryNavItems(navType);
  const pathname = usePathname();

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Quick navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "border-t bg-card/95 backdrop-blur-md",
        // Clear the iOS home indicator.
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map((item) => {
          const isActive = isNavItemActive(item, pathname);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-2 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-primary"
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[0.6875rem] leading-none",
                    isActive ? "font-semibold" : "font-medium"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
