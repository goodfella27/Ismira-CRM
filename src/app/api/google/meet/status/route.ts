import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

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
  const attendeeEmail = body?.attendeeEmail;
  if (!eventId || !attendeeEmail) {
    return NextResponse.json(
      { error: "Missing event id or attendee email." },
      { status: 400 }
    );
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

  const eventRes = await fetch(`${GOOGLE_EVENTS_URL}/${eventId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const eventData = await eventRes.json().catch(() => null);
  if (!eventRes.ok) {
    return NextResponse.json(
      { error: eventData?.error?.message ?? "Failed to fetch event." },
      { status: 400 }
    );
  }

  const normalizedEmail = String(attendeeEmail).toLowerCase();
  const attendees = Array.isArray(eventData?.attendees)
    ? eventData.attendees
    : [];
  const attendee = attendees.find(
    (item: { email?: string }) =>
      item.email && item.email.toLowerCase() === normalizedEmail
  );

  return NextResponse.json({
    status: attendee?.responseStatus ?? "needsAction",
    email: attendee?.email ?? attendeeEmail,
    updated: eventData?.updated ?? null,
  });
}
