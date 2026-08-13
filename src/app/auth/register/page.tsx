"use client";

import { signUp } from "@/lib/services/auth";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  User,
  Phone,
  Mail,
  Lock,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { APP_NAME } from "@/lib/constants";

const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name is too long"),

    mobile: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),

    email: z
      .string()
      .email("Please enter a valid email address"),

    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password is too long"),

    confirmPassword: z
      .string()
      .min(8, "Please confirm your password"),
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
          "An account with this email already exists. Please sign in instead."
        );
      } else if (message.toLowerCase().includes("password")) {
        setError(
          "Password does not meet the required security requirements."
        );
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
    <main className="relative flex min-h-screen items-center justify-center bg-[#F3F4F4] px-4 py-12">
      {/* Brand */}
      <div className="absolute left-6 top-6 sm:left-8 sm:top-8">
        <Link
          href="/"
          className="group flex items-center gap-2 text-[#2C2C2C] transition-colors hover:text-[#853953]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#853953] text-white shadow-sm">
            <ShieldAlert className="h-5 w-5" />
          </div>

          <span className="text-xl font-bold tracking-tight">
            {APP_NAME}
          </span>
        </Link>
      </div>

      <Card className="w-full max-w-md border-[#2C2C2C]/10 bg-white shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#853953]/10">
            <User className="h-6 w-6 text-[#853953]" />
          </div>

          <CardTitle className="text-2xl font-bold text-[#2C2C2C]">
            Create your account
          </CardTitle>

          <CardDescription className="text-[#2C2C2C]/60">
            Join NagrikSetu to report and track civic issues.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert className="mb-5 border-red-200 bg-red-50 text-red-800">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-5 border-green-200 bg-green-50 text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Account created successfully. Redirecting to login...
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
            >
              {/* Full Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#2C2C2C]">
                      Full Name
                    </FormLabel>

                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-[#2C2C2C]/50" />

                        <Input
                          placeholder="Enter your full name"
                          className="h-11 border-[#2C2C2C]/15 bg-[#F3F4F4] pl-10 focus-visible:ring-[#853953]"
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

              {/* Mobile */}
              <FormField
                control={form.control}
                name="mobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#2C2C2C]">
                      Mobile Number
                    </FormLabel>

                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-[#2C2C2C]/50" />

                        <Input
                          type="tel"
                          inputMode="numeric"
                          placeholder="10-digit mobile number"
                          maxLength={10}
                          className="h-11 border-[#2C2C2C]/15 bg-[#F3F4F4] pl-10 focus-visible:ring-[#853953]"
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

                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#2C2C2C]">
                      Email Address
                    </FormLabel>

                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-[#2C2C2C]/50" />

                        <Input
                          type="email"
                          placeholder="you@example.com"
                          className="h-11 border-[#2C2C2C]/15 bg-[#F3F4F4] pl-10 focus-visible:ring-[#853953]"
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

              {/* Password */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#2C2C2C]">
                      Password
                    </FormLabel>

                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-[#2C2C2C]/50" />

                        <Input
                          type="password"
                          placeholder="Create a secure password"
                          className="h-11 border-[#2C2C2C]/15 bg-[#F3F4F4] pl-10 focus-visible:ring-[#853953]"
                          autoComplete="new-password"
                          disabled={isLoading}
                          {...field}
                        />
                      </div>
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Confirm Password */}
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#2C2C2C]">
                      Confirm Password
                    </FormLabel>

                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-[#2C2C2C]/50" />

                        <Input
                          type="password"
                          placeholder="Re-enter your password"
                          className="h-11 border-[#2C2C2C]/15 bg-[#F3F4F4] pl-10 focus-visible:ring-[#853953]"
                          autoComplete="new-password"
                          disabled={isLoading}
                          {...field}
                        />
                      </div>
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Role Information */}
              <div className="rounded-lg border border-[#853953]/15 bg-[#853953]/5 p-3">
                <p className="text-xs leading-relaxed text-[#2C2C2C]/70">
                  New public accounts are registered as{" "}
                  <span className="font-semibold text-[#853953]">
                    Citizens
                  </span>
                  . Official roles are assigned separately by authorized
                  administrators.
                </p>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={isLoading || success}
                className="h-11 w-full bg-[#853953] text-white hover:bg-[#612D53]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </Form>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1 bg-[#2C2C2C]/10" />
            <span className="text-xs text-[#2C2C2C]/40">OR</span>
            <Separator className="flex-1 bg-[#2C2C2C]/10" />
          </div>

          <p className="text-center text-xs leading-relaxed text-[#2C2C2C]/50">
            By creating an account, you agree to use NagrikSetu responsibly
            and provide accurate civic information.
          </p>
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-center gap-2 border-t border-[#2C2C2C]/10 p-6 text-sm text-[#2C2C2C]/60">
          Already have an account?

          <Link
            href="/auth/login"
            className="font-semibold text-[#853953] hover:text-[#612D53] hover:underline"
          >
            Log in
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}