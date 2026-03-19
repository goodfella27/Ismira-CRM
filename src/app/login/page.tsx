"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";

import { AuthLayout } from "@/components/auth-layout";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    router.push("/pipeline");
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to manage candidates and pipeline updates."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-3">
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
          <div className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-3">
            <Lock className="h-4 w-4 text-slate-400" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full border-none bg-transparent text-sm outline-none"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#3f3d8a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#353377] disabled:opacity-70"
          disabled={loading}
        >
          <Lock className="h-4 w-4" />
          {loading ? "Signing in..." : "Log in"}
        </button>
      </form>

      <div className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <Link className="font-semibold text-emerald-600" href="/register">
          Create one
        </Link>
      </div>
    </AuthLayout>
  );
}
