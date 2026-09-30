import { NextResponse } from "next/server";
import { requireCurrentAdmin } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliverApplicationCommunication, readApplicationRoutingSettings } from "@/lib/application-mailerlite";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { await requireCurrentAdmin(); } catch { return NextResponse.json({ error: "Admin access required." }, { status: 403 }); }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !/^[a-f0-9]{64}$/.test(body.id)) return NextResponse.json({ error: "Invalid delivery." }, { status: 400 });
  try {
    const settings = await readApplicationRoutingSettings();
    if (!settings.enabled) return NextResponse.json({ error: "Enable communication routing before retrying." }, { status: 409 });
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("application_mailerlite_deliveries").select("id").eq("id", body.id).maybeSingle();
    if (error) throw new Error("Unable to load delivery.");
    if (!data) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    const status = await deliverApplicationCommunication(body.id);
    return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to retry." }, { status: 503 }); }
}
