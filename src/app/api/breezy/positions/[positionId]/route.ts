import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildSupabasePositionDetails } from "@/lib/position-cache-details.mjs";

export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await params;
    const posId = (positionId ?? "").trim();
    if (!posId) {
      return NextResponse.json({ error: "Missing positionId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const companyParam = (searchParams.get("companyId") ?? "").trim();

    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    let query = admin
      .from("breezy_positions")
      .select(
        "breezy_position_id,name,state,friendly_id,org_type,company,department,details,overrides"
      )
      .eq("company_id", membership.companyId)
      .eq("breezy_position_id", posId);

    if (companyParam) query = query.eq("breezy_company_id", companyParam);

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message ?? "Failed to load position from Supabase.");
    if (!data) {
      return NextResponse.json(
        { error: "Position not found in Supabase." },
        { status: 404 }
      );
    }

    const row = data as {
      breezy_position_id: string;
      name: string | null;
      state: string | null;
      friendly_id: string | null;
      org_type: string | null;
      company: string | null;
      department: string | null;
      details: unknown;
      overrides: unknown;
    };
    const company = typeof row.company === "string" && row.company.trim() ? [row.company.trim()] : [];

    return NextResponse.json(
      buildSupabasePositionDetails({ row, companies: company }),
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
