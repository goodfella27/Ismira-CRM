import { NextResponse } from "next/server";

import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { extractCompany, extractDepartment, extractOrgType, isRecord } from "@/lib/breezy-position-fields";
import { pickPositionDescription } from "@/lib/breezy-position-description";
import { buildCountryRows, extractNationalityCountryGroups } from "@/lib/nationality-countries";
import { syncJobCompaniesFromPositions } from "@/lib/job-companies";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type BreezyPosition = {
  _id?: string;
  id?: string;
  name?: string;
  state?: string;
  friendly_id?: string;
  org_type?: string;
};

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

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getId(value: { _id?: string; id?: string } | null | undefined) {
  return asString(value?._id).trim() || asString(value?.id).trim();
}

function normalizePositions(payload: unknown): BreezyPosition[] {
  if (Array.isArray(payload)) return payload as BreezyPosition[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as BreezyPosition[];
    if (Array.isArray(obj.results)) return obj.results as BreezyPosition[];
    if (Array.isArray(obj.positions)) return obj.positions as BreezyPosition[];
  }
  return [];
}

function parseHiddenOverride(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

const isMissingPositionsTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_positions/i.test(message);

const isMissingCountriesTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_position_countries/i.test(message);

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

function parsePositiveInt(value: string | null, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  return rounded >= 0 ? rounded : fallback;
}

function getPaginationFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");
  const limit = Math.max(1, Math.min(100, parsePositiveInt(limitRaw, 20)));
  const offset = parsePositiveInt(offsetRaw, 0);
  return { limit, offset };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function fetchBreezyPositionsList(breezyCompanyId: string): Promise<PositionListItem[]> {
  const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(breezyCompanyId)}/positions`;
  const res = await breezyFetch(url);
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    throw new Error(
      typeof body === "string"
        ? body
        : (body as { message?: string })?.message ?? "Failed to load positions from Breezy"
    );
  }

  return normalizePositions(body)
    .map((pos) => ({
      id: getId(pos),
      name: asString(pos.name).trim() || "Position",
      state: asString(pos.state).trim() || undefined,
      friendly_id: asString(pos.friendly_id).trim() || undefined,
      org_type: asString(pos.org_type).trim() || undefined,
      edited: false,
    }))
    .filter((pos) => pos.id);
}

export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const jobCompanyFilter = (searchParams.get("jobCompany") ?? "").trim();
    const { limit, offset } = getPaginationFromRequest(request);

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);

    let query = admin
      .from("breezy_positions")
      .select(
        "breezy_position_id,name,state,friendly_id,org_type,company,department,overrides,synced_at,details_synced_at",
        { count: "exact" }
      )
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .order("name", { ascending: true });

    if (jobCompanyFilter) {
      query = query.eq("company", jobCompanyFilter);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      const message = (error.message ?? "").toLowerCase();
      const isRangeError =
        message.includes("requested range not satisfiable") ||
        // Some PostgREST versions use `PGRST103` for invalid ranges.
        (typeof (error as unknown as { code?: string }).code === "string" &&
          (error as unknown as { code?: string }).code === "PGRST103");

      if (isRangeError) {
        // Treat as end-of-list (common when infinite scrolling + filters change).
        const countQuery = admin
          .from("breezy_positions")
          .select("breezy_position_id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("breezy_company_id", breezyCompanyId);
        const { count: safeCount } = jobCompanyFilter
          ? await countQuery.eq("company", jobCompanyFilter)
          : await countQuery;
        return NextResponse.json(
          {
            positions: [],
            total: typeof safeCount === "number" ? safeCount : 0,
            nextOffset: null,
          },
          { status: 200 }
        );
      }

      if (isMissingPositionsTableError(error.message ?? "")) {
        if (jobCompanyFilter) {
          return NextResponse.json(
            {
              positions: [],
              total: 0,
              nextOffset: null,
              warning:
                "Company filtering requires cached positions. Apply `supabase/breezy_positions.sql` and run Sync to enable filtering.",
            },
            { status: 200 }
          );
        }
        const fallback = await fetchBreezyPositionsList(breezyCompanyId);
        const total = fallback.length;
        const slice = fallback.slice(offset, offset + limit);
        const nextOffset = offset + slice.length < total ? offset + slice.length : null;
        return NextResponse.json(
          {
            positions: slice,
            total,
            nextOffset,
            warning:
              "Database table `breezy_positions` is not set up. Apply `supabase/breezy_positions.sql` in your Supabase project to enable caching and editing.",
          },
          { status: 200 }
        );
      }
      throw new Error(error.message ?? "Failed to load cached positions");
    }

    type Row = {
      breezy_position_id: string;
      name: string | null;
      state: string | null;
      friendly_id: string | null;
      org_type: string | null;
      company: string | null;
      department: string | null;
      overrides: unknown;
      synced_at: string | null;
      details_synced_at: string | null;
    };

    const list = (Array.isArray(data) ? (data as unknown as Row[]) : []).map(
      (row) => {
        const overrides =
          row.overrides && typeof row.overrides === "object" && !Array.isArray(row.overrides)
            ? (row.overrides as Record<string, unknown>)
            : {};
        const overrideName = typeof overrides.name === "string" ? overrides.name.trim() : "";
        const overrideCompany =
          typeof overrides.company === "string" ? overrides.company.trim() : "";
        const overrideDepartment =
          typeof overrides.department === "string" ? overrides.department.trim() : "";
        const overridePriority =
          typeof overrides.priority === "string" ? overrides.priority.trim() : "";
        const hidden = parseHiddenOverride(overrides.hidden);
        const edited = Object.keys(overrides).length > 0;

        return {
          id: row.breezy_position_id,
          name: overrideName || row.name || "Position",
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
        } satisfies PositionListItem;
      }
    );

    if (list.length === 0) {
      if (jobCompanyFilter) {
        return NextResponse.json(
          { positions: [], total: 0, nextOffset: null },
          { status: 200 }
        );
      }
      const fallback = await fetchBreezyPositionsList(breezyCompanyId);
      const total = fallback.length;
      const slice = fallback.slice(offset, offset + limit);
      const nextOffset = offset + slice.length < total ? offset + slice.length : null;
      return NextResponse.json(
        {
          positions: slice,
          total,
          nextOffset,
          warning: "No cached positions yet. Click Sync to store them in the database.",
        },
        { status: 200 }
      );
    }

    const total = typeof count === "number" ? count : offset + list.length;
    const nextOffset = offset + list.length < total ? offset + list.length : null;
    return NextResponse.json({ positions: list, total, nextOffset }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;

    const listUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
      breezyCompanyId
    )}/positions`;

    const listRes = await breezyFetch(listUrl);
    const listType = listRes.headers.get("content-type") ?? "";
    const listIsJson = listType.includes("application/json");
    const listBody = listIsJson ? await listRes.json() : await listRes.text();

    if (!listRes.ok) {
      return NextResponse.json(
        {
          error: "Breezy request failed",
          status: listRes.status,
          details: listBody,
        },
        { status: listRes.status }
      );
    }

    const breezyList = normalizePositions(listBody)
      .map((pos) => ({
        id: getId(pos),
        name: asString(pos.name).trim() || null,
        state: asString(pos.state).trim() || null,
        friendly_id: asString(pos.friendly_id).trim() || null,
        org_type: asString(pos.org_type).trim() || null,
      }))
      .filter((pos) => pos.id);

    const now = new Date().toISOString();

    const baseRows = breezyList.map((pos) => ({
      company_id: companyId,
      breezy_company_id: breezyCompanyId,
      breezy_position_id: pos.id,
      name: pos.name,
      state: pos.state,
      friendly_id: pos.friendly_id,
      org_type: pos.org_type,
      synced_at: now,
    }));

    if (baseRows.length > 0) {
      const { error: upsertError } = await admin.from("breezy_positions").upsert(baseRows, {
        onConflict: "company_id,breezy_position_id",
        defaultToNull: false,
      });
      if (upsertError) throw new Error(upsertError.message ?? "Failed to upsert positions");
    }

    const detailResults = await mapWithConcurrency(
      breezyList,
      5,
      async (pos): Promise<{ ok: boolean; id: string; details?: unknown; error?: unknown }> => {
        const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(
          breezyCompanyId
        )}/position/${encodeURIComponent(pos.id)}`;
        const res = await breezyFetch(url);
        const type = res.headers.get("content-type") ?? "";
        const isJson = type.includes("application/json");
        const body = isJson ? await res.json() : await res.text();
        if (!res.ok) return { ok: false, id: pos.id, error: body };
        return { ok: true, id: pos.id, details: body };
      }
    );

    const detailRows = detailResults
      .filter((r) => r.ok)
      .map((r) => {
        const details = r.details ?? null;
        const record = isRecord(details) ? (details as Record<string, unknown>) : null;
        return {
          company_id: companyId,
          breezy_company_id: breezyCompanyId,
          breezy_position_id: r.id,
          details,
          company: extractCompany(record),
          department: extractDepartment(record),
          org_type: extractOrgType(record) || null,
          details_synced_at: now,
        };
      });

    if (detailRows.length > 0) {
      const { error: upsertError } = await admin.from("breezy_positions").upsert(detailRows, {
        onConflict: "company_id,breezy_position_id",
        defaultToNull: false,
      });
      if (upsertError) {
        throw new Error(upsertError.message ?? "Failed to store position details");
      }
    }

    // Extract nationality flags into a separate table for country filtering.
    try {
      const countryRows = detailResults
        .filter((r) => r.ok && isRecord(r.details))
        .flatMap((r) => {
          const record = r.details as Record<string, unknown>;
          const desc = pickPositionDescription(record);
          if (!desc) return [];
          const groups = extractNationalityCountryGroups(desc);
          if (groups.all.length === 0) return [];
          const rows = buildCountryRows(groups);
          return rows.map((row) => ({
            company_id: companyId,
            breezy_company_id: breezyCompanyId,
            breezy_position_id: r.id,
            country_code: row.country_code,
            country_name: row.country_name,
            group: row.group,
          }));
        });

      const ids = detailRows.map((row) => row.breezy_position_id).filter(Boolean);
      if (ids.length > 0) {
        await admin
          .from("breezy_position_countries")
          .delete()
          .eq("company_id", companyId)
          .eq("breezy_company_id", breezyCompanyId)
          .in("breezy_position_id", ids);
      }

      if (countryRows.length > 0) {
        const { error: insertError } = await admin
          .from("breezy_position_countries")
          .insert(countryRows);
        if (insertError) throw new Error(insertError.message ?? "Failed to store countries");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!isMissingCountriesTableError(message)) {
        // Ignore other errors to avoid failing the sync.
      }
    }

    let companySync:
      | {
          companiesUpserted: number;
          positionsLinked: number;
        }
      | null = null;
    try {
      companySync = await syncJobCompaniesFromPositions(admin, {
        companyId,
        breezyCompanyId,
      });
    } catch {
      companySync = null;
    }

    const failed = detailResults.filter((r) => !r.ok);

    return NextResponse.json(
      {
        positions: breezyList.length,
        detailsStored: detailRows.length,
        detailsFailed: failed.length,
        companySync,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
