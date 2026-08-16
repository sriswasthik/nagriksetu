"use client";

import { getCurrentProfile, signIn } from "@/lib/services/auth";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthAside, AuthLayout } from "@/components/layout/AuthLayout";
import { APP_NAME } from "@/lib/constants";
import { homeForRole, isAppRole } from "@/lib/auth/roles";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Please enter your password"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();

  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);

  /*
   * The proxy sets ?error=profile-unavailable when a session is valid but
   * its profile cannot be read. Saying so beats an unexplained bounce
   * back to the sign-in form. Read during render, which is why the auth
   * segment opts into dynamic rendering — see ../layout.tsx.
   */
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "profile-unavailable"
      ? "Your account exists, but we couldn't load your profile. Please contact support."
      : null
  );

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setIsLoading(true);
    setError(null);

    try {
      await signIn({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });

      /*
       * Retrieve the application profile after authentication.
       * The profile contains the application role.
       */
      const profile = await getCurrentProfile();

      if (!profile) {
        throw new Error(
          "Your account was authenticated, but your profile could not be loaded.",
        );
      }

      if (!isAppRole(profile.role)) {
        throw new Error("Your account has an invalid or unsupported role.");
      }

      /*
       * Role-based navigation, from the same table the proxy and the
       * workspace layouts use. Public registration creates citizens;
       * official roles are assigned separately.
       */
      const home = homeForRole(profile.role);

      /*
       * Return the user to whatever protected page sent them here, but
       * only if their role may actually enter it — otherwise a stale
       * /government link would bounce them straight back out again. Only
       * same-origin paths are honoured, so ?next= cannot be used to
       * redirect someone off-site after they authenticate.
       */
      const next = searchParams.get("next");
      const canReturn =
        next !== null &&
        next.startsWith("/") &&
        !next.startsWith("//") &&
        next.startsWith(home);

      router.replace(canReturn ? next : home);

      // Re-run the server layouts so they see the new session.
      router.refresh();
    } catch (err) {
      console.error("Login error:", err);

      const message =
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.";

      /*
       * Map provider errors onto messages a citizen can act on,
       * rather than surfacing raw auth internals.
       */
      if (message.toLowerCase().includes("invalid login credentials")) {
        setError(
          "That email and password combination doesn't match an account.",
        );
      } else if (message.toLowerCase().includes("email not confirmed")) {
        setError(
          "Please confirm your email address using the link we sent, then sign in.",
        );
      } else if (
        message.toLowerCase().includes("profile could not be loaded")
      ) {
        setError(
          "Your account exists, but we couldn't load your profile. Please contact support.",
        );
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      description={`Sign in to report issues and track what your city is fixing.`}
      aside={
        <AuthAside
          heading="Your reports, from submission to verified repair."
          points={[
            {
              title: "Track every stage",
              body: "See exactly where your report is and which department holds it.",
            },
            {
              title: "Evidence on both sides",
              body: "Your photo goes in; the officer's proof of repair comes back.",
            },
            {
              title: "Reopen if it isn't fixed",
              body: "A closed ticket only sticks if the problem is actually gone.",
            },
          ]}
        />
      }
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/register"
            className="rounded font-semibold text-primary transition-colors hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Create one
          </Link>
        </>
      }
    >
      {error && (
        <Alert variant="destructive" className="mb-6" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      className="h-11 pl-10"
                      autoComplete="email"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <button
                    type="button"
                    className="rounded text-xs font-medium text-primary transition-colors hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      toast.info("Password reset is coming soon", {
                        description:
                          "Please contact support if you cannot access your account.",
                      })
                    }
                  >
                    Forgot password?
                  </button>
                </div>
                <FormControl>
                  <PasswordInput
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={isLoading}
            size="lg"
            className="h-11 w-full"
          >
            {isLoading ? (
              <>
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </Form>

      <div className="mt-8 flex items-start gap-3 rounded-lg border bg-card p-3.5">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Officials and field officers sign in here too — your assigned role
          decides which {APP_NAME} workspace opens. Official accounts are
          provisioned by an administrator.
        </p>
      </div>
    </AuthLayout>
  );
}
