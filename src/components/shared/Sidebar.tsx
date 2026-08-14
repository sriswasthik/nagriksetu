"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NavItem, citizenNav, officerNav, governmentNav } from '@/config/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarProps {
  navType?: 'citizen' | 'officer' | 'government';
}

export function Sidebar({ navType }: SidebarProps) {
  const pathname = usePathname();

  let items: NavItem[] = [];
  if (navType === 'citizen') items = citizenNav;
  else if (navType === 'officer') items = officerNav;
  else if (navType === 'government') items = governmentNav;

  if (!navType || items.length === 0) return null;

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-card h-[calc(100vh-4rem)] sticky top-16">
      <ScrollArea className="flex-1 py-6 px-3">
        <nav className="flex flex-col space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            // Simple active check. Can be more sophisticated for nested routes.
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href) && pathname !== '/citizen/report');
            
            // Special case for report issue to keep it distinct
            const isReportIssue = item.href === '/citizen/report';

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 group",
                  isActive 
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm" 
                    : isReportIssue 
                      ? "gradient-primary text-white hover:opacity-90 mt-4 shadow-sm rounded-lg py-3"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn(
                    "h-[18px] w-[18px]", 
                    isActive ? "text-primary-foreground" : isReportIssue ? "text-white" : "text-muted-foreground group-hover:text-accent-foreground"
                  )} />
                  {item.label}
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={cn(
                    "inline-flex h-5 items-center justify-center rounded-full px-2 text-xs font-semibold",
                    isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground group-hover:text-accent-foreground"
                  )}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      
      <div className="p-4 border-t">
        <p className="text-xs font-medium text-muted-foreground">CityTrace</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground/60">Smart India Hackathon · v1.0</p>
      </div>
    </aside>
  );
}
