import { NextResponse } from "next/server";

import { requireBreezyCompanyId } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { replacePositionTitleCompany } from "@/lib/breezy-position-fields";
import {
  normalizeJobCompanyName,
  resolveActiveJobCompanies,
  resolveKnownJobCompanyName,
  syncJobCompaniesFromPositions,
  type JobCompanyRow,
} from "@/lib/job-companies";
import {
  getPositionOpeningTypeOverride,
  resolveOpeningType,
  type OpeningTypeOverride,
} from "@/lib/job-company-opening-types";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePriorityKey } from "@/lib/breezy-priority-types";

export const runtime = "nodejs";

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
  job_company_id?: string;
  show_on_ismira_web?: boolean;
  edited?: boolean;
  hidden?: boolean;
  synced_at?: string | null;
  details_synced_at?: string | null;
};

type InternalPositionListItem = PositionListItem & {
  priorityOverride?: OpeningTypeOverride;
};

function parseHiddenOverride(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

const isMissingPositionsTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_positions/i.test(message);

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

async function expandPositionCompanyJoins(
  items: InternalPositionListItem[],
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
    .select("id,name,normalized_name,metadata")
    .eq("company_id", init.companyId)
    .in("id", companyIds);
  if (companyError || !Array.isArray(companyData)) return items;

  const companyById = new Map(
    (
      companyData as Array<{
        id: string;
        name: string | null;
        normalized_name: string | null;
        metadata?: unknown;
      }>
    )
      .filter((row) => {
        const metadata =
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
        return typeof metadata.merged_into_job_company_id !== "string";
      })
      .map((row) => [row.id, row] as const)
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

    const uniqueJoins = new Map<string, (typeof positionJoins)[number]>();
    for (const join of [...positionJoins].sort(
      (a, b) => Number(b.is_primary === true) - Number(a.is_primary === true)
    )) {
      const company = join.job_company_id ? companyById.get(join.job_company_id) : null;
      if (!company) continue;
      const key = normalizeJobCompanyName(company.name) || company.normalized_name || company.id;
      if (!uniqueJoins.has(key)) uniqueJoins.set(key, join);
    }

    const expanded = Array.from(uniqueJoins.values())
      .map((join) => {
        const company = join.job_company_id ? companyById.get(join.job_company_id) : null;
        const companyName = (company?.name ?? "").trim();
        if (!company || !companyName) return item;
        return {
          ...item,
          view_id: `${item.id}:${company.id}`,
          job_company_id: company.id,
          company: companyName,
        };
      });
    return expanded.length > 0 ? expanded : [item];
  });
}

function applyCompanyOpeningTypeDefaults(
  items: InternalPositionListItem[],
  companies: JobCompanyRow[]
): PositionListItem[] {
  const companyById = new Map(companies.map((company) => [company.id, company] as const));
  const companyByNormalizedName = new Map(
    companies.map((company) => [company.normalized_name, company] as const)
  );

  return items.map((item) => {
    const { priorityOverride, ...publicItem } = item;
    const company =
      (typeof item.job_company_id === "string" ? companyById.get(item.job_company_id) : undefined) ??
      companyByNormalizedName.get(normalizeJobCompanyName(item.company));
    const priority = resolveOpeningType({
      metadata: company?.metadata,
      override: priorityOverride,
    });

    return {
      ...publicItem,
      priority: priority || undefined,
    };
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
    const priorityFilter = normalizePriorityKey(searchParams.get("priority") ?? "");
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

    if (!jobCompanyFilter && !searchFilter && !priorityFilter) {
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
        return NextResponse.json(
          {
            positions: [],
            total: 0,
            nextOffset: null,
            warning:
              "Database table `breezy_positions` is not set up. Apply `supabase/breezy_positions.sql` and run Sync to enable cached positions.",
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

    let list: InternalPositionListItem[] = (Array.isArray(data) ? (data as unknown as Row[]) : []).map(
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
        const priorityOverride = getPositionOpeningTypeOverride(overrides);
        const showOnIsmiraWeb = overrides.show_on_ismira_web === true;
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
          job_company_id: row.job_company_id ?? undefined,
          show_on_ismira_web: showOnIsmiraWeb,
          priorityOverride,
          edited,
          hidden,
          synced_at: row.synced_at,
          details_synced_at: row.details_synced_at,
        } satisfies InternalPositionListItem;
      }
    );

    try {
      list = await expandPositionCompanyJoins(list, { admin, companyId });
    } catch {
      // Keep legacy single-company rows if the join overlay is unavailable.
    }

    const resolvedList = applyCompanyOpeningTypeDefaults(list, companies);

    const filteredList = resolvedList.filter((position) => {
      if (!normalizedCompanyFilter) return true;
      return normalizeJobCompanyName(position.company) === normalizedCompanyFilter;
    }).filter((position) => {
      if (!priorityFilter) return true;
      return normalizePriorityKey(position.priority ?? "") === priorityFilter;
    }).filter((position) => {
      if (!normalizedSearchFilter) return true;
      const haystack =
        `${position.name ?? ""} ${position.company ?? ""} ${position.department ?? ""} ${position.state ?? ""} ${position.org_type ?? ""} ${position.friendly_id ?? ""} ${position.id}`.toLowerCase();
      return haystack.includes(normalizedSearchFilter);
    });

    if (filteredList.length === 0) {
      if (jobCompanyFilter || searchFilter || priorityFilter) {
        return NextResponse.json(
          { positions: [], total: 0, nextOffset: null },
          { status: 200 }
        );
      }
      return NextResponse.json(
        {
          positions: [],
          total: 0,
          nextOffset: null,
          warning: "No Supabase positions found yet. Create or import jobs in Supabase.",
        },
        { status: 200 }
      );
    }

    const isServerFiltered = Boolean(jobCompanyFilter || searchFilter || priorityFilter);
    const total = isServerFiltered ? filteredList.length : typeof count === "number" ? count : offset + filteredList.length;
    const slice = isServerFiltered ? filteredList.slice(offset, offset + limit) : filteredList;
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

    const { count, error: countError } = await admin
      .from("breezy_positions")
      .select("breezy_position_id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId);
    if (countError) throw new Error(countError.message ?? "Failed to refresh cached positions");

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

    clearJobsResponseCache();
    return NextResponse.json(
      {
        ok: true,
        positions: typeof count === "number" ? count : 0,
        companySync,
        source: "supabase",
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
