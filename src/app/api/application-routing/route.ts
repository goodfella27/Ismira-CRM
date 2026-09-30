import { NextResponse } from "next/server";
import { requireCurrentAdmin } from "@/lib/auth/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listApplicationMailerLiteGroups, readApplicationRoutingSettings } from "@/lib/application-mailerlite";
import { parseRoutingSettings } from "@/lib/application-routing";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try { await requireCurrentAdmin(); } catch { return NextResponse.json({ error: "Admin access required." }, { status: 403 }); }
  try {
    const [settings, groupsResult, deliveriesResult] = await Promise.all([
      readApplicationRoutingSettings(),
      listApplicationMailerLiteGroups().then(groups => ({ groups, connectionError: null as string | null })).catch(error => ({ groups: [], connectionError: error instanceof Error ? error.message : "MailerLite unavailable." })),
      createSupabaseAdminClient().from("application_mailerlite_deliveries")
        .select("id,email,bucket,group_id,status,attempts,last_error,created_at").neq("status", "sent").order("created_at", { ascending: true }).limit(50),
    ]);
    if (deliveriesResult.error) throw new Error("Unable to load communication deliveries.");
    return NextResponse.json({ settings, ...groupsResult, deliveries: deliveriesResult.data ?? [] }, { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load routing." }, { status: 503, headers }); }
}
export async function PUT(request: Request) {
  let userId: string;
  try { userId = (await requireCurrentAdmin()).userId; } catch { return NextResponse.json({ error: "Admin access required." }, { status: 403 }); }
  let settings;
  try { settings = parseRoutingSettings(await request.json()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid settings." }, { status: 400 }); }
  try {
    // Allow disabling routing during an upstream outage without needing a group lookup.
    if (settings.enabled) {
      const groups = await listApplicationMailerLiteGroups();
      if (Object.values(settings.groups).some(id => !groups.some(group => group.id === id))) return NextResponse.json({ error: "One or more selected MailerLite groups no longer exist. Refresh and choose again." }, { status: 400 });
    }
    const { error } = await createSupabaseAdminClient().from("application_routing_settings").upsert({
      id: true, ...settings, updated_by: userId, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Unable to save routing settings.");
    return NextResponse.json({ settings }, { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save routing." }, { status: 503 }); }
}
