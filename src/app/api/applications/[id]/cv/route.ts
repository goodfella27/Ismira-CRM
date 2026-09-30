import { NextResponse } from "next/server";
import { requireCurrentAdmin } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireCurrentAdmin(); } catch { return NextResponse.json({ error: "Admin access required." }, { status: 403 }); }
  const { id } = await context.params;
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) return NextResponse.json({ error: "Invalid application." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("application_submissions").select("cv_path,cv_name").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load CV." }, { status: 503 });
  if (!data?.cv_path) return NextResponse.json({ error: "CV not found." }, { status: 404 });
  const result = await admin.storage.from("application-cvs").createSignedUrl(data.cv_path, 60, { download: data.cv_name || true });
  if (result.error || !result.data?.signedUrl) return NextResponse.json({ error: "Unable to download CV." }, { status: 503 });
  return NextResponse.redirect(result.data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
