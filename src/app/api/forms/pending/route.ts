import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  let user: { id: string } | null = null;
  let userError: Error | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.auth.getUser();
    user = result.data.user;
    userError = result.error;
  } catch (error) {
    userError =
      error instanceof Error ? error : new Error("Failed to verify session.");
  }

  if (userError || !user) {
    return NextResponse.json(
      { error: userError?.message ?? "Unauthorized" },
      { status: 401 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("intake_forms")
    .select("token, candidate_id, fields, payload, submitted_at, status")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to load forms" },
      { status: 500 }
    );
  }

  return NextResponse.json({ forms: data ?? [] });
}
