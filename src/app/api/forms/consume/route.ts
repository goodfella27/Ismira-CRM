import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
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

  let payload: { tokens?: string[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const tokens = Array.isArray(payload.tokens)
    ? payload.tokens.filter((token) => typeof token === "string" && token.trim())
    : [];

  if (tokens.length === 0) {
    return NextResponse.json({ error: "Missing tokens" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("intake_forms")
    .update({ status: "consumed" })
    .in("token", tokens);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to update forms" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
