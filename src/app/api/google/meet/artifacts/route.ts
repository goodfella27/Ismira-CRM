import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MEET_API_BASE = "https://meet.googleapis.com/v2";

const extractMeetingCode = (link?: string | null) => {
  if (!link) return null;
  const match = link.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return match?.[1] ?? null;
};

const summarizeWithGemini = async (text: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!apiKey) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Summarize this interview transcript in 5 bullet points and 3 key takeaways. Be concise.\n\n${text}`,
              },
            ],
          },
        ],
      }),
    }
  );
  const data = await res.json().catch(() => null);
  const textOut =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.output_text ??
    null;
  return typeof textOut === "string" ? textOut.trim() : null;
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
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const meetingCode =
    body?.meetingCode ||
    extractMeetingCode(body?.meetingLink) ||
    null;
  if (!meetingCode) {
    return NextResponse.json(
      { error: "Missing meeting code." },
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

  const headers = { Authorization: `Bearer ${accessToken}` };
  const filter = `space.meeting_code="${meetingCode}"`;
  const conferenceRes = await fetch(
    `${MEET_API_BASE}/conferenceRecords?filter=${encodeURIComponent(filter)}`,
    { headers }
  );
  const conferenceData = await conferenceRes.json().catch(() => null);
  const conference = conferenceData?.conferenceRecords?.[0] ?? null;
  if (!conference?.name) {
    return NextResponse.json(
      { error: "Conference record not found yet." },
      { status: 404 }
    );
  }

  const recordingsRes = await fetch(
    `${MEET_API_BASE}/${conference.name}/recordings`,
    { headers }
  );
  const recordingsData = await recordingsRes.json().catch(() => null);
  const recordings = recordingsData?.recordings ?? [];
  const recording = recordings[recordings.length - 1] ?? null;

  const transcriptsRes = await fetch(
    `${MEET_API_BASE}/${conference.name}/transcripts`,
    { headers }
  );
  const transcriptsData = await transcriptsRes.json().catch(() => null);
  const transcripts = transcriptsData?.transcripts ?? [];
  const transcript = transcripts[transcripts.length - 1] ?? null;

  let transcriptText: string | null = null;
  if (transcript?.name) {
    const entriesRes = await fetch(
      `${MEET_API_BASE}/${transcript.name}/entries?pageSize=200`,
      { headers }
    );
    const entriesData = await entriesRes.json().catch(() => null);
    const entries = entriesData?.entries ?? [];
    transcriptText = entries
      .map(
        (entry: any) =>
          entry?.transcriptSegment?.text ?? entry?.text ?? ""
      )
      .filter(Boolean)
      .join(" ")
      .slice(0, 4000);
  }

  const summary =
    body?.generateSummary && transcriptText
      ? await summarizeWithGemini(transcriptText)
      : null;

  return NextResponse.json({
    conferenceRecord: conference?.name ?? null,
    recording: recording
      ? {
          state: recording?.state ?? null,
          file: recording?.driveDestination?.file ?? null,
          exportUri: recording?.driveDestination?.exportUri ?? null,
          startTime: recording?.startTime ?? null,
          endTime: recording?.endTime ?? null,
        }
      : null,
    transcript: transcript
      ? {
          state: transcript?.state ?? null,
          document: transcript?.docsDestination?.document ?? null,
          exportUri: transcript?.docsDestination?.exportUri ?? null,
          startTime: transcript?.startTime ?? null,
          endTime: transcript?.endTime ?? null,
        }
      : null,
    transcriptText,
    summary,
  });
}
