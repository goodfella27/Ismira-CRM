"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";

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
    const nextPath = "/login?confirmed=1";
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
      router.push("/pipeline");
      return;
    }

    setMessage("Check your inbox to confirm your email. Then you can log in.");
  };

  return (
    <AuthLayout
      title="Create account"
      subtitle="Join the workspace and start reviewing candidates."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <input
              id="first_name"
              type="text"
              autoComplete="given-name"
              required
              className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm outline-none"
              placeholder="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <input
              id="last_name"
              type="text"
              autoComplete="family-name"
              required
              className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm outline-none"
              placeholder="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2">
            <Mail className="h-4 w-4 text-slate-400" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm outline-none"
            placeholder="Create a password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-full bg-[#3f3d8a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#353377] disabled:opacity-70"
          disabled={loading}
        >
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>

      <div className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link className="font-semibold text-emerald-600" href="/login">
          Log in
        </Link>
      </div>
    </AuthLayout>
  );
}
