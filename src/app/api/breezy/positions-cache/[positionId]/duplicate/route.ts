import { NextResponse } from "next/server";
import crypto from "crypto";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import {
  buildDuplicatePositionInsert,
  buildDuplicatePositionListItem,
} from "@/lib/duplicate-position-cache-record.mjs";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PositionListItem = {
  id: string;
  name: string;
  state?: string;
  friendly_id?: string;
  org_type?: string;
  company?: string;
  department?: string;
  priority?: string;
  edited?: boolean;
  hidden?: boolean;
  synced_at?: string | null;
  details_synced_at?: string | null;
};

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

function getBreezyCompanyIdFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  return (searchParams.get("companyId") ?? "").trim();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ positionId: string }> }
) {
  try {
    const user = await requireUser();
    const { positionId } = await params;
    const posId = (positionId ?? "").trim();
    if (!posId) {
      return NextResponse.json({ error: "Missing positionId" }, { status: 400 });
    }

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    await ensureCompanyMembership(admin, user.id);

    const companyId = await getPrimaryCompanyId(admin);
    const { data, error } = await admin
      .from("breezy_positions")
      .select(
        "breezy_position_id,name,state,friendly_id,org_type,company,department,details,overrides,synced_at,details_synced_at"
      )
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .eq("breezy_position_id", posId)
      .maybeSingle();

    if (error) throw new Error(error.message ?? "Failed to load record.");
    if (!data) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
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
      synced_at: string | null;
      details_synced_at: string | null;
    };

    const nextId = `local_${posId}_${crypto.randomUUID().slice(0, 8)}`;
    const insert = buildDuplicatePositionInsert({
      row,
      companyId,
      breezyCompanyId,
      duplicateId: nextId,
    });

    const { error: insertError } = await admin.from("breezy_positions").insert([insert]);
    if (insertError) throw new Error(insertError.message ?? "Failed to duplicate record.");

    clearJobsResponseCache();
    const position: PositionListItem = buildDuplicatePositionListItem(insert);

    return NextResponse.json({ position }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
