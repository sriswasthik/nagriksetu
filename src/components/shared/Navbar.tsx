"use client";

import Link from 'next/link';
import { ShieldAlert, Menu } from 'lucide-react';
import { UserMenu } from '@/components/shared/UserMenu';
import { NotificationPanel } from '@/components/shared/NotificationPanel';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { NavItem, citizenNav, officerNav, governmentNav } from '@/config/navigation';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavbarProps {
  navType?: 'citizen' | 'officer' | 'government';
}

export function Navbar({ navType }: NavbarProps) {
  let navItems: NavItem[] = [];
  if (navType === 'citizen') navItems = citizenNav;
  else if (navType === 'officer') navItems = officerNav;
  else if (navType === 'government') navItems = governmentNav;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-card/95 backdrop-blur-md text-card-foreground shadow-xs">
      {/* Accent gradient bar */}
      <div className="h-[3px] w-full bg-gradient-to-r from-primary via-secondary to-primary/80" />

      <div className="flex h-[60px] items-center px-4 md:px-6">

        {/* Mobile Sidebar Toggle */}
        {navItems.length > 0 && (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-3 md:hidden rounded-lg hover:bg-accent">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[320px] p-6">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="flex items-center mb-8 mt-2">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary text-primary-foreground mr-3 shadow-md">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <span className="font-extrabold text-xl tracking-tight text-foreground block">CityTrace</span>
                  <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">Civic Ops Platform</span>
                </div>
              </div>
              <MobileNavItems items={navItems} />
            </SheetContent>
          </Sheet>
        )}

        <div className="flex items-center flex-1">
          <Link href="/" className="group flex items-center mr-6">
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary text-primary-foreground mr-3 shadow-sm transition-all duration-200 group-hover:scale-105 group-hover:shadow-md">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <span className="font-extrabold text-xl tracking-tight text-foreground hidden sm:inline-block transition-colors group-hover:text-primary">
              CityTrace
            </span>
          </Link>
        </div>

        <div className="flex items-center justify-end gap-3 flex-1">
          <NotificationPanel />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function MobileNavItems({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col space-y-1.5">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const isReportIssue = item.href === '/citizen/report';

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : isReportIssue
                  ? "gradient-primary text-white hover:opacity-95 mt-3 shadow-sm font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className={cn(
              "mr-3.5 h-5 w-5",
              isActive ? "text-primary-foreground" : isReportIssue ? "text-white" : "text-muted-foreground"
            )} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
