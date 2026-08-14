"use client";

import {
  getCurrentProfile,
  signIn,
} from "@/lib/services/auth";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  Mail,
  Loader2,
  Lock,
  UserRound,
  Building2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_NAME } from "@/lib/constants";

const loginSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address"),

  password: z
    .string()
    .min(1, "Please enter your password"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          "Your account was authenticated, but your profile could not be loaded."
        );
      }

      /*
       * Role-based navigation.
       *
       * Public registration creates citizens.
       * Official roles are assigned separately.
       */
      switch (profile.role) {
        case "citizen":
          router.replace("/citizen");
          break;

        case "officer":
        case "supervisor":
          router.replace("/officer");
          break;

        case "government_admin":
          router.replace("/government");
          break;

        default:
          throw new Error(
            "Your account has an invalid or unsupported role."
          );
      }
    } catch (err) {
      console.error("Login error:", err);

      const message =
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.";

      if (
        message.toLowerCase().includes("invalid login credentials")
      ) {
        setError("Incorrect email or password.");
      } else if (
        message.toLowerCase().includes("email not confirmed")
      ) {
        setError(
          "Please confirm your email address before signing in."
        );
      } else if (
        message.toLowerCase().includes("profile could not be loaded")
      ) {
        setError(
          "Your account exists, but your user profile could not be loaded. Please contact support."
        );
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
                From Citizen Voices to Smarter Governance
              </h2>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">
                Report civic issues, track resolutions in real-time, and hold authorities accountable — all in one platform.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { icon: MapPin, text: "GPS-tagged photo reports" },
                { icon: Brain, text: "AI-powered classification" },
                { icon: BarChart, text: "Real-time governance dashboards" },
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

        <Card className="w-full max-w-[420px] border-border/50 shadow-lg animate-fade-in">
          <CardHeader className="space-y-1.5 text-center pb-4">
            <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/8">
              <ShieldAlert className="h-5 w-5 text-primary" />
            </div>

            <CardTitle className="text-xl font-bold text-foreground">
              Welcome back
            </CardTitle>

            <CardDescription className="text-muted-foreground text-sm">
              Sign in to your NagrikSetu account
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-0">
            {error && (
              <Alert className="mb-5 border-red-200 bg-red-50 text-red-800">
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="citizen" className="w-full">
              <TabsList className="mb-5 grid w-full grid-cols-2 bg-muted/50 rounded-lg h-10">
                <TabsTrigger
                  value="citizen"
                  className="rounded-md data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm text-sm font-medium"
                >
                  <UserRound className="mr-1.5 h-3.5 w-3.5" />
                  Citizen
                </TabsTrigger>

                <TabsTrigger
                  value="official"
                  className="rounded-md data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm text-sm font-medium"
                >
                  <Building2 className="mr-1.5 h-3.5 w-3.5" />
                  Official
                </TabsTrigger>
              </TabsList>

              {/* Citizen Login */}
              <TabsContent value="citizen">
                <LoginForm
                  form={form}
                  isLoading={isLoading}
                  onSubmit={onSubmit}
                  identifierLabel="Email Address"
                  placeholder="you@example.com"
                />
              </TabsContent>

              {/* Official Login */}
              <TabsContent value="official">
                <div className="mb-4 rounded-lg border border-secondary/15 bg-secondary/5 p-3">
                  <p className="text-xs leading-relaxed text-foreground/60">
                    Official accounts are provisioned by authorized
                    administrators. Use your registered official email and
                    password.
                  </p>
                </div>

                <LoginForm
                  form={form}
                  isLoading={isLoading}
                  onSubmit={onSubmit}
                  identifierLabel="Official Email"
                  placeholder="official@example.gov.in"
                />
              </TabsContent>
            </Tabs>

            <div className="my-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-border/60" />
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-medium">
                Secure Login
              </span>
              <div className="flex-1 h-px bg-border/60" />
            </div>

            <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3 border border-border/40">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Authentication is handled securely through Supabase
                Auth. Your application role determines which NagrikSetu
                workspace you can access.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-wrap items-center justify-center gap-1.5 border-t border-border/40 p-5 text-sm text-muted-foreground">
            Don&apos;t have an account?

            <Link
              href="/auth/register"
              className="font-semibold text-primary hover:text-secondary hover:underline transition-colors"
            >
              Register here
            </Link>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

/* ============================================================
   LOGIN FORM
   ============================================================ */

interface LoginFormProps {
  form: ReturnType<typeof useForm<LoginFormValues>>;
  isLoading: boolean;
  onSubmit: (values: LoginFormValues) => Promise<void>;
  identifierLabel: string;
  placeholder: string;
}

function LoginForm({
  form,
  isLoading,
  onSubmit,
  identifierLabel,
  placeholder,
}: LoginFormProps) {
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
      >
        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground text-sm font-medium">
                {identifierLabel}
              </FormLabel>

              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />

                  <Input
                    type="email"
                    placeholder={placeholder}
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
              <div className="flex items-center justify-between">
                <FormLabel className="text-foreground text-sm font-medium">
                  Password
                </FormLabel>

                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:text-secondary hover:underline transition-colors"
                  onClick={() => {
                    /*
                     * Password reset will be implemented in the
                     * authentication enhancement step.
                     */
                    alert(
                      "Password reset will be available in the next authentication update."
                    );
                  }}
                >
                  Forgot password?
                </button>
              </div>

              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />

                  <Input
                    type="password"
                    placeholder="Enter your password"
                    className="h-10 border-border/60 bg-muted/30 pl-10 focus-visible:ring-primary text-sm"
                    autoComplete="current-password"
                    disabled={isLoading}
                    {...field}
                  />
                </div>
              </FormControl>

              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit */}
        <Button
          type="submit"
          disabled={isLoading}
          className="h-10 w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing In...
            </>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>
    </Form>
  );
}