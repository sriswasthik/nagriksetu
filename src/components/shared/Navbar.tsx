"use client";

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { UserMenu } from '@/components/shared/UserMenu';
import { NotificationPanel } from '@/components/shared/NotificationPanel';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
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
    <header className="sticky top-0 z-40 w-full border-b bg-card text-card-foreground shadow-sm">
      <div className="flex h-16 items-center px-4 md:px-6">
        
        {/* Mobile Sidebar Toggle */}
        {navItems.length > 0 && (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-4 md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[320px]">
               <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="flex items-center mb-8 mt-4">
                <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary text-primary-foreground mr-3">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <span className="font-bold text-xl tracking-tight text-foreground">NagrikSetu</span>
              </div>
              <MobileNavItems items={navItems} />
            </SheetContent>
          </Sheet>
        )}

        <div className="flex items-center flex-1">
          <Link href="/" className="flex items-center mr-6">
            <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary text-primary-foreground mr-3">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground hidden sm:inline-block">
              NagrikSetu
            </span>
          </Link>
        </div>

        <div className="flex items-center justify-end space-x-4 flex-1">
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
    <nav className="flex flex-col space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              isActive 
                ? "bg-secondary/10 text-secondary font-semibold" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className={cn("mr-3 h-5 w-5", isActive ? "text-secondary" : "text-muted-foreground")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
