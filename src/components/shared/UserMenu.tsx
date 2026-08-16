"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { authService } from '@/lib/services/auth';

const ROLE_LABELS: Record<string, string> = {
  citizen: 'Resident',
  officer: 'Field Officer',
  supervisor: 'Supervisor',
  government_admin: 'City Administrator',
};

/**
 * Header account menu.
 *
 * Profile route is derived from the role so officers and residents
 * land on their own workspace's profile page. Administrators have no
 * dedicated profile route, so they are sent to the citizen-shared
 * view rather than a 404.
 */
const PROFILE_ROUTES: Record<string, string> = {
  citizen: '/citizen/profile',
  officer: '/officer/profile',
  supervisor: '/officer/profile',
};

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<Awaited<
    ReturnType<typeof authService.getCurrentUser>
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        if (!cancelled) setUser(currentUser);
      } catch (error) {
        // Signed-out visitors are an expected case, not a failure.
        console.error('Failed to load user', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    try {
      await authService.logout();
      toast.success('Signed out');

      /*
       * replace + refresh, not push.
       *
       * push leaves the protected page in history, and Next.js keeps
       * rendered segments in its client-side Router Cache, so Back
       * showed the signed-out user their old dashboard chrome. refresh()
       * discards that cache and re-runs the server layouts, which now
       * redirect.
       */
      router.replace('/auth/login');
      router.refresh();
    } catch (error) {
      console.error('Sign out failed', error);
      toast.error("Couldn't sign you out", { description: 'Please try again.' });
    }
  }

  if (isLoading) {
    return <Skeleton className="h-9 w-9 rounded-full" />;
  }

  if (!user) {
    return (
      <Button variant="outline" size="sm" onClick={() => router.push('/auth/login')}>
        Sign in
      </Button>
    );
  }

  const initials = (user.name || 'U')
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const profileHref = PROFILE_ROUTES[user.role] ?? '/citizen/profile';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-9 w-9 rounded-full p-0"
          aria-label="Account menu"
        >
          <Avatar className="h-9 w-9 border">
            <AvatarImage src={user.avatar} alt="" />
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-60" align="end">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold text-foreground">
            {user.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {user.email}
          </p>
          <p className="mt-1.5 text-xs font-medium text-primary">
            {ROLE_LABELS[user.role] ?? user.role}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => router.push(profileHref)}
            className="cursor-pointer"
          >
            <UserIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            Profile
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
