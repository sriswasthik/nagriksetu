"use client";

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { NotificationItem } from '@/types/analytics';

// Mock notifications
const mockNotifications: NotificationItem[] = [
  {
    id: 'notif_1',
    title: 'Work Order Accepted',
    message: 'Your complaint CMP-2026-001 has been assigned to a field officer.',
    type: 'success',
    isRead: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'notif_2',
    title: 'Duplicate Detected',
    message: 'A report similar to yours was recently filed.',
    type: 'warning',
    isRead: false,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'notif_3',
    title: 'Resolution Pending',
    message: 'Please confirm if complaint CMP-2026-012 has been resolved.',
    type: 'info',
    isRead: true,
    createdAt: new Date(Date.now() - 86400000).toISOString()
  }
];

export function NotificationPanel() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(mockNotifications);
  
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-emerald-500';
      case 'warning': return 'bg-amber-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive animate-pulse-subtle" />
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[400px] sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle>Notifications</SheetTitle>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-8 text-xs text-primary">
                Mark all as read
              </Button>
            )}
          </div>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Bell className="h-12 w-12 opacity-20 mb-4" />
                <p>No new notifications</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div 
                  key={notification.id}
                  className={cn(
                    "relative flex flex-col gap-1 p-4 border-b hover:bg-muted/50 transition-colors cursor-pointer",
                    !notification.isRead && "bg-accent/30"
                  )}
                  onClick={() => {
                    setNotifications(notifications.map(n => n.id === notification.id ? { ...n, isRead: true } : n));
                  }}
                >
                  {!notification.isRead && (
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                  <div className="flex items-center gap-2 pl-4">
                    <span className={cn("h-2 w-2 rounded-full", getNotificationColor(notification.type))} />
                    <span className="text-sm font-semibold text-foreground">{notification.title}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </div>
                  <p className="pl-4 text-sm text-muted-foreground line-clamp-2">
                    {notification.message}
                  </p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
