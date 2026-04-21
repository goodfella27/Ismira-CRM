import { NextResponse } from "next/server";
import crypto from "crypto";

import { ensureCompanyMembership } from "@/lib/company/membership";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHiddenOverride(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

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
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const companyId = membership.companyId;
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

    const rawOverrides = isRecord(row.overrides) ? row.overrides : {};
    const displayName =
      (typeof rawOverrides.name === "string" ? rawOverrides.name.trim() : "") ||
      (row.name ?? "").trim() ||
      row.breezy_position_id;
    const nextName = `${displayName} (Copy)`;
    const nextId = `local_${posId}_${crypto.randomUUID().slice(0, 8)}`;

    const overrides: Record<string, unknown> = {
      ...rawOverrides,
      name: nextName,
      hidden: true,
    };

    const { error: insertError } = await admin.from("breezy_positions").insert([
      {
        company_id: companyId,
        breezy_company_id: breezyCompanyId,
        breezy_position_id: nextId,
        name: row.name,
        state: row.state,
        friendly_id: row.friendly_id,
        org_type: row.org_type,
        company: row.company,
        department: row.department,
        details: row.details,
        overrides,
        synced_at: row.synced_at,
        details_synced_at: row.details_synced_at,
      },
    ]);
    if (insertError) throw new Error(insertError.message ?? "Failed to duplicate record.");

    const overrideCompany =
      typeof overrides.company === "string" ? overrides.company.trim() : "";
    const overrideDepartment =
      typeof overrides.department === "string" ? overrides.department.trim() : "";
    const overridePriority =
      typeof overrides.priority === "string" ? overrides.priority.trim() : "";
    const hidden = parseHiddenOverride(overrides.hidden);
    const edited = Object.keys(overrides).length > 0;

    const position: PositionListItem = {
      id: nextId,
      name: nextName,
      state: row.state ?? undefined,
      friendly_id: row.friendly_id ?? undefined,
      org_type: row.org_type ?? undefined,
      company: overrideCompany || row.company || undefined,
      department: overrideDepartment || row.department || undefined,
      priority: overridePriority || undefined,
      edited,
      hidden,
      synced_at: row.synced_at,
      details_synced_at: row.details_synced_at,
    };

    return NextResponse.json({ position }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

