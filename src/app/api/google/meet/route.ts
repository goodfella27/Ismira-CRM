import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const REQUIRED_GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

const TIMEZONE_MAP: Record<string, string> = {
  "GMT+02:00 - Europe/Vilnius": "Europe/Vilnius",
  "GMT+01:00 - Europe/Warsaw": "Europe/Warsaw",
  "GMT+00:00 - UTC": "UTC",
  "GMT-05:00 - America/New York": "America/New_York",
};

const parseDurationMinutes = (value?: string | null) => {
  if (!value) return 30;
  const match = value.match(/\d+/);
  if (!match) return 30;
  return Number(match[0]) || 30;
};

const hasGoogleScopes = (scopeValue: unknown, requiredScopes: string[]) => {
  if (typeof scopeValue !== "string" || !scopeValue.trim()) return false;
  const granted = new Set(scopeValue.split(/\s+/).filter(Boolean));
  if (granted.has("https://www.googleapis.com/auth/calendar")) return true;
  return requiredScopes.every((scope) => granted.has(scope));
};

const addMinutes = (date: string, time: string, minutesToAdd: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const totalMinutes = hour * 60 + minute + minutesToAdd;
  const dayOffset = Math.floor(totalMinutes / 1440);
  const remainder = ((totalMinutes % 1440) + 1440) % 1440;
  const endHour = Math.floor(remainder / 60);
  const endMinute = remainder % 60;
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  dateObj.setUTCDate(dateObj.getUTCDate() + dayOffset);
  const endDate = dateObj.toISOString().slice(0, 10);
  const endTime = `${String(endHour).padStart(2, "0")}:${String(
    endMinute
  ).padStart(2, "0")}`;
  return { endDate, endTime };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getMeetLink = (payload: unknown) => {
  if (!isRecord(payload)) return null;
  if (typeof payload.hangoutLink === "string" && payload.hangoutLink) {
    return payload.hangoutLink;
  }

  const conferenceData = payload.conferenceData;
  if (!isRecord(conferenceData)) return null;
  const entryPoints = conferenceData.entryPoints;
  if (!Array.isArray(entryPoints)) return null;
  const video = entryPoints.find((entry) => {
    if (!isRecord(entry)) return false;
    return entry.entryPointType === "video";
  });
  if (isRecord(video) && typeof video.uri === "string" && video.uri) {
    return video.uri;
  }

  return null;
};

const refreshAccessToken = async ({
  clientId,
  clientSecret,
  refreshToken,
}: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) => {
  const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const refreshData = await refreshRes.json().catch(() => null);
  if (!refreshRes.ok || !refreshData?.access_token) {
    return { accessToken: null, refreshData };
  }
  return { accessToken: String(refreshData.access_token), refreshData };
};

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
  const sessionRes = await supabase.auth.getSession();
  let user = sessionRes.data.session?.user ?? null;
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  }
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.date || !body?.time) {
    return NextResponse.json(
      { error: "Missing meeting date or time." },
      { status: 400 }
    );
  }

  const timezone = TIMEZONE_MAP[body.timezone] ?? "UTC";
  const durationMinutes = parseDurationMinutes(body.duration);
  const { endDate, endTime } = addMinutes(body.date, body.time, durationMinutes);
  const startDateTime = `${body.date}T${body.time}:00`;
  const endDateTime = `${endDate}T${endTime}:00`;

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Supabase admin configuration is missing." },
      { status: 500 }
    );
  }
  const tokenRow = await admin
    .from("google_oauth_tokens")
    .select("access_token,refresh_token,expires_at,scope")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!tokenRow.data?.access_token) {
    return NextResponse.json(
      { error: "Google account not connected." },
      { status: 401 }
    );
  }

  if (!hasGoogleScopes(tokenRow.data.scope, REQUIRED_GOOGLE_SCOPES)) {
    return NextResponse.json(
      {
        error:
          "Google connection is missing required permissions. Reconnect Google and approve Calendar access.",
      },
      { status: 403 }
    );
  }

  let accessToken = tokenRow.data.access_token;
  const expiresAt = tokenRow.data.expires_at
    ? new Date(tokenRow.data.expires_at).getTime()
    : null;
  const needsRefresh = expiresAt ? Date.now() > expiresAt - 60_000 : false;

  if (needsRefresh && !tokenRow.data.refresh_token) {
    return NextResponse.json(
      { error: "Google session expired. Please reconnect Google." },
      { status: 401 }
    );
  }

  if (needsRefresh && tokenRow.data.refresh_token) {
    const refreshed = await refreshAccessToken({
      clientId,
      clientSecret,
      refreshToken: tokenRow.data.refresh_token,
    });
    if (refreshed.accessToken) {
      accessToken = refreshed.accessToken;
      await admin.from("google_oauth_tokens").upsert({
        user_id: user.id,
        access_token: refreshed.accessToken,
        refresh_token: tokenRow.data.refresh_token,
        scope: refreshed.refreshData?.scope ?? null,
        token_type: refreshed.refreshData?.token_type ?? null,
        expires_at: refreshed.refreshData?.expires_in
          ? new Date(Date.now() + refreshed.refreshData.expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      });
    } else {
      return NextResponse.json(
        { error: "Google session expired. Please reconnect Google." },
        { status: 401 }
      );
    }
  }

  const attendees = Array.isArray(body.attendees)
    ? body.attendees
    : [];

  const eventBody = {
    summary: body.title || "Interview",
    description: body.description || "",
    location: body.location || "",
    start: { dateTime: startDateTime, timeZone: timezone },
    end: { dateTime: endDateTime, timeZone: timezone },
    attendees: attendees
      .filter((email: string) => typeof email === "string" && email.includes("@"))
      .map((email: string) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const createEvent = (token: string) =>
    fetch(`${GOOGLE_EVENTS_URL}?conferenceDataVersion=1&sendUpdates=all`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });

  let meetRes = await createEvent(accessToken);
  let meetData = await meetRes.json().catch(() => null);

  if (meetRes.status === 401) {
    if (!tokenRow.data.refresh_token) {
      return NextResponse.json(
        { error: "Google session expired. Please reconnect Google." },
        { status: 401 }
      );
    }

    const refreshed = await refreshAccessToken({
      clientId,
      clientSecret,
      refreshToken: tokenRow.data.refresh_token,
    });

    if (!refreshed.accessToken) {
      return NextResponse.json(
        { error: "Google session expired. Please reconnect Google." },
        { status: 401 }
      );
    }

    accessToken = refreshed.accessToken;
    await admin.from("google_oauth_tokens").upsert({
      user_id: user.id,
      access_token: refreshed.accessToken,
      refresh_token: tokenRow.data.refresh_token,
      scope: refreshed.refreshData?.scope ?? null,
      token_type: refreshed.refreshData?.token_type ?? null,
      expires_at: refreshed.refreshData?.expires_in
        ? new Date(Date.now() + refreshed.refreshData.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    });

    meetRes = await createEvent(accessToken);
    meetData = await meetRes.json().catch(() => null);
  }

  if (!meetRes.ok) {
    const status =
      typeof meetRes.status === "number" && meetRes.status >= 400 && meetRes.status < 600
        ? meetRes.status
        : 400;
    return NextResponse.json(
      { error: meetData?.error?.message ?? "Failed to create meeting." },
      { status }
    );
  }

  const meetLink = getMeetLink(meetData);
  return NextResponse.json({
    meetLink,
    eventId: meetData?.id ?? null,
    start: startDateTime,
    end: endDateTime,
    timezone,
  });
}
