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
  MapPin,
  Brain,
  BarChart,
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

function getPasswordStrength(pass: string) {
  if (!pass) return { score: 0, label: "", color: "bg-border" };
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;

  switch (score) {
    case 1:
      return { score: 25, label: "Weak", color: "bg-red-500" };
    case 2:
      return { score: 50, label: "Fair", color: "bg-amber-500" };
    case 3:
      return { score: 75, label: "Good", color: "bg-blue-500" };
    case 4:
      return { score: 100, label: "Strong", color: "bg-emerald-500" };
    default:
      return { score: 0, label: "", color: "bg-border" };
  }
}

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

  const passwordValue = form.watch("password");
  const strength = getPasswordStrength(passwordValue || "");

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

      if (!result.user) {
        throw new Error("Unable to create your account.");
      }

      setSuccess(true);

      setTimeout(() => {
        router.push("/auth/login");
      }, 1200);
    } catch (err) {
      console.error("Registration error:", err);

      const message =
        err instanceof Error
          ? err.message
          : "Failed to create your account. Please try again.";

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
    <main className="relative flex min-h-screen bg-background">
      {/* Left Brand Panel — visible on md+ */}
      <div className="hidden md:flex md:w-[45%] lg:w-[50%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#13240F] via-[#1D3B17] to-[#3C6E25]" />
        {/* Dot pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }} />

        <div className="relative z-10 flex flex-col justify-between p-10 lg:p-14 text-white w-full">
          {/* Brand */}
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm shadow-sm transition-transform duration-200 group-hover:scale-105">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">{APP_NAME}</span>
          </Link>

          {/* Value Props */}
          <div className="space-y-8 max-w-sm">
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold leading-tight text-balance">
                Join NagrikSetu Today
              </h2>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">
                Empower your community. Report issues, track progress, and build a better city together.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { icon: MapPin, text: "Instant location detection" },
                { icon: Brain, text: "Automated department routing" },
                { icon: BarChart, text: "Transparent resolution pipeline" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                    <item.icon className="h-4 w-4 text-white/80" />
                  </div>
                  <span className="text-sm text-white/75 font-medium">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-[11px] text-white/30">
            © 2026 NagrikSetu · Smart India Hackathon
          </p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        {/* Mobile brand — visible below md */}
        <div className="fixed left-5 top-5 z-10 md:hidden">
          <Link href="/" className="group flex items-center gap-2 text-foreground transition-colors hover:text-primary">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <ShieldAlert className="h-[18px] w-[18px]" />
            </div>
            <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
          </Link>
        </div>

        <Card className="w-full max-w-[440px] border-border/50 shadow-lg animate-fade-in my-auto">
          <CardHeader className="space-y-1.5 text-center pb-4">
            <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/8">
              <User className="h-5 w-5 text-primary" />
            </div>

            <CardTitle className="text-xl font-bold text-foreground">
              Create your account
            </CardTitle>

            <CardDescription className="text-muted-foreground text-sm">
              Join NagrikSetu to report and track civic issues
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-0">
            {error && (
              <Alert className="mb-5 border-red-200 bg-red-50 text-red-800">
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="mb-5 border-emerald-200 bg-emerald-50 text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="text-sm font-medium">
                  Account created successfully! Redirecting to sign in...
                </AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-3.5"
              >
                {/* Full Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground text-xs font-semibold">
                        Full Name
                      </FormLabel>

                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />

                          <Input
                            placeholder="Enter your full name"
                            className="h-10 border-border/60 bg-muted/30 pl-10 focus-visible:ring-primary text-sm"
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
                      <FormLabel className="text-foreground text-xs font-semibold">
                        Mobile Number
                      </FormLabel>

                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />

                          <Input
                            type="tel"
                            inputMode="numeric"
                            placeholder="10-digit mobile number"
                            maxLength={10}
                            className="h-10 border-border/60 bg-muted/30 pl-10 focus-visible:ring-primary text-sm"
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
                      <FormLabel className="text-foreground text-xs font-semibold">
                        Email Address
                      </FormLabel>

                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />

                          <Input
                            type="email"
                            placeholder="you@example.com"
                            className="h-10 border-border/60 bg-muted/30 pl-10 focus-visible:ring-primary text-sm"
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
                      <FormLabel className="text-foreground text-xs font-semibold">
                        Password
                      </FormLabel>

                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />

                          <Input
                            type="password"
                            placeholder="Create a secure password"
                            className="h-10 border-border/60 bg-muted/30 pl-10 focus-visible:ring-primary text-sm"
                            autoComplete="new-password"
                            disabled={isLoading}
                            {...field}
                          />
                        </div>
                      </FormControl>

                      {/* Password Strength Indicator */}
                      {passwordValue && (
                        <div className="mt-1.5 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Strength:</span>
                            <span className="font-semibold">{strength.label}</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${strength.color}`}
                              style={{ width: `${strength.score}%` }}
                            />
                          </div>
                        </div>
                      )}

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
                      <FormLabel className="text-foreground text-xs font-semibold">
                        Confirm Password
                      </FormLabel>

                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />

                          <Input
                            type="password"
                            placeholder="Re-enter your password"
                            className="h-10 border-border/60 bg-muted/30 pl-10 focus-visible:ring-primary text-sm"
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

                {/* Role Info */}
                <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Public accounts are created as{" "}
                    <span className="font-semibold text-primary">Citizen</span> profiles. Official accounts are assigned separately.
                  </p>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={isLoading || success}
                  className="h-10 w-full mt-2"
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
          </CardContent>

          <CardFooter className="flex flex-wrap items-center justify-center gap-1.5 border-t border-border/40 p-4 text-sm text-muted-foreground">
            Already have an account?

            <Link
              href="/auth/login"
              className="font-semibold text-primary hover:text-secondary hover:underline transition-colors"
            >
              Log in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}