import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gmailFetchJson } from "@/lib/email/gmail";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gmail_oauth_state")?.value;
  const rawNextPath = cookieStore.get("gmail_oauth_next")?.value ?? "/company";
  const nextPath = rawNextPath.startsWith("/") ? rawNextPath : "/company";
  cookieStore.delete("gmail_oauth_state");
  cookieStore.delete("gmail_oauth_next");

  const redirectWithStatus = (status: string) => {
    const target = new URL(nextPath, url.origin);
    target.searchParams.set("sharedInbox", status);
    return NextResponse.redirect(target.toString());
  };

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_GMAIL_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      return redirectWithStatus("config_error");
    }

    if (!code || !state || !expectedState || state !== expectedState) {
      return redirectWithStatus("state_error");
    }

    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return redirectWithStatus("unauthenticated");

    const { data: member, error: memberError } = await supabase
      .from("company_members")
      .select("company_id,role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError) {
      console.error("[gmail oauth callback] failed to read member", memberError);
      return redirectWithStatus("member_error");
    }
    if (!member) return redirectWithStatus("forbidden");
    const role = typeof member.role === "string" ? member.role.toLowerCase() : "";
    if (role !== "admin") return redirectWithStatus("admin_required");
    const companyId = member.company_id as string;

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
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
    const tokenData = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !tokenData?.access_token) {
      return redirectWithStatus("token_error");
    }

    let emailAddress = "";
    try {
      const profile = (await gmailFetchJson(
        tokenData.access_token as string,
        "/users/me/profile"
      )) as Record<string, unknown> | null;
      emailAddress =
        profile && typeof profile.emailAddress === "string"
          ? profile.emailAddress
          : "";
    } catch (err) {
      console.error("[gmail oauth callback] profile fetch failed", err);
    }
    if (!emailAddress) return redirectWithStatus("profile_error");

    const existing = await supabase
      .from("company_mailboxes")
      .select("id,oauth_refresh_token")
      .eq("company_id", companyId)
      .eq("is_shared", true)
      .maybeSingle();

    const refreshToken =
      (tokenData.refresh_token as string | undefined) ??
      (existing.data?.oauth_refresh_token as string | null) ??
      null;
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
      : null;

    const upsertRes = await supabase.from("company_mailboxes").upsert({
      id: existing.data?.id ?? undefined,
      company_id: companyId,
      is_shared: true,
      provider: "gmail",
      email_address: emailAddress,
      display_name: null,
      oauth_access_token: tokenData.access_token,
      oauth_refresh_token: refreshToken,
      oauth_scope: tokenData.scope ?? null,
      oauth_token_type: tokenData.token_type ?? null,
      oauth_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });
    if (upsertRes.error) {
      console.error("[gmail oauth callback] failed storing mailbox token", upsertRes.error);
      return redirectWithStatus("store_error");
    }

    return redirectWithStatus("connected");
  } catch (err) {
    console.error("[gmail oauth callback] unexpected error", err);
    return redirectWithStatus("server_error");
  }
}
