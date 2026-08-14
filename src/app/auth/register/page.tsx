"use client";

import { signUp } from "@/lib/services/auth";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Mail, Phone, User } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthAside, AuthLayout } from "@/components/layout/AuthLayout";

const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name is too long"),

    mobile: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),

    email: z.string().email("Please enter a valid email address"),

    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password is too long"),

    confirmPassword: z.string().min(8, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      mobile: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: RegisterFormValues) {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await signUp({
        fullName: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        phone: values.mobile.trim(),
      });

      /*
       * Supabase may require email confirmation depending
       * on the project's Authentication settings.
       *
       * If email confirmation is enabled, user will receive
       * a confirmation email and may not have an active session yet.
       */
      if (!result.user) {
        throw new Error("Unable to create your account.");
      }

      setSuccess(true);

      /*
       * Give the user a moment to see the success message.
       */
      setTimeout(() => {
        router.push("/auth/login");
      }, 1200);
    } catch (err) {
      console.error("Registration error:", err);

      const message =
        err instanceof Error
          ? err.message
          : "Failed to create your account. Please try again.";

      /*
       * Convert common Supabase errors into user-friendly messages.
       */
      if (message.toLowerCase().includes("already registered")) {
        setError(
          "An account with this email already exists. Try signing in instead."
        );
      } else if (message.toLowerCase().includes("password")) {
        setError("That password doesn't meet the security requirements.");
      } else if (message.toLowerCase().includes("invalid email")) {
        setError("Please enter a valid email address.");
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Report civic issues in your area and follow them through to a verified repair."
      aside={
        <AuthAside
          heading="It takes about a minute to report a problem."
          points={[
            {
              title: "Photo and location",
              body: "Snap the issue — your coordinates are captured automatically.",
            },
            {
              title: "Routed automatically",
              body: "Reports are categorised and sent to the right department.",
            },
            {
              title: "Follow every update",
              body: "Get notified as your report moves toward resolution.",
            },
          ]}
        />
      }
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="rounded font-semibold text-primary transition-colors hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sign in
          </Link>
        </>
      }
    >
      {error && (
        <Alert variant="destructive" className="mb-6" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-6" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            Account created. Taking you to sign in…
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <div className="relative">
                    <User
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      placeholder="Enter your full name"
                      className="h-11 pl-10"
                      autoComplete="name"
                      disabled={isLoading}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mobile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mobile number</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Phone
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      className="h-11 pl-10"
                      autoComplete="tel"
                      disabled={isLoading}
                      {...field}
                      onChange={(event) => {
                        const value = event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 10);

                        field.onChange(value);
                      }}
                    />
                  </div>
                </FormControl>
                <FormDescription>
                  Used to notify you about updates to your reports.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      className="h-11 pl-10"
                      autoComplete="email"
                      disabled={isLoading}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder="Create a password"
                    autoComplete="new-password"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormDescription>At least 8 characters.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              New accounts are registered as{" "}
              <span className="font-semibold text-primary">residents</span>.
              Officer and administrator roles are assigned separately by an
              authorised administrator.
            </p>
          </div>

          <Button
            type="submit"
            disabled={isLoading || success}
            size="lg"
            className="h-11 w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
