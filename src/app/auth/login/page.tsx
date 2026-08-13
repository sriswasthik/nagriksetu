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
import { Separator } from "@/components/ui/separator";
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
            <ShieldAlert className="h-6 w-6 text-[#853953]" />
          </div>

          <CardTitle className="text-2xl font-bold text-[#2C2C2C]">
            Welcome back
          </CardTitle>

          <CardDescription className="text-[#2C2C2C]/60">
            Sign in to your NagrikSetu account
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert className="mb-5 border-red-200 bg-red-50 text-red-800">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Tabs
            defaultValue="citizen"
            className="w-full"
          >
            <TabsList className="mb-6 grid w-full grid-cols-2 bg-[#F3F4F4]">
              <TabsTrigger
                value="citizen"
                className="data-[state=active]:bg-white data-[state=active]:text-[#853953]"
              >
                <UserRound className="mr-2 h-4 w-4" />
                Citizen
              </TabsTrigger>

              <TabsTrigger
                value="official"
                className="data-[state=active]:bg-white data-[state=active]:text-[#853953]"
              >
                <Building2 className="mr-2 h-4 w-4" />
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
              <div className="mb-5 rounded-lg border border-[#612D53]/15 bg-[#612D53]/5 p-3">
                <p className="text-xs leading-relaxed text-[#2C2C2C]/70">
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

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1 bg-[#2C2C2C]/10" />
            <span className="text-xs text-[#2C2C2C]/40">
              SECURE LOGIN
            </span>
            <Separator className="flex-1 bg-[#2C2C2C]/10" />
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-[#F3F4F4] p-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#853953]" />

            <p className="text-xs leading-relaxed text-[#2C2C2C]/60">
              Authentication is handled securely through Supabase
              Auth. Your application role determines which NagrikSetu
              workspace you can access.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-center gap-2 border-t border-[#2C2C2C]/10 p-6 text-sm text-[#2C2C2C]/60">
          Don&apos;t have an account?

          <Link
            href="/auth/register"
            className="font-semibold text-[#853953] hover:text-[#612D53] hover:underline"
          >
            Register here
          </Link>
        </CardFooter>
      </Card>
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
        className="space-y-5"
      >
        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[#2C2C2C]">
                {identifierLabel}
              </FormLabel>

              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-[#2C2C2C]/50" />

                  <Input
                    type="email"
                    placeholder={placeholder}
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
              <div className="flex items-center justify-between">
                <FormLabel className="text-[#2C2C2C]">
                  Password
                </FormLabel>

                <button
                  type="button"
                  className="text-xs font-medium text-[#853953] hover:text-[#612D53] hover:underline"
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
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-[#2C2C2C]/50" />

                  <Input
                    type="password"
                    placeholder="Enter your password"
                    className="h-11 border-[#2C2C2C]/15 bg-[#F3F4F4] pl-10 focus-visible:ring-[#853953]"
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
          className="h-11 w-full bg-[#853953] text-white hover:bg-[#612D53]"
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