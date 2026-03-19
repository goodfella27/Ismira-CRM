import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const REQUIRED_GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

const hasGoogleScopes = (scopeValue: unknown, requiredScopes: string[]) => {
  if (typeof scopeValue !== "string" || !scopeValue.trim()) return false;
  const granted = new Set(scopeValue.split(/\s+/).filter(Boolean));

  // Broad scope implies events scope.
  if (granted.has("https://www.googleapis.com/auth/calendar")) {
    return true;
  }

  return requiredScopes.every((scope) => granted.has(scope));
};

export async function GET() {
  let user: { id: string } | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    user = sessionRes.data.session?.user ?? null;
    if (!user) {
      const { data } = await supabase.auth.getUser();
      user = data?.user ?? null;
    }
  } catch {
    user = null;
  }
  if (!user) return NextResponse.json({ connected: false }, { status: 200 });

  let tokenRow:
    | { user_id: string; expires_at: string | null; refresh_token: string | null; scope: string | null }
    | null = null;
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("google_oauth_tokens")
      .select("user_id,expires_at,refresh_token,scope")
      .eq("user_id", user.id)
      .maybeSingle();
    tokenRow = data ?? null;
  } catch {
    tokenRow = null;
  }

  const connected = !!tokenRow;
  const needsReconnect = connected && !tokenRow?.refresh_token;
  const hasRequiredScopes = connected
    ? hasGoogleScopes(tokenRow?.scope, REQUIRED_GOOGLE_SCOPES)
    : false;
  return NextResponse.json({
    connected,
    needsReconnect,
    hasRequiredScopes,
    requiredScopes: REQUIRED_GOOGLE_SCOPES,
    expiresAt: tokenRow?.expires_at ?? null,
  });
}
