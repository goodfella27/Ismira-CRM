import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { applyPublicCacheControl } from "@/lib/http/public-api";
import {
  inferCompanyFromPositionName,
  replacePositionTitleCompany,
} from "@/lib/breezy-position-fields";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  dedupePriorityTypes,
  getDefaultPriorityFrontpageVisibility,
} from "@/lib/breezy-priority-types";
import { buildBreezyPublicPositionUrl } from "@/lib/breezy-public";
import {
  fetchJobCompanyBenefits,
  hasManualBenefitsOverride,
  mapBenefitTagsByJobCompanyId,
  normalizeBenefitTags,
  syncAutoBenefitsFromCachedPositions,
} from "@/lib/job-company-benefits";
import { benefitLabelMap, fetchJobBenefitOptions } from "@/lib/job-benefit-options";
import { setJobsResponseCache } from "@/lib/jobs-api-cache";
import {
  fetchJobCompaniesByNormalizedName,
  normalizeJobCompanyName,
  resolveActiveJobCompanies,
  signJobCompanyLogoUrls,
  type JobCompanyRow,
} from "@/lib/job-companies";
import { applyDepartmentOverridesToJobs } from "@/lib/job-departments";
import { fetchJobCountryOptions } from "@/lib/job-country-options";
import { resolveJobShipTypes } from "@/lib/job-ship-types";

export const runtime = "nodejs";

type JobListItem = {
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
  company_logo_url?: string;
  company_slug?: string;
  application_url?: string;
  updated_at?: string;
  ship_type?: string;
  ship_types?: string[];
  benefit_tags?: string[];
  processable_countries?: string[];
  blocked_countries?: string[];
  mentioned_countries?: string[];
};

type PriorityTypePayload = {
  key: string;
  label: string;
  sortOrder: number;
  showOnFrontpage: boolean;
};

type BreezyPosition = {
  _id?: string;
  id?: string;
  name?: string;
  state?: string;
  friendly_id?: string;
  org_type?: string;
  department?: unknown;
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

function normalizeOrgType(value: unknown) {
  const raw = asString(value).trim();
  const normalized = raw.toLowerCase();
  if (normalized === "pool" || normalized === "position") return normalized;
  return raw;
}

function parseHiddenOverride(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function attachPublicApplyUrls(items: JobListItem[]) {
  return items.map((item) => {
    const existing =
      typeof item.application_url === "string" ? item.application_url.trim() : "";
    if (existing) return item;
    const friendly = typeof item.friendly_id === "string" ? item.friendly_id.trim() : "";
    if (!friendly) return item;
    return { ...item, application_url: buildBreezyPublicPositionUrl(friendly) };
  });
}

function getJobCompanyCountryCodes(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const raw = (metadata as Record<string, unknown>).job_company_country_codes;
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((code) => (typeof code === "string" ? code.trim().toUpperCase() : ""))
        .filter((code) => /^[A-Z]{2}$/.test(code))
    ),
  ];
}

const isMissingCountriesTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_position_countries/i.test(message);

async function attachNationalityCountries(
  items: JobListItem[],
  init: {
    admin: ReturnType<typeof createSupabaseAdminClient>;
    companyId: string;
    breezyCompanyId: string;
    enabledCountryCodes?: Set<string>;
  }
) {
  const ids = items.map((item) => item.id).filter(Boolean);
  if (ids.length === 0) return items;

  try {
    const { data, error } = await init.admin
      .from("breezy_position_countries")
      .select("breezy_position_id,country_code,group")
      .eq("company_id", init.companyId)
      .eq("breezy_company_id", init.breezyCompanyId)
      .in("breezy_position_id", ids);

    if (error) {
      if (isMissingCountriesTableError(error.message ?? "")) return items;
      return items;
    }

    type Row = { breezy_position_id: string; country_code: string; group: string };
    const rows = Array.isArray(data) ? (data as unknown as Row[]) : [];

    const byId = new Map<
      string,
      { processable: Set<string>; blocked: Set<string>; mentioned: Set<string> }
    >();

    for (const row of rows) {
      const id = (row.breezy_position_id ?? "").trim();
      const code = (row.country_code ?? "").toUpperCase().trim();
      if (!id || !code) continue;
      if (init.enabledCountryCodes?.size && !init.enabledCountryCodes.has(code)) continue;
      const entry =
        byId.get(id) ??
        { processable: new Set<string>(), blocked: new Set<string>(), mentioned: new Set<string>() };
      const group = (row.group ?? "").toLowerCase();
      if (group === "processable") entry.processable.add(code);
      else if (group === "blocked") entry.blocked.add(code);
      else entry.mentioned.add(code);
      byId.set(id, entry);
    }

    return items.map((item) => {
      if (Array.isArray(item.processable_countries) && item.processable_countries.length > 0) {
        return item;
      }
      const entry = byId.get(item.id);
      if (!entry) return item;
      return {
        ...item,
        processable_countries: Array.from(entry.processable),
        blocked_countries: Array.from(entry.blocked),
        mentioned_countries: Array.from(entry.mentioned),
      };
    });
  } catch {
    return items;
  }
}

async function attachJobCompanyBranding(
  items: JobListItem[],
  init: {
    admin: ReturnType<typeof createSupabaseAdminClient>;
    companyId: string;
  }
) {
  const normalizedNames = items
    .map((item) => normalizeJobCompanyName(item.company))
    .filter(Boolean);
  const jobCompanyIds = Array.from(
    new Set(items.map((item) => (typeof item.job_company_id === "string" ? item.job_company_id : "")).filter(Boolean))
  );
  if (normalizedNames.length === 0 && jobCompanyIds.length === 0) return items;

  const normalizedNameQuery = Array.from(
    new Set(
      normalizedNames.flatMap((name) =>
        name === "virgin voyages" ? [name, "vv", "virgin voyage"] : [name]
      )
    )
  );

  let jobCompaniesByName: JobCompanyRow[] = [];
  if (normalizedNameQuery.length > 0) {
    try {
      jobCompaniesByName = await fetchJobCompaniesByNormalizedName(
        init.admin,
        init.companyId,
        normalizedNameQuery
      );
    } catch {
      jobCompaniesByName = [];
    }
  }
  let jobCompaniesById: JobCompanyRow[] = [];
  if (jobCompanyIds.length > 0) {
    try {
      const res = await init.admin
        .from("job_companies")
        .select(
          "id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at"
        )
        .eq("company_id", init.companyId)
        .in("id", jobCompanyIds);
      if (res.error) throw new Error(res.error.message ?? "Failed to load job companies by id");
      jobCompaniesById = Array.isArray(res.data) ? (res.data as JobCompanyRow[]) : [];
    } catch {
      jobCompaniesById = [];
    }
  }

  const uniqueCompanies = Array.from(
    new Map([...jobCompaniesById, ...jobCompaniesByName].map((company) => [company.id, company] as const))
      .values()
  );
  let jobCompanies = uniqueCompanies;
  try {
    jobCompanies = await resolveActiveJobCompanies(init.admin, init.companyId, uniqueCompanies);
  } catch {
    jobCompanies = uniqueCompanies;
  }
  const byId = new Map(jobCompanies.map((item) => [item.id, item] as const));
  let signedUrls = new Map<string, string | null>();
  try {
    signedUrls = await signJobCompanyLogoUrls(init.admin, jobCompanies);
  } catch {
    signedUrls = new Map();
  }
  let benefitTagsByCompanyId = await fetchJobCompanyBenefits(
    init.admin,
    init.companyId,
    jobCompanies.map((item) => item.id)
  )
    .then((rows) => mapBenefitTagsByJobCompanyId(rows))
    .catch(() => new Map<string, string[]>());

  const missingAutoCompanies = jobCompanies.filter(
    (company) =>
      !hasManualBenefitsOverride(company.metadata) && !benefitTagsByCompanyId.has(company.id)
  );
  if (missingAutoCompanies.length > 0) {
    const autoTags = await syncAutoBenefitsFromCachedPositions(init.admin, {
      companyId: init.companyId,
      jobCompanies: missingAutoCompanies,
    }).catch(() => new Map<string, string[]>());
    if (autoTags.size > 0) {
      benefitTagsByCompanyId = new Map([...benefitTagsByCompanyId, ...autoTags]);
    }
  }

  const byNormalized = new Map<string, JobCompanyRow>();
  const byNormalizedBuckets = new Map<string, JobCompanyRow[]>();
  for (const row of jobCompanies) {
    const keys = new Set<string>();
    if (row.normalized_name) keys.add(row.normalized_name);
    const canonicalFromName = normalizeJobCompanyName(row.name);
    if (canonicalFromName) keys.add(canonicalFromName);
    for (const key of keys) {
      const bucket = byNormalizedBuckets.get(key) ?? [];
      bucket.push(row);
      byNormalizedBuckets.set(key, bucket);
    }
  }

  const scoreCompany = (row: JobCompanyRow) => {
    let score = 0;
    const name = (row.name ?? "").trim().toLowerCase();
    if (name === "vv" || name === "virgin voyage") score -= 5;
    if (typeof row.logo_path === "string" && row.logo_path.trim()) score += 10;
    const benefitCount = (benefitTagsByCompanyId.get(row.id) ?? []).length;
    if (benefitCount > 0) score += 8 + Math.min(6, benefitCount);
    if (hasManualBenefitsOverride(row.metadata)) score += 5;
    if (typeof row.updated_at === "string" && row.updated_at.trim()) score += 1;
    return score;
  };

  for (const [key, rows] of byNormalizedBuckets.entries()) {
    rows.sort((a, b) => scoreCompany(b) - scoreCompany(a));
    byNormalized.set(key, rows[0]);
  }

  return items.map((item) => {
    const company =
      (typeof item.job_company_id === "string" ? byId.get(item.job_company_id) : undefined) ??
      byNormalized.get(normalizeJobCompanyName(item.company));
    if (!company) return item;
    const logoPath = typeof company.logo_path === "string" ? company.logo_path.trim() : "";
    const shipTypes = resolveJobShipTypes({
      metadata: company.metadata,
      name: company.name,
      fallback: item.name,
    });
    const hasPositionBenefitTags = Object.prototype.hasOwnProperty.call(item, "benefit_tags");
    const hasPositionCountryCodes =
      Array.isArray(item.processable_countries) && item.processable_countries.length > 0;
    const countryCodes = getJobCompanyCountryCodes(company.metadata);
    return {
      ...item,
      name: replacePositionTitleCompany(item.name, item.company, company.name) || item.name,
      company: company.name,
      company_slug: company.slug,
      company_logo_url: logoPath ? signedUrls.get(logoPath) ?? undefined : undefined,
      ship_type: shipTypes[0] ?? undefined,
      ship_types: shipTypes,
      benefit_tags: hasPositionBenefitTags
        ? normalizeBenefitTags(item.benefit_tags)
        : benefitTagsByCompanyId.get(company.id) ?? [],
      ...(!hasPositionCountryCodes && countryCodes.length > 0
        ? { processable_countries: countryCodes }
        : {}),
    };
  });
}

async function expandPositionCompanyJoins(
  items: JobListItem[],
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
          job_company_id: company.id,
          company: companyName,
        };
      });
  });
}

const isMissingPriorityTypesTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_priority_types/i.test(message);

const isMissingShowOnFrontpageColumnError = (message: string) =>
  /show_on_frontpage/i.test(message) &&
  (/could not find/i.test(message) || /column/i.test(message) || /schema cache/i.test(message));

async function loadPriorityTypes(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string
) {
  const initial = await admin
    .from("breezy_priority_types")
    .select("key,label,sort_order,show_on_frontpage")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  let data = initial.data as Array<{
    key: string | null;
    label: string | null;
    sort_order: number | null;
    show_on_frontpage?: boolean | null;
  }> | null;
  let error = initial.error;

  if (error && isMissingShowOnFrontpageColumnError(error.message ?? "")) {
    const fallback = await admin
      .from("breezy_priority_types")
      .select("key,label,sort_order")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    data = fallback.data as Array<{
      key: string | null;
      label: string | null;
      sort_order: number | null;
      show_on_frontpage?: boolean | null;
    }> | null;
    error = fallback.error;
  }

  if (error) {
    if (isMissingPriorityTypesTableError(error.message ?? "")) {
      return DEFAULT_BREEZY_PRIORITY_TYPES;
    }
    throw error;
  }

  return dedupePriorityTypes(
    (Array.isArray(data)
      ? (data as Array<{
          key: string | null;
          label: string | null;
          sort_order: number | null;
          show_on_frontpage?: boolean | null;
        }>)
      : []
    ).map((row, index) => ({
      key: row.key ?? "",
      label: row.label ?? "",
      sortOrder: Number.isFinite(row.sort_order) ? Number(row.sort_order) : index,
      showOnFrontpage:
        typeof row.show_on_frontpage === "boolean"
          ? row.show_on_frontpage
          : getDefaultPriorityFrontpageVisibility(row.key ?? "", row.label ?? ""),
    }))
  );
}

// Cache aggressively at the CDN while keeping client-side revalidation cheap (ETag + 304).
const LIST_CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

function applyPublicCors(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, ngrok-skip-browser-warning"
  );
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("X-Jobs-Cors", "1");
}

function isValidJsonpCallback(value: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function createEtag(payload: string) {
  const hash = createHash("sha1").update(payload).digest("base64url");
  return `W/"${hash}"`;
}

function ifNoneMatchMatches(request: Request, etag: string) {
  const header = request.headers.get("if-none-match");
  if (!header) return false;
  return header
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(etag);
}

function notModifiedResponse(init: { cacheControl: string; etag: string }) {
  const res = new NextResponse(null, { status: 304 });
  applyPublicCors(res.headers);
  res.headers.set("ETag", init.etag);
  applyPublicCacheControl(res.headers, init.cacheControl);
  return res;
}

function jsonResponse(request: Request, body: unknown, init: { status: number }) {
  const url = new URL(request.url);
  const callback = (url.searchParams.get("callback") ?? "").trim();
  if (callback && isValidJsonpCallback(callback)) {
    const json = JSON.stringify(body);
    const payload = `${callback}(${json});`;
    const etag = createEtag(payload);
    if (init.status === 200 && ifNoneMatchMatches(request, etag)) {
      return notModifiedResponse({ cacheControl: LIST_CACHE_CONTROL, etag });
    }

    const res = new NextResponse(payload, { status: init.status });
    applyPublicCors(res.headers);
    res.headers.set("Content-Type", "application/javascript; charset=utf-8");
    res.headers.set("ETag", etag);
    if (init.status >= 400) {
      applyPublicCacheControl(res.headers, "no-store");
    } else {
      applyPublicCacheControl(res.headers, LIST_CACHE_CONTROL);
    }
    return res;
  }

  const json = JSON.stringify(body);
  const etag = createEtag(json);
  if (init.status === 200 && ifNoneMatchMatches(request, etag)) {
    return notModifiedResponse({ cacheControl: LIST_CACHE_CONTROL, etag });
  }

  const res = new NextResponse(json, { status: init.status });
  applyPublicCors(res.headers);
  res.headers.set("Content-Type", "application/json; charset=utf-8");
  res.headers.set("ETag", etag);
  if (init.status >= 400) {
    applyPublicCacheControl(res.headers, "no-store");
  } else {
    applyPublicCacheControl(res.headers, LIST_CACHE_CONTROL);
  }
  return res;
}

export async function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  applyPublicCors(res.headers);
  applyPublicCacheControl(res.headers, "public, max-age=86400");
  return res;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyParam = (searchParams.get("companyId") ?? "").trim();
    const companyId = companyParam || requireBreezyCompanyId().companyId;
    const cacheKey = companyParam ? `company-branding-v4:${companyId}` : "default-branding-v4";

    // Prefer database cache (fast + supports local edits). Falls back to Breezy if not available.
    try {
      const admin = createSupabaseAdminClient();
      const primaryCompanyId = await getPrimaryCompanyId(admin);

      const { data, error } = await admin
        .from("breezy_positions")
        .select(
          "breezy_position_id,name,state,friendly_id,org_type,company,department,job_company_id,overrides,updated_at"
        )
        .eq("company_id", primaryCompanyId)
        .eq("breezy_company_id", companyId)
        .eq("state", "published")
        .or("org_type.eq.position,org_type.is.null")
        .order("updated_at", { ascending: false })
        .order("name", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
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
          updated_at: string | null;
        };

        const mapped = (data as unknown as Row[])
          .map((row) => {
            const overrides =
              row.overrides && typeof row.overrides === "object" && !Array.isArray(row.overrides)
                ? (row.overrides as Record<string, unknown>)
                : {};
            const hidden = parseHiddenOverride(overrides.hidden);
            if (hidden) return null;
            const overrideName = typeof overrides.name === "string" ? overrides.name.trim() : "";
            const overrideCompany =
              typeof overrides.company === "string" ? overrides.company.trim() : "";
            const overrideDepartment =
              typeof overrides.department === "string" ? overrides.department.trim() : "";
            const overridePriority =
              typeof overrides.priority === "string" ? overrides.priority.trim() : "";
            const hasBenefitOverride = Object.prototype.hasOwnProperty.call(overrides, "benefit_tags");
            const orgType = normalizeOrgType(row.org_type);

            return {
              id: row.breezy_position_id,
              name: overrideName || (row.name ?? "").trim() || "Position",
              state: row.state ?? "published",
              friendly_id: row.friendly_id ?? undefined,
              org_type: orgType || undefined,
              company:
                overrideCompany ||
                row.company ||
                inferCompanyFromPositionName(overrideName || row.name || "") ||
                undefined,
              department: overrideDepartment || row.department || undefined,
              priority: overridePriority || undefined,
              job_company_id: row.job_company_id ?? undefined,
              ...(hasBenefitOverride
                ? { benefit_tags: normalizeBenefitTags(overrides.benefit_tags) }
                : {}),
              updated_at: row.updated_at ?? undefined,
            } satisfies JobListItem;
          })
          .filter(Boolean)
          .map((item) => item as JobListItem)
          .filter((pos) => pos.id)
          .filter((pos) => (pos.org_type || "").toLowerCase() !== "pool");

        let enriched = attachPublicApplyUrls(mapped);
        try {
          enriched = await expandPositionCompanyJoins(enriched, {
            admin,
            companyId: primaryCompanyId,
          });
        } catch {
          // Ignore join overlay failures and keep legacy single-company data.
        }

        const countryOptions = await fetchJobCountryOptions(admin, primaryCompanyId).catch(() => []);
        try {
          const enabledCountryCodes = new Set(countryOptions.map((option) => option.code));
          enriched = await attachNationalityCountries(enriched, {
            admin,
            companyId: primaryCompanyId,
            breezyCompanyId: companyId,
            enabledCountryCodes,
          });
        } catch {
          // ignore
        }
        try {
          enriched = await attachJobCompanyBranding(enriched, {
            admin,
            companyId: primaryCompanyId,
          });
        } catch {
          enriched = attachPublicApplyUrls(enriched);
        }

        enriched = attachPublicApplyUrls(enriched);
        try {
          enriched = await applyDepartmentOverridesToJobs(admin, primaryCompanyId, enriched);
        } catch {
          // Ignore department overlay failures so jobs remain available.
        }

        const priorityTypes = await loadPriorityTypes(admin, primaryCompanyId);
        const benefitLabels = await fetchJobBenefitOptions(admin, primaryCompanyId)
          .then((options) => benefitLabelMap(options))
          .catch(() => ({}));
        const countryLabels = Object.fromEntries(
          countryOptions.map((option) => [option.code, option.name])
        );
        const payload = { jobs: enriched, priorityTypes, benefitLabels, countryLabels };
        setJobsResponseCache(cacheKey, {
          expiresAt: Date.now() + 60_000,
          payload,
        });
        return jsonResponse(request, payload, { status: 200 });
      }
    } catch {
      // Ignore and fall back to Breezy.
    }

    const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(companyId)}/positions`;

    const res = await breezyFetch(url);
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      return jsonResponse(
        request,
        {
          error: "Breezy request failed",
          status: res.status,
          details: body,
        },
        { status: res.status }
      );
    }

    const base = normalizePositions(body)
      .map((pos) => ({
        id: getId(pos),
        name: asString(pos.name).trim() || "Position",
        state: asString(pos.state).trim() || undefined,
        friendly_id: asString(pos.friendly_id).trim() || undefined,
        org_type: normalizeOrgType(pos.org_type) || undefined,
        company: inferCompanyFromPositionName(pos.name ?? "") || undefined,
        department: asString(pos.department).trim() || undefined,
      }))
      .filter((pos) => pos.id)
      .filter((pos) => (pos.state ? pos.state === "published" : true));

    const finalList = base.filter((pos) => (pos.org_type || "").toLowerCase() !== "pool");

    let enriched = attachPublicApplyUrls(finalList);
    try {
      const admin = createSupabaseAdminClient();
      const primaryCompanyId = await getPrimaryCompanyId(admin);
      let priorityTypes = DEFAULT_BREEZY_PRIORITY_TYPES;
      try {
        const now = new Date().toISOString();
        const baseRows = finalList.map((pos) => ({
          company_id: primaryCompanyId,
          breezy_company_id: companyId,
          breezy_position_id: pos.id,
          name: pos.name ?? null,
          state: pos.state ?? null,
          friendly_id: pos.friendly_id ?? null,
          org_type: pos.org_type ?? null,
          company: pos.company ?? null,
          department: pos.department ?? null,
          synced_at: now,
        }));
        if (baseRows.length > 0) {
          await admin.from("breezy_positions").upsert(baseRows, {
            onConflict: "company_id,breezy_position_id",
            defaultToNull: false,
          });
        }
      } catch {
        // Ignore cache write failures.
      }
      try {
        enriched = await attachJobCompanyBranding(enriched, {
          admin,
          companyId: primaryCompanyId,
        });
      } catch {
        enriched = attachPublicApplyUrls(enriched);
      }

      const countryOptions = await fetchJobCountryOptions(admin, primaryCompanyId).catch(() => []);
      try {
        const enabledCountryCodes = new Set(countryOptions.map((option) => option.code));
        enriched = await attachNationalityCountries(enriched, {
          admin,
          companyId: primaryCompanyId,
          breezyCompanyId: companyId,
          enabledCountryCodes,
        });
      } catch {
        // ignore
      }
      try {
        enriched = await applyDepartmentOverridesToJobs(admin, primaryCompanyId, enriched);
      } catch {
        // ignore
      }
      try {
        priorityTypes = await loadPriorityTypes(admin, primaryCompanyId);
      } catch {
        priorityTypes = DEFAULT_BREEZY_PRIORITY_TYPES;
      }
      const benefitLabels = await fetchJobBenefitOptions(admin, primaryCompanyId)
        .then((options) => benefitLabelMap(options))
        .catch(() => ({}));
      const countryLabels = Object.fromEntries(
        countryOptions.map((option) => [option.code, option.name])
      );
      const payload = { jobs: enriched, priorityTypes, benefitLabels, countryLabels };
      setJobsResponseCache(cacheKey, {
        expiresAt: Date.now() + 60_000,
        payload,
      });
      return jsonResponse(request, payload, { status: 200 });
    } catch {
      enriched = attachPublicApplyUrls(finalList);
    }

    enriched = attachPublicApplyUrls(enriched);
    const payload = { jobs: enriched, priorityTypes: DEFAULT_BREEZY_PRIORITY_TYPES };
    setJobsResponseCache(cacheKey, {
      expiresAt: Date.now() + 60_000,
      payload,
    });
    return jsonResponse(request, payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(request, { error: message }, { status: 500 });
  }
}
