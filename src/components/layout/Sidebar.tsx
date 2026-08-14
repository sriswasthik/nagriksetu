"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import {
  getNavSections,
  isNavItemActive,
  type NavItem,
  type NavType,
} from "@/config/navigation";

interface SidebarProps {
  navType: NavType;
}

/**
 * Desktop sidebar. Grouped sections with a clear active state:
 * a brand rail on the active item plus a tinted surface, so the
 * current location reads at a glance without heavy chrome.
 */
export function Sidebar({ navType }: SidebarProps) {
  const sections = getNavSections(navType);

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-r bg-card lg:flex">
      <nav
        aria-label="Main navigation"
        className="flex-1 overflow-y-auto px-3 py-6"
      >
        {sections.map((section, sectionIndex) => (
          <div key={section.label} className={cn(sectionIndex > 0 && "mt-7")}>
            {/* A single unlabelled group needs no header. */}
            {sections.length > 1 && (
              <p className="mb-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                {section.label}
              </p>
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink item={item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t px-5 py-4">
        <p className="text-xs font-medium text-muted-foreground">
          {APP_NAME}
        </p>
        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground/70">
          Civic operations platform
        </p>
      </div>
    </aside>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = isNavItemActive(item, pathname);
  const Icon = item.icon;

  // The primary CTA keeps its filled treatment except when it is the
  // active page, where the standard active state is clearer.
  if (item.emphasis && !isActive) {
    return (
      <Link
        href={item.href}
        className={cn(
          "mt-1 flex items-center gap-3 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold",
          "text-primary-foreground shadow-sm transition-colors hover:bg-primary-700",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      >
        <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
        {item.label}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "bg-primary/8 font-semibold text-primary"
          : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {/* Active rail */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity",
          isActive ? "opacity-100" : "opacity-0"
        )}
      />

      <Icon
        className={cn(
          "h-[1.125rem] w-[1.125rem] shrink-0 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
        aria-hidden="true"
      />

      <span className="truncate">{item.label}</span>

      {item.badge !== undefined && item.badge > 0 && (
        <span
          className={cn(
            "tabular ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
            isActive
              ? "bg-primary text-primary-foreground"
              : "bg-muted-foreground/15 text-muted-foreground"
          )}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}
