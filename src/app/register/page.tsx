"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout } from "@/components/auth-layout";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const origin = window.location.origin;
    const nextPath = "/admin?confirmed=1";
    const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
      nextPath
    )}`;
    const fullName = `${firstName} ${lastName}`.trim();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: fullName || undefined,
        },
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (data.session) {
      router.replace("/auth/continue");
      router.refresh();
      return;
    }

    setMessage("Check your inbox to confirm your email. Then you can log in.");
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Create a jobs portal account. Member access can be enabled after registration."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="first_name" className="block text-sm font-medium">First name</label>
            <Input
              id="first_name"
              type="text"
              autoComplete="given-name"
              required
              placeholder="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="last_name" className="block text-sm font-medium">Last name</label>
            <Input
              id="last_name"
              type="text"
              autoComplete="family-name"
              required
              placeholder="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium">Email</label>
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
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
            <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Create a password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/20 bg-danger-muted px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-md border border-success/20 bg-success-muted px-3 py-2 text-xs text-success">
            {message}
          </div>
        ) : null}

        <Button
          type="submit"
          className="w-full" size="lg"
          disabled={loading}
        >
          {loading ? "Creating..." : "Create account"}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-semibold text-foreground underline underline-offset-4" href="/admin">
          Log in
        </Link>
      </div>
    </AuthLayout>
  );
}
