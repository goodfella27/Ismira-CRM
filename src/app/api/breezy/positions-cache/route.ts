import { NextResponse } from "next/server";

import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import {
  extractCompany,
  extractDepartment,
  extractOrgType,
  isRecord,
  replacePositionTitleCompany,
} from "@/lib/breezy-position-fields";
import { pickPositionDescription, scrubBreezyPositionDetails } from "@/lib/breezy-position-description";
import { buildCountryRows, extractNationalityCountryGroups } from "@/lib/nationality-countries";
import {
  normalizeJobCompanyName,
  resolveActiveJobCompanies,
  resolveKnownJobCompanyName,
  syncJobCompaniesFromPositions,
  type JobCompanyRow,
} from "@/lib/job-companies";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
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
  view_id?: string;
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

async function expandPositionCompanyJoins(
  items: PositionListItem[],
  init: {
    admin: ReturnType<typeof createSupabaseAdminClient>;
    companyId: string;
  }
) {
  const positionIds = Array.from(new Set(items.map((item) => item.id).filter(Boolean)));
  if (positionIds.length === 0) return items;

  const { data: joinData, error: joinError } = await init.admin
    .from("job_position_companies")
    .select("breezy_position_id,job_company_id,is_primary")
    .eq("company_id", init.companyId)
    .in("breezy_position_id", positionIds);
  if (joinError || !Array.isArray(joinData) || joinData.length === 0) return items;

  const joins = joinData as Array<{
    breezy_position_id: string | null;
    job_company_id: string | null;
    is_primary: boolean | null;
  }>;
  const companyIds = Array.from(
    new Set(joins.map((row) => row.job_company_id ?? "").filter(Boolean))
  );
  if (companyIds.length === 0) return items;

  const { data: companyData, error: companyError } = await init.admin
    .from("job_companies")
    .select("id,name,normalized_name")
    .eq("company_id", init.companyId)
    .in("id", companyIds);
  if (companyError || !Array.isArray(companyData)) return items;

  const companyById = new Map(
    (companyData as Array<{ id: string; name: string | null; normalized_name: string | null }>).map(
      (row) => [row.id, row] as const
    )
  );
  const joinsByPosition = new Map<string, typeof joins>();
  for (const row of joins) {
    const positionId = (row.breezy_position_id ?? "").trim();
    if (!positionId || !row.job_company_id || !companyById.has(row.job_company_id)) continue;
    const list = joinsByPosition.get(positionId) ?? [];
    list.push(row);
    joinsByPosition.set(positionId, list);
  }

  return items.flatMap((item) => {
    const positionJoins = joinsByPosition.get(item.id) ?? [];
    if (positionJoins.length === 0) return [item];
    return positionJoins
      .sort((a, b) => Number(b.is_primary === true) - Number(a.is_primary === true))
      .map((join) => {
        const company = join.job_company_id ? companyById.get(join.job_company_id) : null;
        const companyName = (company?.name ?? "").trim();
        if (!company || !companyName) return item;
        return {
          ...item,
          view_id: `${item.id}:${company.id}`,
          company: companyName,
        };
      });
  });
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
    const searchFilter = (searchParams.get("search") ?? "").trim();
    const { limit, offset } = getPaginationFromRequest(request);

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);

    let query = admin
      .from("breezy_positions")
      .select(
        "breezy_position_id,name,state,friendly_id,org_type,company,department,job_company_id,overrides,synced_at,details_synced_at",
        { count: "exact" }
      )
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .order("name", { ascending: true });

    if (!jobCompanyFilter && !searchFilter) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;

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
        const { count: safeCount } = await countQuery;
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
      job_company_id: string | null;
      overrides: unknown;
      synced_at: string | null;
      details_synced_at: string | null;
    };

    const { data: companyRows } = await admin
      .from("job_companies")
      .select("id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at")
      .eq("company_id", companyId);
    const companies = await resolveActiveJobCompanies(
      admin,
      companyId,
      Array.isArray(companyRows) ? (companyRows as JobCompanyRow[]) : []
    );
    const companyNameById = new Map(companies.map((company) => [company.id, company.name]));
    const companyNameByNormalized = new Map(
      companies.map((company) => [company.normalized_name, company.name])
    );
    const normalizedCompanyFilter = normalizeJobCompanyName(jobCompanyFilter);
    const normalizedSearchFilter = searchFilter.toLowerCase();

    let list: PositionListItem[] = (Array.isArray(data) ? (data as unknown as Row[]) : []).map(
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
        const rawCompany = overrideCompany || row.company || "";
        const displayCompany =
          (row.job_company_id ? companyNameById.get(row.job_company_id) : "") ||
          resolveKnownJobCompanyName(rawCompany, companyNameByNormalized) ||
          rawCompany;
        const name = overrideName || row.name || "Position";

        return {
          id: row.breezy_position_id,
          name: replacePositionTitleCompany(name, rawCompany, displayCompany) || name,
          state: row.state ?? undefined,
          friendly_id: row.friendly_id ?? undefined,
          org_type: row.org_type ?? undefined,
          company: displayCompany || undefined,
          department: overrideDepartment || row.department || undefined,
          priority: overridePriority || undefined,
          edited,
          hidden,
          synced_at: row.synced_at,
          details_synced_at: row.details_synced_at,
        } satisfies PositionListItem;
      }
    );

    try {
      list = await expandPositionCompanyJoins(list, { admin, companyId });
    } catch {
      // Keep legacy single-company rows if the join overlay is unavailable.
    }

    list = list.filter((position) => {
      if (!normalizedCompanyFilter) return true;
      return normalizeJobCompanyName(position.company) === normalizedCompanyFilter;
    }).filter((position) => {
      if (!normalizedSearchFilter) return true;
      const haystack =
        `${position.name ?? ""} ${position.company ?? ""} ${position.department ?? ""} ${position.state ?? ""} ${position.org_type ?? ""} ${position.friendly_id ?? ""} ${position.id}`.toLowerCase();
      return haystack.includes(normalizedSearchFilter);
    });

    if (list.length === 0) {
      if (jobCompanyFilter || searchFilter) {
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

    const isServerFiltered = Boolean(jobCompanyFilter || searchFilter);
    const total = isServerFiltered ? list.length : typeof count === "number" ? count : offset + list.length;
    const slice = isServerFiltered ? list.slice(offset, offset + limit) : list;
    const nextOffset = offset + slice.length < total ? offset + slice.length : null;
    return NextResponse.json({ positions: slice, total, nextOffset }, { status: 200 });
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
    await ensureCompanyMembership(admin, user.id);
    const companyId = await getPrimaryCompanyId(admin);

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
        const details = scrubBreezyPositionDetails(r.details ?? null);
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

    clearJobsResponseCache();
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
