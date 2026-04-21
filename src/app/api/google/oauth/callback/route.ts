import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  const rawNextPath = cookieStore.get("google_oauth_next")?.value ?? "/pipeline";
  const nextPath = rawNextPath.startsWith("/") ? rawNextPath : "/pipeline";
  cookieStore.delete("google_oauth_state");
  cookieStore.delete("google_oauth_next");

  const redirectWithStatus = (status: string) => {
    const target = new URL(nextPath, url.origin);
    target.searchParams.set("google", status);
    return NextResponse.redirect(target.toString());
  };

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    // Never hard-fail with a blank 500 page; this is an interactive OAuth redirect.
    return redirectWithStatus("config_error");
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithStatus("state_error");
  }

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    // Prefer session from cookies (no network) to avoid OAuth callback failures
    // when Supabase is temporarily unreachable.
    const sessionRes = await supabase.auth.getSession();
    userId = sessionRes.data.session?.user?.id ?? null;
    if (!userId) {
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id ?? null;
    }
  } catch (err) {
    console.error("[google oauth callback] failed to read user session", err);
    return redirectWithStatus("session_error");
  }
  if (!userId) return redirectWithStatus("unauthenticated");

  let tokenRes: Response;
  try {
    tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
  } catch (err) {
    console.error("[google oauth callback] token exchange request failed", err);
    return redirectWithStatus("token_fetch_error");
  }

  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData?.access_token) {
    return redirectWithStatus("token_error");
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (err) {
    console.error("[google oauth callback] missing/invalid Supabase admin config", err);
    return redirectWithStatus("supabase_config_error");
  }
  let existingRefreshToken: string | null = null;
  try {
    const existing = await admin
      .from("google_oauth_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    existingRefreshToken = existing.data?.refresh_token ?? null;
  } catch (err) {
    console.error("[google oauth callback] failed reading existing token", err);
    // Don't block; we can still store the access token.
  }

  const refreshToken =
    tokenData.refresh_token ?? existingRefreshToken ?? null;
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  try {
    await admin.from("google_oauth_tokens").upsert({
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      scope: tokenData.scope ?? null,
      token_type: tokenData.token_type ?? null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[google oauth callback] failed storing token", err);
    return redirectWithStatus("store_error");
  }

  return redirectWithStatus("connected");
}
