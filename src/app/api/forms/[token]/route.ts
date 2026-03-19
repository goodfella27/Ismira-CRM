import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("intake_forms")
    .select("id, token, fields, status, candidate_name, expires_at")
    .eq("token", token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  if (data.status !== "pending") {
    return NextResponse.json({ error: "Form already used" }, { status: 410 });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "Form expired" }, { status: 410 });
  }

  return NextResponse.json({
    id: data.id,
    token: data.token,
    fields: data.fields ?? [],
    candidateName: data.candidate_name ?? null,
  });
}
