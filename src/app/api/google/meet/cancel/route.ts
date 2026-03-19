import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function POST(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Missing Google OAuth configuration." },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventId = body?.eventId;
  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "Missing event ID." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const tokenRow = await admin
    .from("google_oauth_tokens")
    .select("access_token,refresh_token,expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!tokenRow.data?.access_token) {
    return NextResponse.json(
      { error: "Google account not connected." },
      { status: 401 }
    );
  }

  let accessToken = tokenRow.data.access_token;
  const expiresAt = tokenRow.data.expires_at
    ? new Date(tokenRow.data.expires_at).getTime()
    : null;
  const needsRefresh = expiresAt ? Date.now() > expiresAt - 60_000 : false;

  if (needsRefresh && tokenRow.data.refresh_token) {
    const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: tokenRow.data.refresh_token,
      }),
    });
    const refreshData = await refreshRes.json().catch(() => null);
    if (refreshRes.ok && refreshData?.access_token) {
      accessToken = refreshData.access_token;
      await admin.from("google_oauth_tokens").upsert({
        user_id: user.id,
        access_token: refreshData.access_token,
        refresh_token: tokenRow.data.refresh_token,
        scope: refreshData.scope ?? null,
        token_type: refreshData.token_type ?? null,
        expires_at: refreshData.expires_in
          ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const deleteRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
      eventId
    )}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!deleteRes.ok && deleteRes.status !== 404) {
    const errorData = await deleteRes.json().catch(() => null);
    return NextResponse.json(
      { error: errorData?.error?.message ?? "Failed to cancel meeting." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
