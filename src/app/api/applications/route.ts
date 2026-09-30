import { NextResponse } from "next/server";
import { requireCurrentAdmin } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export async function GET(request: Request) {
  try { await requireCurrentAdmin(); } catch { return NextResponse.json({ error: "Admin access required." }, { status: 403 }); }
  const input = Number(new URL(request.url).searchParams.get("page") || 1);
  const page = Number.isInteger(input) && input > 0 ? Math.min(input, 100000) : 1;
  const { data, error, count } = await createSupabaseAdminClient().from("application_submissions")
    .select("id,first_name,last_name,email,phone,department,desired_position,experience,is_adult,citizenship,english_level,language,position_id,consent_at,cv_name,cv_size,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
  if (error) return NextResponse.json({ error: "Unable to load applications. Apply the application migration first." }, { status: 503 });
  return NextResponse.json({ applications: data, total: count, page }, { headers: { "Cache-Control": "private, no-store" } });
}
