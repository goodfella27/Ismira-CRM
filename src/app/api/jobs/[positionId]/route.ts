import { NextResponse } from "next/server";

import { getBreezyEnv } from "@/lib/breezy";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canonicalizeCountry } from "@/lib/country";
import {
  extractCompany,
  replacePositionTitleCompany,
} from "@/lib/breezy-position-fields";
import { applyPublicCacheControl } from "@/lib/http/public-api";
import { pickPositionDescription, scrubBreezyPositionDetails } from "@/lib/breezy-position-description";
import { buildCountryRows, extractNationalityCountryGroups } from "@/lib/nationality-countries";
import { buildBreezyPublicPositionUrl } from "@/lib/breezy-public";
import { extractBenefitTagsFromDescription } from "@/lib/job-benefits";
import {
  fetchJobCompanyBenefits,
  mapBenefitTagsByJobCompanyId,
  normalizeBenefitTags,
} from "@/lib/job-company-benefits";
import {
  getPositionOpeningTypeOverride,
  resolveOpeningType,
} from "@/lib/job-company-opening-types";
import {
  normalizeJobCompanyName,
  resolveActiveJobCompanies,
  resolveKnownJobCompanyName,
  signJobCompanyLogoUrls,
  type JobCompanyRow,
} from "@/lib/job-companies";
import { resolveJobShipTypes } from "@/lib/job-ship-types";

export const runtime = "nodejs";

const DETAILS_CACHE_CONTROL = "no-store";
const responseCache = new Map<string, { expiresAt: number; payload: unknown }>();

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOrgType(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  const normalized = raw.toLowerCase();
  if (normalized === "pool" || normalized === "position") return normalized;
  return raw;
}

function ensureApplicationUrl(details: Record<string, unknown>) {
  const existingCandidates = [
    details.application_url,
    details.apply_url,
    details.applyUrl,
    details.applicationUrl,
    details.url,
  ];

  for (const candidate of existingCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      const trimmed = candidate.trim();
      if (/api\.breezy\.hr/i.test(trimmed)) continue;
      if (!details.application_url && /^https?:\/\//i.test(trimmed)) {
        return { ...details, application_url: trimmed };
      }
      return details;
    }
  }

  const friendly =
    (typeof details.friendly_id === "string" && details.friendly_id.trim()) ||
    (typeof details.friendlyId === "string" && details.friendlyId.trim()) ||
    "";
  if (!friendly) return details;

  return { ...details, application_url: buildBreezyPublicPositionUrl(friendly) };
}

function applyOverrides(details: unknown, overrides: unknown) {
  const base = isRecord(details) ? { ...details } : {};
  const overrideObj = isRecord(overrides) ? overrides : {};

  for (const [key, value] of Object.entries(overrideObj)) {
    if (key === "hidden") {
      if (value === true) base.hidden = true;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["1", "true", "yes", "y", "on"].includes(normalized)) base.hidden = true;
      }
      continue;
    }
    if (key === "priority") {
      const priorityOverride = getPositionOpeningTypeOverride({ priority: value });
      if (priorityOverride === null) delete base.priority;
      else if (typeof priorityOverride === "string") base.priority = priorityOverride;
      continue;
    }
    if (key === "benefit_tags") {
      base.benefit_tags = normalizeBenefitTags(value);
      continue;
    }
    if (key === "processable_country_codes") {
      const codes = Array.isArray(value)
        ? Array.from(
            new Set(
              value
                .map((item) => (typeof item === "string" ? item.trim().toUpperCase() : ""))
                .filter((code) => /^[A-Z]{2}$/.test(code))
            )
          )
        : [];
      if (codes.length === 0) continue;
      const countries = codes.map((code) => ({
        code,
        name: canonicalizeCountry(code) ?? code,
      }));
      base.processable_country_codes = codes;
      base.nationality_countries = {
        ...(isRecord(base.nationality_countries) ? base.nationality_countries : {}),
        processable: countries,
        all: countries.map((country) => ({ ...country, group: "processable" })),
      };
      continue;
    }
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    base[key] = trimmed;
  }

  if (typeof overrideObj.location_name === "string" && overrideObj.location_name.trim()) {
    base.locationName = overrideObj.location_name.trim();
    base.location_label = overrideObj.location_name.trim();
  }

  return base;
}

function normalizeCountryCodes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim().toUpperCase() : ""))
        .filter((code) => /^[A-Z]{2}$/.test(code))
    )
  );
}

function hasCountryOverride(overrides: unknown) {
  if (!isRecord(overrides)) return false;
  if (!Object.prototype.hasOwnProperty.call(overrides, "processable_country_codes")) return false;
  return normalizeCountryCodes(overrides.processable_country_codes).length > 0;
}

function hasBenefitOverride(overrides: unknown) {
  return isRecord(overrides) && Object.prototype.hasOwnProperty.call(overrides, "benefit_tags");
}

function clearStaleDetailBenefitsWithoutOverride(
  details: Record<string, unknown>,
  overrides: unknown
) {
  if (hasBenefitOverride(overrides)) return details;
  if (!Object.prototype.hasOwnProperty.call(details, "benefit_tags")) return details;
  const next = { ...details };
  delete next.benefit_tags;
  return next;
}

const isMissingCountriesTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_position_countries/i.test(message);

async function storeNationalityCountries(init: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  primaryCompanyId: string;
  breezyCompanyId: string;
  positionId: string;
  details: Record<string, unknown> | null;
}) {
  if (!init.details) return;
  const desc = pickPositionDescription(init.details);
  if (!desc) return;
  const groups = extractNationalityCountryGroups(desc);
  if (groups.all.length === 0) return;
  const rows = buildCountryRows(groups);
  if (rows.length === 0) return;

  try {
    await init.admin
      .from("breezy_position_countries")
      .delete()
      .eq("company_id", init.primaryCompanyId)
      .eq("breezy_company_id", init.breezyCompanyId)
      .eq("breezy_position_id", init.positionId);
    await init.admin.from("breezy_position_countries").insert(
      rows.map((row) => ({
        company_id: init.primaryCompanyId,
        breezy_company_id: init.breezyCompanyId,
        breezy_position_id: init.positionId,
        country_code: row.country_code,
        country_name: row.country_name,
        group: row.group,
      }))
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isMissingCountriesTableError(message)) return;
    // Ignore other storage errors (should not block the details response).
  }
}

function computeNationalityCountries(details: Record<string, unknown> | null) {
  if (!details) return null;
  const desc = pickPositionDescription(details);
  if (!desc) return null;
  const groups = extractNationalityCountryGroups(desc);
  if (groups.all.length === 0) return null;
  const rows = buildCountryRows(groups);
  if (rows.length === 0) return null;

  const toItem = (row: { country_code: string; country_name: string | null }) => ({
    code: row.country_code.toUpperCase(),
    name: (row.country_name ?? "").trim() || row.country_code.toUpperCase(),
  });

  const processable = rows.filter((r) => r.group === "processable").map(toItem);
  const blocked = rows.filter((r) => r.group === "blocked").map(toItem);
  const mentioned = rows
    .filter((r) => r.group !== "processable" && r.group !== "blocked")
    .map(toItem);

  return {
    processable,
    blocked,
    mentioned,
    all: rows.map((row) => ({ ...toItem(row), group: row.group })),
  };
}

async function fetchNationalityCountries(init: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  primaryCompanyId: string;
  breezyCompanyId: string;
  positionId: string;
}): Promise<
  | {
      processable: Array<{ code: string; name: string }>;
      blocked: Array<{ code: string; name: string }>;
      mentioned: Array<{ code: string; name: string }>;
      all: Array<{ code: string; name: string; group: string }>;
    }
  | null
> {
  try {
    const { data, error } = await init.admin
      .from("breezy_position_countries")
      .select("country_code,country_name,group")
      .eq("company_id", init.primaryCompanyId)
      .eq("breezy_company_id", init.breezyCompanyId)
      .eq("breezy_position_id", init.positionId);

    if (error) {
      if (isMissingCountriesTableError(error.message ?? "")) return null;
      return null;
    }

    type Row = { country_code: string; country_name: string | null; group: string };
    const rows = Array.isArray(data) ? (data as unknown as Row[]) : [];
    const mapRow = (row: Row) => ({
      code: (row.country_code ?? "").toUpperCase(),
      name: (row.country_name ?? "").trim() || (row.country_code ?? "").toUpperCase(),
      group: row.group ?? "mentioned",
    });

    const all = rows.map(mapRow).filter((row) => row.code);
    if (all.length === 0) return { processable: [], blocked: [], mentioned: [], all: [] };

    const processable = all.filter((row) => row.group === "processable").map(({ code, name }) => ({ code, name }));
    const blocked = all.filter((row) => row.group === "blocked").map(({ code, name }) => ({ code, name }));
    const mentioned = all
      .filter((row) => row.group !== "processable" && row.group !== "blocked")
      .map(({ code, name }) => ({ code, name }));

    return {
      processable,
      blocked,
      mentioned,
      all: all.map(({ code, name, group }) => ({ code, name, group })),
    };
  } catch {
    return null;
  }
}

async function attachJobCompanyBranding(
  details: Record<string, unknown>,
  init: {
    admin: ReturnType<typeof createSupabaseAdminClient>;
    companyId: string;
    fallbackCompany?: string | null;
    jobCompanyId?: string | null;
    overrides?: unknown;
  }
) {
  const companyName =
    (typeof details.company === "string" && details.company.trim()) ||
    init.fallbackCompany?.trim() ||
    extractCompany(details);
  const normalizedName = normalizeJobCompanyName(companyName);
  const normalizedNameQuery =
    normalizedName === "virgin voyages"
      ? ["virgin voyages", "vv", "virgin voyage"]
      : normalizedName
        ? [normalizedName]
        : [];
  const jobCompanyId = typeof init.jobCompanyId === "string" ? init.jobCompanyId.trim() : "";
  if (!normalizedName && !jobCompanyId) return details;

  const exactCompanies: JobCompanyRow[] = [];
  if (jobCompanyId) {
    try {
      const res = await init.admin
        .from("job_companies")
        .select(
          "id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at"
        )
        .eq("company_id", init.companyId)
        .eq("id", jobCompanyId);
      if (res.error) throw new Error(res.error.message ?? "Failed to load job company");
      if (Array.isArray(res.data)) exactCompanies.push(...(res.data as JobCompanyRow[]));
    } catch {
      // ignore
    }
  }
  if (normalizedNameQuery.length > 0) {
    try {
      const res = await init.admin
        .from("job_companies")
        .select(
          "id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at"
        )
        .eq("company_id", init.companyId)
        .in("normalized_name", normalizedNameQuery);
      if (res.error) throw new Error(res.error.message ?? "Failed to load job company");
      if (Array.isArray(res.data)) exactCompanies.push(...(res.data as JobCompanyRow[]));
    } catch {
      // ignore
    }
  }

  let activeExactCompanies = exactCompanies;
  try {
    activeExactCompanies = await resolveActiveJobCompanies(init.admin, init.companyId, exactCompanies);
  } catch {
    activeExactCompanies = exactCompanies;
  }
  const activeById = new Map(activeExactCompanies.map((item) => [item.id, item] as const));
  const sourceIdToActive = new Map<string, JobCompanyRow>();
  const sourceAliasKeysByActiveId = new Map<string, Set<string>>();
  for (const source of exactCompanies) {
    const metadata =
      source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
        ? source.metadata
        : {};
    const targetId =
      typeof metadata.merged_into_job_company_id === "string"
        ? metadata.merged_into_job_company_id.trim()
        : "";
    const target = targetId ? activeById.get(targetId) : undefined;
    if (!target) continue;

    sourceIdToActive.set(source.id, target);
    const keys = sourceAliasKeysByActiveId.get(target.id) ?? new Set<string>();
    if (source.normalized_name) keys.add(source.normalized_name);
    const canonicalFromName = normalizeJobCompanyName(source.name);
    if (canonicalFromName) keys.add(canonicalFromName);
    sourceAliasKeysByActiveId.set(target.id, keys);
  }

  const scoreCompany = (row: JobCompanyRow) => {
    let score = 0;
    const name = (row.name ?? "").trim().toLowerCase();
    if (name === "vv" || name === "virgin voyage") score -= 5;
    if (typeof row.logo_path === "string" && row.logo_path.trim()) score += 10;
    if (typeof row.updated_at === "string" && row.updated_at.trim()) score += 1;
    return score;
  };
  const updatedTime = (row: JobCompanyRow | undefined) => {
    const time = Date.parse(row?.updated_at ?? "");
    return Number.isFinite(time) ? time : 0;
  };
  const compareCompanyPreference = (left: JobCompanyRow, right: JobCompanyRow) => {
    const leftLogoPath = typeof left.logo_path === "string" ? left.logo_path.trim() : "";
    const rightLogoPath = typeof right.logo_path === "string" ? right.logo_path.trim() : "";
    const logoDiff = Number(Boolean(rightLogoPath)) - Number(Boolean(leftLogoPath));
    if (logoDiff !== 0) return logoDiff;

    if (leftLogoPath && rightLogoPath && leftLogoPath !== rightLogoPath) {
      const logoTimeDiff = updatedTime(right) - updatedTime(left);
      if (logoTimeDiff !== 0) return logoTimeDiff;
    }

    const scoreDiff = scoreCompany(right) - scoreCompany(left);
    if (scoreDiff !== 0) return scoreDiff;

    return updatedTime(right) - updatedTime(left);
  };
  const sameNormalizedCompany = (
    left: JobCompanyRow | undefined,
    right: JobCompanyRow | undefined,
    normalized: string
  ) => {
    if (!left || !right || !normalized) return false;
    const leftKeys = new Set([left.normalized_name, normalizeJobCompanyName(left.name)]);
    const rightKeys = new Set([right.normalized_name, normalizeJobCompanyName(right.name)]);
    return leftKeys.has(normalized) && rightKeys.has(normalized);
  };

  const linkedCompany = jobCompanyId
    ? activeById.get(jobCompanyId) ?? sourceIdToActive.get(jobCompanyId)
    : undefined;
  const normalizedCompany = normalizedName
    ? activeExactCompanies
        .filter((item) => {
          const aliases = sourceAliasKeysByActiveId.get(item.id) ?? new Set<string>();
          return normalizedNameQuery.includes(item.normalized_name) ||
            normalizedNameQuery.some((name) => aliases.has(name));
        })
        .sort((a, b) => compareCompanyPreference(a, b))[0]
    : undefined;
  let company =
    linkedCompany && normalizedCompany && sameNormalizedCompany(linkedCompany, normalizedCompany, normalizedName)
      ? compareCompanyPreference(linkedCompany, normalizedCompany) > 0
        ? normalizedCompany
        : linkedCompany
      : linkedCompany ?? normalizedCompany;

  if (!company && normalizedName) {
    const { data, error } = await init.admin
      .from("job_companies")
      .select(
        "id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at"
      )
      .eq("company_id", init.companyId);
    if (error) throw new Error(error.message ?? "Failed to load job companies");
    const allCompanies = Array.isArray(data) ? (data as JobCompanyRow[]) : [];
    const nameByNormalized = new Map(
      allCompanies.map((item) => [item.normalized_name, item.name] as const)
    );
    const resolvedName = resolveKnownJobCompanyName(companyName, nameByNormalized);
    const resolvedNormalized = normalizeJobCompanyName(resolvedName);
    company = allCompanies.find((item) => item.normalized_name === resolvedNormalized);
  }

  if (!company) return details;

  let signedUrls = new Map<string, string | null>();
  try {
    signedUrls = await signJobCompanyLogoUrls(init.admin, [company]);
  } catch {
    signedUrls = new Map();
  }
  const logoPath = typeof company.logo_path === "string" ? company.logo_path.trim() : "";
  const nextName =
    typeof details.name === "string"
      ? replacePositionTitleCompany(details.name, companyName, company.name)
      : null;
  const nextTitle =
    typeof details.title === "string"
      ? replacePositionTitleCompany(details.title, companyName, company.name)
      : null;

  const shipTypes = resolveJobShipTypes({
    metadata: company.metadata,
    name: company.name,
    fallback: typeof details.name === "string" ? details.name : details.title,
  });
  const hasPositionBenefitTags = Object.prototype.hasOwnProperty.call(details, "benefit_tags");
  const benefitTags = hasPositionBenefitTags
    ? []
    : await fetchJobCompanyBenefits(init.admin, init.companyId, [company.id])
        .then((rows) => mapBenefitTagsByJobCompanyId(rows).get(company.id) ?? [])
        .catch(() => []);
  const priorityOverride = getPositionOpeningTypeOverride(init.overrides);
  const priority = resolveOpeningType({
    metadata: company.metadata,
    override: priorityOverride,
  });

  return {
    ...details,
    ...(nextName ? { name: nextName } : {}),
    ...(nextTitle ? { title: nextTitle } : {}),
    company: company.name,
    company_slug: company.slug,
    ship_type: shipTypes[0] ?? undefined,
    ship_types: shipTypes,
    company_logo_url: logoPath ? signedUrls.get(logoPath) ?? null : null,
    ...(priority || priorityOverride === null ? { priority: priority || undefined } : {}),
    ...(!hasPositionBenefitTags && benefitTags.length > 0 ? { benefit_tags: benefitTags } : {}),
  };
}

function resolveBenefitTags(details: Record<string, unknown>) {
  const saved = normalizeBenefitTags(details.benefit_tags);
  if (saved.length > 0 || Object.prototype.hasOwnProperty.call(details, "benefit_tags")) {
    return saved;
  }
  return extractBenefitTagsFromDescription(pickPositionDescription(details));
}

function jsonResponse(request: Request, body: unknown, init: { status: number }) {
  const url = new URL(request.url);
  const callback = (url.searchParams.get("callback") ?? "").trim();
  if (callback && isValidJsonpCallback(callback)) {
    const payload = `${callback}(${JSON.stringify(body)});`;
    const res = new NextResponse(payload, { status: init.status });
    res.headers.set("Content-Type", "application/javascript; charset=utf-8");
    applyPublicCors(res.headers);
    if (init.status >= 400) {
      applyPublicCacheControl(res.headers, "no-store");
    } else {
      applyPublicCacheControl(res.headers, DETAILS_CACHE_CONTROL);
    }
    return res;
  }

  const res = NextResponse.json(body, init);
  applyPublicCors(res.headers);
  if (init.status >= 400) {
    applyPublicCacheControl(res.headers, "no-store");
  } else {
    applyPublicCacheControl(res.headers, DETAILS_CACHE_CONTROL);
  }
  return res;
}

export async function OPTIONS(request: Request) {
  const res = new NextResponse(null, { status: 204 });
  applyPublicCors(res.headers);
  applyPublicCacheControl(res.headers, "public, max-age=86400");
  return res;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await params;
    if (!positionId) {
      return jsonResponse(request, { error: "Missing positionId" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const companyParam = (searchParams.get("companyId") ?? "").trim();
    const companyId = companyParam || getBreezyEnv().companyId || "";
    const cacheKey = companyId
      ? `company-branding-v9:${companyId}:${positionId}`
      : `default-branding-v9:${positionId}`;
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return jsonResponse(request, cached.payload, { status: 200 });
    }

    const admin = createSupabaseAdminClient();
    const primaryCompanyId = await getPrimaryCompanyId(admin);

    let query = admin
      .from("breezy_positions")
      .select("state,company,department,job_company_id,details,overrides,details_synced_at")
      .eq("company_id", primaryCompanyId)
      .eq("breezy_position_id", positionId);

    if (companyId) {
      query = query.eq("breezy_company_id", companyId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message ?? "Failed to load cached job details");
    if (!data) return jsonResponse(request, { error: "Not found" }, { status: 404 });

    const row = data as {
      state: string | null;
      company: string | null;
      department: string | null;
      job_company_id: string | null;
      details: unknown;
      overrides: unknown;
      details_synced_at: string | null;
    };

    if (row.state && row.state !== "published") {
      return jsonResponse(request, { error: "Not found" }, { status: 404 });
    }

    if (isRecord(row.overrides)) {
      const hidden =
        row.overrides.hidden === true ||
        (typeof row.overrides.hidden === "string" &&
          ["1", "true", "yes", "y", "on"].includes(row.overrides.hidden.trim().toLowerCase()));
      if (hidden) {
        const title =
          row.details && isRecord(row.details)
            ? row.details.name ?? row.details.title
            : null;
        const name = typeof title === "string" && title.trim() ? title.trim() : "Job opening";
        const payload = {
          hidden: true,
          not_active: true,
          message: "This ad is not active.",
          name,
          company: row.company ?? undefined,
          department: row.department ?? undefined,
        };
        responseCache.set(cacheKey, {
          expiresAt: Date.now() + 5 * 60_000,
          payload,
        });
        return jsonResponse(request, payload, { status: 200 });
      }
    }

    if (!row.details) {
      return jsonResponse(request, { error: "Not found" }, { status: 404 });
    }

    const orgType =
      normalizeOrgType(
        isRecord(row.details)
          ? row.details.org_type ?? row.details.orgType
          : null
      ) || "";
    if (orgType.toLowerCase() === "pool") {
      return jsonResponse(request, { error: "Not found" }, { status: 404 });
    }

    const merged = clearStaleDetailBenefitsWithoutOverride(
      scrubBreezyPositionDetails(applyOverrides(row.details, row.overrides)) as Record<
        string,
        unknown
      >,
      row.overrides
    );
    if (!pickPositionDescription(merged).trim()) {
      return jsonResponse(request, { error: "Not found" }, { status: 404 });
    }

    const mergedCompany = typeof merged.company === "string" ? merged.company.trim() : "";
    const mergedDepartment = typeof merged.department === "string" ? merged.department.trim() : "";
    if (row.company && !mergedCompany) merged.company = row.company;
    if (row.department && !mergedDepartment) merged.department = row.department;

    let enriched = merged;
    try {
      enriched = await attachJobCompanyBranding(merged, {
        admin,
        companyId: primaryCompanyId,
        fallbackCompany: row.company,
        jobCompanyId: row.job_company_id,
        overrides: row.overrides,
      });
    } catch {
      enriched = merged;
    }
    enriched = ensureApplicationUrl(enriched);

    const hasManualCountries = hasCountryOverride(row.overrides);
    if (companyId && !hasManualCountries) {
      await storeNationalityCountries({
        admin,
        primaryCompanyId,
        breezyCompanyId: companyId,
        positionId,
        details: merged,
      });
    }

    const countries =
      (companyId
        ? await fetchNationalityCountries({
            admin,
            primaryCompanyId,
            breezyCompanyId: companyId,
            positionId,
          })
        : null) ?? computeNationalityCountries(merged);

    const basePayload = {
      ...enriched,
      benefit_tags: resolveBenefitTags(enriched),
    };
    const payload = countries ? { ...basePayload, nationality_countries: countries } : basePayload;
    responseCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60_000,
      payload,
    });
    return jsonResponse(request, payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(request, { error: message }, { status: 500 });
  }
}
