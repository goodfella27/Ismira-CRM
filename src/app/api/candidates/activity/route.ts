import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActivityPayload = {
  id?: string;
  candidateId?: string;
  candidate_id?: string;
  type?: string;
  body?: string;
  createdAt?: string;
};

const buildAuthorName = (metadata: Record<string, unknown> | null) => {
  const first = typeof metadata?.first_name === "string" ? metadata.first_name.trim() : "";
  const last = typeof metadata?.last_name === "string" ? metadata.last_name.trim() : "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return (
    combined ||
    (typeof metadata?.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata?.name === "string" && metadata.name.trim()) ||
    (typeof metadata?.display_name === "string" && metadata.display_name.trim()) ||
    ""
  );
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as ActivityPayload | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const candidateId =
    typeof payload.candidateId === "string"
      ? payload.candidateId
      : typeof payload.candidate_id === "string"
      ? payload.candidate_id
      : null;
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const type =
    payload.type === "move" || payload.type === "note" || payload.type === "system"
      ? payload.type
      : "system";

  if (!candidateId || !body) {
    return NextResponse.json({ error: "Missing candidateId or body" }, { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id : crypto.randomUUID();
  const createdAt =
    typeof payload.createdAt === "string" ? payload.createdAt : new Date().toISOString();

  const metadata = user.user_metadata as Record<string, unknown> | null;
  const authorName = buildAuthorName(metadata);

  const admin = createSupabaseAdminClient();
  const { error: insertError } = await admin.from("candidate_activity").insert({
    id,
    candidate_id: candidateId,
    type,
    body,
    created_at: createdAt,
    author_name: authorName || null,
    author_email: user.email ?? null,
    author_id: user.id,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}
