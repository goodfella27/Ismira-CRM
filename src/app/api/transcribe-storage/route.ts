import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureCompanyMembership } from "@/lib/company/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

const sanitizePath = (value: string) =>
  value.replace(/[^a-zA-Z0-9/_ .-]/g, "").trim();

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const bucket =
      body && typeof body.bucket === "string" && body.bucket.trim()
        ? body.bucket.trim()
        : "candidate-documents";
    const rawPath = body && typeof body.path === "string" ? body.path : "";
    const objectPath = sanitizePath(rawPath);

    if (!objectPath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    if (objectPath.startsWith("/")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const allowedPrefix = `intake/${user.id}/`;
    if (!objectPath.startsWith(allowedPrefix)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createSupabaseAdminClient();
    await ensureCompanyMembership(admin, user.id);

    const { data: fileBlob, error: downloadError } = await admin.storage
      .from(bucket)
      .download(objectPath);

    if (downloadError || !fileBlob) {
      return NextResponse.json(
        { error: downloadError?.message ?? "File not found" },
        { status: downloadError ? 500 : 404 }
      );
    }

    const filename = objectPath.split("/").pop() || "audio";

    const payload = new FormData();
    payload.append("model", "whisper-1");
    payload.append("file", fileBlob, filename);

    const res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: payload,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? "Transcription failed" },
        { status: res.status }
      );
    }

    return NextResponse.json({ text: data?.text ?? "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

