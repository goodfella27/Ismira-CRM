import { NextResponse } from "next/server";

import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { asTrimmedString, extractCompany, extractDepartment, extractOrgType } from "@/lib/breezy-position-fields";
import { syncJobCompaniesFromPositions } from "@/lib/job-companies";

export const runtime = "nodejs";

const allowedOverrideKeys = new Set([
  "name",
  "company",
  "department",
  "priority",
  "location_name",
  "summary",
  "description",
  "requirements",
  "responsibilities",
]);

const isMissingPositionsTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_positions/i.test(message);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyOverrides(details: unknown, overrides: unknown) {
  const base = isRecord(details) ? { ...details } : {};
  const overrideObj = isRecord(overrides) ? overrides : {};

  for (const [key, value] of Object.entries(overrideObj)) {
    if (!allowedOverrideKeys.has(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    base[key] = trimmed;
  }

  // Make it easier for existing UI helpers that look for these fields.
  if (typeof overrideObj.location_name === "string" && overrideObj.location_name.trim()) {
    base.locationName = overrideObj.location_name.trim();
    base.location_label = overrideObj.location_name.trim();
  }

  return base;
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
  const companyParam = (searchParams.get("companyId") ?? "").trim();
  if (companyParam) return companyParam;
  try {
    return requireBreezyCompanyId().companyId;
  } catch {
    return "";
  }
}

async function fetchBreezyDetails(breezyCompanyId: string, positionId: string) {
  const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(
    breezyCompanyId
  )}/position/${encodeURIComponent(positionId)}`;
  const res = await breezyFetch(url);
  const type = res.headers.get("content-type") ?? "";
  const isJson = type.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  return { res, body };
}

export async function GET(
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
    const canEdit = membership.role.toLowerCase() === "admin";
    const companyId = membership.companyId;

    const { data, error } = await admin
      .from("breezy_positions")
      .select(
        "breezy_position_id,name,state,friendly_id,org_type,company,department,details,overrides,synced_at,details_synced_at,updated_at"
      )
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .eq("breezy_position_id", posId)
      .maybeSingle();

    if (error) {
      if (isMissingPositionsTableError(error.message ?? "")) {
        const breezy = await fetchBreezyDetails(breezyCompanyId, posId);
        if (!breezy.res.ok) {
          return NextResponse.json(
            { error: "Breezy request failed", status: breezy.res.status, details: breezy.body },
            { status: breezy.res.status }
          );
        }
        return NextResponse.json(
          {
            details: isRecord(breezy.body) ? breezy.body : { data: breezy.body },
            base: breezy.body,
            overrides: {},
            meta: { id: posId },
            warning:
              "Database table `breezy_positions` is not set up. Apply `supabase/breezy_positions.sql` in your Supabase project to enable caching and editing.",
          },
          { status: 200 }
        );
      }
      throw new Error(error.message ?? "Failed to load cached position");
    }

    const row = data as
      | {
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
          updated_at: string | null;
        }
      | null;

    if (row?.details) {
      const merged = applyOverrides(row.details, row.overrides);
      if (row.company && !asTrimmedString((merged as Record<string, unknown>)?.company)) {
        (merged as Record<string, unknown>).company = row.company;
      }
      if (row.department && !asTrimmedString((merged as Record<string, unknown>)?.department)) {
        (merged as Record<string, unknown>).department = row.department;
      }
      return NextResponse.json(
        {
          details: merged,
          base: row.details,
          overrides: isRecord(row.overrides) ? row.overrides : {},
          meta: {
            id: row.breezy_position_id,
            synced_at: row.synced_at,
            details_synced_at: row.details_synced_at,
            updated_at: row.updated_at,
            canEdit,
          },
        },
        { status: 200 }
      );
    }

    // No cached details yet; fetch from Breezy and store.
    const breezy = await fetchBreezyDetails(breezyCompanyId, posId);
    if (!breezy.res.ok) {
      return NextResponse.json(
        { error: "Breezy request failed", status: breezy.res.status, details: breezy.body },
        { status: breezy.res.status }
      );
    }

    const now = new Date().toISOString();
    const payload = breezy.body;
    const name = isRecord(payload) && typeof payload.name === "string" ? payload.name.trim() : null;
    const state =
      isRecord(payload) && typeof payload.state === "string" ? payload.state.trim() : null;
    const friendlyId =
      isRecord(payload) && typeof payload.friendly_id === "string"
        ? payload.friendly_id.trim()
        : null;
    const record = isRecord(payload) ? (payload as Record<string, unknown>) : null;
    const baseCompany = extractCompany(record) || null;
    const baseDepartment = extractDepartment(record) || null;
    const baseOrgType = extractOrgType(record) || null;
    const overridesRecord = isRecord(row?.overrides) ? (row?.overrides as Record<string, unknown>) : {};
    const overrideCompany =
      typeof overridesRecord.company === "string" && overridesRecord.company.trim()
        ? overridesRecord.company.trim()
        : null;
    const overrideDepartment =
      typeof overridesRecord.department === "string" && overridesRecord.department.trim()
        ? overridesRecord.department.trim()
        : null;

    const { error: upsertError } = await admin.from("breezy_positions").upsert(
      [
        {
          company_id: companyId,
          breezy_company_id: breezyCompanyId,
          breezy_position_id: posId,
          name,
          state,
          friendly_id: friendlyId,
          org_type: baseOrgType,
          details: payload,
          company: overrideCompany ?? baseCompany,
          department: overrideDepartment ?? baseDepartment,
          details_synced_at: now,
          synced_at: row?.synced_at ?? now,
        },
      ],
      { onConflict: "company_id,breezy_position_id", defaultToNull: false }
    );
    if (upsertError) throw new Error(upsertError.message ?? "Failed to store details");

    const overrides = row?.overrides ?? {};
    const merged = applyOverrides(payload, overrides) as Record<string, unknown>;
    const effectiveCompany = overrideCompany ?? baseCompany;
    const effectiveDepartment = overrideDepartment ?? baseDepartment;
    if (effectiveCompany && !asTrimmedString(merged.company)) merged.company = effectiveCompany;
    if (effectiveDepartment && !asTrimmedString(merged.department)) {
      merged.department = effectiveDepartment;
    }

    return NextResponse.json(
      {
        details: merged,
        base: payload,
        overrides: isRecord(overrides) ? overrides : {},
        meta: {
          id: posId,
          synced_at: row?.synced_at ?? now,
          details_synced_at: now,
          updated_at: null,
          canEdit,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
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

    const { searchParams } = new URL(request.url);
    const refresh = (searchParams.get("refresh") ?? "").trim();
    if (refresh !== "1" && refresh.toLowerCase() !== "true") {
      return NextResponse.json({ error: "Missing refresh=1" }, { status: 400 });
    }

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;

    const breezy = await fetchBreezyDetails(breezyCompanyId, posId);
    if (!breezy.res.ok) {
      return NextResponse.json(
        { error: "Breezy request failed", status: breezy.res.status, details: breezy.body },
        { status: breezy.res.status }
      );
    }

    const now = new Date().toISOString();
    const payload = breezy.body;
    const name = isRecord(payload) && typeof payload.name === "string" ? payload.name.trim() : null;
    const state =
      isRecord(payload) && typeof payload.state === "string" ? payload.state.trim() : null;
    const friendlyId =
      isRecord(payload) && typeof payload.friendly_id === "string"
        ? payload.friendly_id.trim()
        : null;
    const record = isRecord(payload) ? (payload as Record<string, unknown>) : null;

    const { error: upsertError } = await admin.from("breezy_positions").upsert(
      [
        {
          company_id: companyId,
          breezy_company_id: breezyCompanyId,
          breezy_position_id: posId,
          name,
          state,
          friendly_id: friendlyId,
          org_type: extractOrgType(record) || null,
          details: payload,
          company: extractCompany(record) || null,
          department: extractDepartment(record) || null,
          details_synced_at: now,
        },
      ],
      { onConflict: "company_id,breezy_position_id", defaultToNull: false }
    );
    if (upsertError) throw new Error(upsertError.message ?? "Failed to store details");

    try {
      await syncJobCompaniesFromPositions(admin, {
        companyId,
        breezyCompanyId,
      });
    } catch {
      // Best effort: details refresh should still succeed without company sync.
    }

    return NextResponse.json({ ok: true, details_synced_at: now }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
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

    const payload = (await request.json().catch(() => null)) as
      | { overrides?: unknown; reset?: unknown }
      | null;
    if (!payload) {
      return NextResponse.json({ error: "Missing JSON body" }, { status: 400 });
    }

    const reset = payload.reset === true;
    const overridesInput = payload.overrides;
    if (!reset && !isRecord(overridesInput)) {
      return NextResponse.json({ error: "Expected overrides object" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { data: existing, error: existingError } = await admin
      .from("breezy_positions")
      .select("overrides,details")
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .eq("breezy_position_id", posId)
      .maybeSingle();

    if (existingError) {
      if (isMissingPositionsTableError(existingError.message ?? "")) {
        return NextResponse.json(
          {
            error:
              "Database table `breezy_positions` is not set up. Apply `supabase/breezy_positions.sql` in your Supabase project.",
          },
          { status: 500 }
        );
      }
      throw new Error(existingError.message ?? "Failed to load overrides");
    }

    const currentOverrides =
      existing && isRecord((existing as Record<string, unknown>).overrides)
        ? ((existing as Record<string, unknown>).overrides as Record<string, unknown>)
        : {};
    const currentDetails =
      existing && isRecord((existing as Record<string, unknown>).details)
        ? ((existing as Record<string, unknown>).details as Record<string, unknown>)
        : null;

    const nextOverrides: Record<string, unknown> = reset ? {} : { ...currentOverrides };

    if (!reset) {
      for (const [key, value] of Object.entries(overridesInput as Record<string, unknown>)) {
        if (!allowedOverrideKeys.has(key)) continue;
        if (typeof value !== "string") {
          delete nextOverrides[key];
          continue;
        }
        const trimmed = value.trim();
        if (!trimmed) {
          delete nextOverrides[key];
          continue;
        }
        nextOverrides[key] = trimmed;
      }
    }

    const { error: upsertError } = await admin.from("breezy_positions").upsert(
      [
        {
          company_id: companyId,
          breezy_company_id: breezyCompanyId,
          breezy_position_id: posId,
          overrides: nextOverrides,
          company:
            (typeof nextOverrides.company === "string" && nextOverrides.company.trim()
              ? (nextOverrides.company as string).trim()
              : extractCompany(currentDetails) || null),
          department:
            (typeof nextOverrides.department === "string" && nextOverrides.department.trim()
              ? (nextOverrides.department as string).trim()
              : extractDepartment(currentDetails) || null),
        },
      ],
      { onConflict: "company_id,breezy_position_id", defaultToNull: false }
    );
    if (upsertError) throw new Error(upsertError.message ?? "Failed to save overrides");

    try {
      await syncJobCompaniesFromPositions(admin, {
        companyId,
        breezyCompanyId,
      });
    } catch {
      // Best effort: override save should still succeed without company sync.
    }

    return NextResponse.json({ ok: true, overrides: nextOverrides }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
