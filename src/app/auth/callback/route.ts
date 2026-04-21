import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const defaultNext = code ? "/login?confirmed=1" : "/pipeline";
  const rawNext = url.searchParams.get("next") ?? defaultNext;
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/pipeline";

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
