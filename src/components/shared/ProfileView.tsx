"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Mail, Phone, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeaderSkeleton } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { authService } from "@/lib/services/auth";
import { formatDate } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  citizen: "Resident",
  officer: "Field Officer",
  supervisor: "Supervisor",
  government_admin: "City Administrator",
};

/**
 * Shared profile screen for every role.
 *
 * Read-only on purpose: there is no profile-update service in the
 * codebase yet, and rendering editable fields that silently discard
 * changes would be worse than showing none. Editing can be added
 * once an update endpoint exists.
 */
export function ProfileView() {
  const router = useRouter();

  const [profile, setProfile] = useState<Awaited<
    ReturnType<typeof authService.getCurrentUser>
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const user = await authService.getCurrentUser();

      if (!user) {
        setError("You are not signed in. Please sign in to view your profile.");
      } else {
        setProfile(user);
      }
    } catch (loadError) {
      console.error("Failed to load profile:", loadError);
      setError("We couldn't load your profile just now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      await authService.logout();
      toast.success("Signed out");
      router.push("/auth/login");
    } catch (signOutError) {
      console.error("Sign out failed:", signOutError);
      toast.error("Couldn't sign you out", {
        description: "Please try again.",
      });
      setIsSigningOut(false);
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeaderSkeleton withAction={false} />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Profile" />
        <ErrorState
          variant="panel"
          title="Profile unavailable"
          description={error ?? "We couldn't load your profile."}
          onRetry={load}
        />
      </div>
    );
  }

  const initials = (profile.name || "U")
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Profile"
        description="Your account details and how you sign in."
      />

      {/* ---------- Identity ---------- */}
      <section className="rounded-lg border bg-card p-6">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Avatar className="h-16 w-16 border">
            <AvatarImage src={profile.avatar} alt="" />
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">
              {profile.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </Badge>
              {profile.isVerified && (
                <Badge variant="success">
                  <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                  Verified
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        <dl className="space-y-4">
          <div className="flex items-start gap-3">
            <Mail
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Email
              </dt>
              <dd className="mt-0.5 truncate text-sm text-foreground">
                {profile.email || "—"}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Phone
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Mobile
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {profile.mobile || "Not provided"}
              </dd>
            </div>
          </div>

          {profile.department && (
            <div className="flex items-start gap-3">
              <UserIcon
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Department
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {profile.department}
                </dd>
              </div>
            </div>
          )}

          {profile.createdAt && (
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Member since
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {formatDate(profile.createdAt)}
                </dd>
              </div>
            </div>
          )}
        </dl>
      </section>

      {/* ---------- Account actions ---------- */}
      <section className="mt-6 rounded-lg border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Signing out ends this session on this device.
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="mt-4">
              <LogOut className="mr-1 h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of CityTrace?</AlertDialogTitle>
              <AlertDialogDescription>
                You&apos;ll need to sign in again to report issues or check on
                your existing reports.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay signed in</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut} disabled={isSigningOut}>
                {isSigningOut ? (
                  <>
                    <Loader2
                      className="mr-1 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Signing out…
                  </>
                ) : (
                  "Sign out"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
