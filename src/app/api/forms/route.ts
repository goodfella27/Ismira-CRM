import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FORM_FIELD_KEYS } from "@/lib/form-fields";

export const runtime = "nodejs";

const getRequestUser = async () => {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.auth.getUser();
    return {
      supabase,
      user: result.data.user,
      error: result.error,
    };
  } catch (error) {
    return {
      supabase: null,
      user: null,
      error:
        error instanceof Error ? error : new Error("Failed to verify session."),
    };
  }
};

export async function GET(request: Request) {
  const { user, error: userError } = await getRequestUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: userError?.message ?? "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const candidateId = searchParams.get("candidateId");
  if (!candidateId) {
    return NextResponse.json(
      { error: "Missing candidateId" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("intake_forms")
    .select("token, fields, status, expires_at, created_at, submitted_at")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to load form" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    token: data.token,
    fields: data.fields ?? [],
    status: data.status ?? "pending",
    expiresAt: data.expires_at ?? null,
    submittedAt: data.submitted_at ?? null,
  });
}

export async function POST(request: Request) {
  const { user, error: userError } = await getRequestUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: userError?.message ?? "Unauthorized" },
      { status: 401 }
    );
  }

  let payload: {
    candidateId?: string;
    candidateName?: string;
    candidateEmail?: string | null;
    fields?: string[];
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!payload.candidateId || !Array.isArray(payload.fields)) {
    return NextResponse.json({ error: "Missing candidate or fields" }, { status: 400 });
  }

  const allowed = new Set(FORM_FIELD_KEYS);
  const fields = payload.fields.filter((field) => allowed.has(field as (typeof FORM_FIELD_KEYS)[number]));

  if (fields.length === 0) {
    return NextResponse.json({ error: "No valid fields selected" }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("intake_forms").insert({
    token,
    candidate_id: payload.candidateId,
    candidate_name: payload.candidateName ?? null,
    candidate_email: payload.candidateEmail ?? null,
    fields,
    status: "pending",
    expires_at: expiresAt,
    created_by: user.id,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to create form" },
      { status: 500 }
    );
  }

  return NextResponse.json({ token });
}
