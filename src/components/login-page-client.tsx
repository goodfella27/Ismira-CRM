"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { AuthLayout } from "@/components/auth-layout";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = searchParams.get("confirmed");
  const requestedNext = searchParams.get("next") ?? "";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    const destination = requestedNext
      ? `/auth/continue?next=${encodeURIComponent(requestedNext)}`
      : "/auth/continue";
    router.replace(destination);
    router.refresh();
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue to your jobs portal or admin workspace."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/20 bg-danger-muted px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {confirmed ? (
          <div className="rounded-md border border-success/20 bg-success-muted px-3 py-2 text-xs text-success">
            Email confirmed. You can now log in.
          </div>
        ) : null}

        <Button
          type="submit"
          className="w-full" size="lg"
          disabled={loading}
        >
          <Lock className="h-4 w-4" />
          {loading ? "Signing in..." : "Log in"}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link className="font-semibold text-foreground underline underline-offset-4" href="/register">
          Create one
        </Link>
      </div>
    </AuthLayout>
  );
}
