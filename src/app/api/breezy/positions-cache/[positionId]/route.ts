import { NextResponse } from "next/server";

import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { canonicalizeCountry } from "@/lib/country";
import {
  fetchJobCompanyBenefits,
  mapBenefitTagsByJobCompanyId,
  normalizeBenefitTags,
} from "@/lib/job-company-benefits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { asTrimmedString, extractCompany, extractDepartment, extractOrgType } from "@/lib/breezy-position-fields";
import { scrubBreezyPositionDetails } from "@/lib/breezy-position-description";
import {
  ensureJobCompaniesByName,
  fetchPositionJobCompanyNames,
  normalizeJobCompanyName,
  resolveKnownJobCompanyName,
  setPositionJobCompanies,
  syncJobCompaniesFromPositions,
} from "@/lib/job-companies";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";

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
  "hidden",
  "benefit_tags",
  "processable_country_codes",
]);

const isMissingPositionsTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_positions/i.test(message);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCountryCodes(payload: unknown) {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const item of payload) {
    const code =
      typeof item === "string"
        ? item.trim().toUpperCase()
        : isRecord(item) && typeof item.code === "string"
          ? item.code.trim().toUpperCase()
          : "";
    if (!/^[A-Z]{2}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

function hasCountryOverride(overrides: unknown) {
  if (!isRecord(overrides)) return false;
  if (!Object.prototype.hasOwnProperty.call(overrides, "processable_country_codes")) return false;
  return normalizeCountryCodes(overrides.processable_country_codes).length > 0;
}

function parseHiddenOverride(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function applyOverrides(details: unknown, overrides: unknown) {
  const base = isRecord(details) ? { ...details } : {};
  const overrideObj = isRecord(overrides) ? overrides : {};

  for (const [key, value] of Object.entries(overrideObj)) {
    if (!allowedOverrideKeys.has(key)) continue;
    if (key === "hidden") {
      const parsed = parseHiddenOverride(value);
      if (parsed === true) base.hidden = true;
      else if (parsed === false) delete (base as Record<string, unknown>).hidden;
      continue;
    }
    if (key === "benefit_tags") {
      const tags = normalizeBenefitTags(value);
      base.benefit_tags = tags;
      continue;
    }
    if (key === "processable_country_codes") {
      const codes = normalizeCountryCodes(value);
      if (codes.length === 0) continue;
      const countries = codes.map((code) => ({
        code,
        name: canonicalizeCountry(code) ?? code,
      }));
      base.processable_country_codes = codes;
      base.nationality_countries = {
        ...(isRecord(base.nationality_countries) ? base.nationality_countries : {}),
        processable: countries,
        all: countries,
      };
      continue;
    }
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

async function fetchSavedPositionCountries(init: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  companyId: string;
  breezyCompanyId: string;
  positionId: string;
}) {
  const { data, error } = await init.admin
    .from("breezy_position_countries")
    .select("country_code,country_name,group")
    .eq("company_id", init.companyId)
    .eq("breezy_company_id", init.breezyCompanyId)
    .eq("breezy_position_id", init.positionId);

  if (error || !Array.isArray(data)) return null;

  type Row = { country_code: string | null; country_name: string | null; group: string | null };
  const rows = (data as Row[])
    .map((row) => ({
      code: (row.country_code ?? "").trim().toUpperCase(),
      name: (row.country_name ?? "").trim() || (row.country_code ?? "").trim().toUpperCase(),
      group: (row.group ?? "mentioned").trim() || "mentioned",
    }))
    .filter((row) => /^[A-Z]{2}$/.test(row.code));

  if (rows.length === 0) return null;

  return {
    processable: rows
      .filter((row) => row.group === "processable")
      .map(({ code, name }) => ({ code, name })),
    blocked: rows
      .filter((row) => row.group === "blocked")
      .map(({ code, name }) => ({ code, name })),
    mentioned: rows
      .filter((row) => row.group !== "processable" && row.group !== "blocked")
      .map(({ code, name }) => ({ code, name })),
    all: rows,
  };
}

async function fetchPositionJobCompanyIds(init: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  companyId: string;
  positionId: string;
  fallbackJobCompanyId?: string | null;
}) {
  const ids: string[] = [];
  const fallback = (init.fallbackJobCompanyId ?? "").trim();
  if (fallback) ids.push(fallback);

  const { data, error } = await init.admin
    .from("job_position_companies")
    .select("job_company_id,is_primary")
    .eq("company_id", init.companyId)
    .eq("breezy_position_id", init.positionId)
    .order("is_primary", { ascending: false });

  if (!error && Array.isArray(data)) {
    for (const row of data as Array<{ job_company_id: string | null }>) {
      const id = (row.job_company_id ?? "").trim();
      if (id) ids.push(id);
    }
  }

  return Array.from(new Set(ids));
}

function getJobCompanyCountryCodes(metadata: unknown) {
  if (!isRecord(metadata)) return [];
  return normalizeCountryCodes(metadata.job_company_country_codes);
}

function countryGroupsFromCodes(codes: string[]) {
  const processable = normalizeCountryCodes(codes).map((code) => ({
    code,
    name: canonicalizeCountry(code) ?? code,
  }));
  return {
    processable,
    blocked: [],
    mentioned: [],
    all: processable,
  };
}

function getPositionProcessableCountryCodes(details: unknown) {
  if (!isRecord(details)) return [];
  const direct = normalizeCountryCodes(details.processable_country_codes);
  if (direct.length > 0) return direct;
  const countries = isRecord(details.nationality_countries)
    ? details.nationality_countries
    : null;
  return normalizeCountryCodes(countries?.processable);
}

async function fetchJobCompanyCountries(init: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  companyId: string;
  jobCompanyIds: string[];
}) {
  const ids = Array.from(new Set(init.jobCompanyIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return null;

  const { data, error } = await init.admin
    .from("job_companies")
    .select("id,metadata")
    .eq("company_id", init.companyId)
    .in("id", ids);

  if (error || !Array.isArray(data)) return null;

  const byId = new Map(
    (data as Array<{ id: string | null; metadata: unknown }>).map((row) => [
      (row.id ?? "").trim(),
      row.metadata,
    ])
  );
  const codes = ids.flatMap((id) => getJobCompanyCountryCodes(byId.get(id)));
  const uniqueCodes = normalizeCountryCodes(codes);
  if (uniqueCodes.length > 0) return countryGroupsFromCodes(uniqueCodes);

  const derivedCodes: string[] = [];
  const positionIds = new Set<string>();

  const { data: directPositions } = await init.admin
    .from("breezy_positions")
    .select("breezy_position_id,details,state,org_type")
    .eq("company_id", init.companyId)
    .in("job_company_id", ids)
    .eq("state", "published");

  if (Array.isArray(directPositions)) {
    for (const row of directPositions as Array<{
      breezy_position_id: string | null;
      details: unknown;
      state: string | null;
      org_type: string | null;
    }>) {
      if ((row.org_type ?? "").toLowerCase() === "pool") continue;
      const positionId = (row.breezy_position_id ?? "").trim();
      if (positionId) positionIds.add(positionId);
      derivedCodes.push(...getPositionProcessableCountryCodes(row.details));
    }
  }

  const { data: joinRows } = await init.admin
    .from("job_position_companies")
    .select("breezy_position_id")
    .eq("company_id", init.companyId)
    .in("job_company_id", ids);

  const joinedPositionIds = Array.isArray(joinRows)
    ? Array.from(
        new Set(
          (joinRows as Array<{ breezy_position_id: string | null }>)
            .map((row) => (row.breezy_position_id ?? "").trim())
            .filter(Boolean)
        )
      )
    : [];

  if (joinedPositionIds.length > 0) {
    const { data: joinedPositions } = await init.admin
      .from("breezy_positions")
      .select("breezy_position_id,details,state,org_type")
      .eq("company_id", init.companyId)
      .in("breezy_position_id", joinedPositionIds)
      .eq("state", "published");

    if (Array.isArray(joinedPositions)) {
      for (const row of joinedPositions as Array<{
        breezy_position_id: string | null;
        details: unknown;
        state: string | null;
        org_type: string | null;
      }>) {
        if ((row.org_type ?? "").toLowerCase() === "pool") continue;
        const positionId = (row.breezy_position_id ?? "").trim();
        if (positionId) positionIds.add(positionId);
        derivedCodes.push(...getPositionProcessableCountryCodes(row.details));
      }
    }
  }

  if (positionIds.size > 0) {
    const { data: countryRows } = await init.admin
      .from("breezy_position_countries")
      .select("country_code,group")
      .eq("company_id", init.companyId)
      .eq("group", "processable")
      .in("breezy_position_id", Array.from(positionIds));

    if (Array.isArray(countryRows)) {
      for (const row of countryRows as Array<{ country_code: string | null; group: string | null }>) {
        if ((row.group ?? "").toLowerCase() !== "processable") continue;
        const code = (row.country_code ?? "").trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(code)) derivedCodes.push(code);
      }
    }
  }

  const uniqueDerivedCodes = normalizeCountryCodes(derivedCodes);
  return uniqueDerivedCodes.length > 0 ? countryGroupsFromCodes(uniqueDerivedCodes) : null;
}

async function hydrateSavedSelections(
  details: Record<string, unknown>,
  init: {
    admin: ReturnType<typeof createSupabaseAdminClient>;
    companyId: string;
    breezyCompanyId: string;
    positionId: string;
    fallbackCompany?: string | null;
    jobCompanyId?: string | null;
    overrides?: unknown;
  }
) {
  const next = { ...details };
  const overrides = isRecord(init.overrides) ? init.overrides : {};

  const jobCompanyIds: string[] = await fetchPositionJobCompanyIds({
    admin: init.admin,
    companyId: init.companyId,
    positionId: init.positionId,
    fallbackJobCompanyId: init.jobCompanyId,
  }).catch(() => [] as string[]);
  if (jobCompanyIds.length === 0 && init.fallbackCompany?.trim()) {
    const { data } = await init.admin
      .from("job_companies")
      .select("id,name,normalized_name")
      .eq("company_id", init.companyId);
    const rows = Array.isArray(data)
      ? (data as Array<{ id: string | null; name: string | null; normalized_name: string | null }>)
      : [];
    const nameByNormalized = new Map(
      rows
        .map((row) => [(row.normalized_name ?? "").trim(), (row.name ?? "").trim()] as const)
        .filter(([normalized, name]) => normalized && name)
    );
    const resolvedName = resolveKnownJobCompanyName(init.fallbackCompany, nameByNormalized);
    const resolvedNormalized = normalizeJobCompanyName(resolvedName || init.fallbackCompany);
    const matchedId =
      rows.find((row) => (row.normalized_name ?? "").trim() === resolvedNormalized)?.id ?? "";
    if (matchedId.trim()) jobCompanyIds.push(matchedId.trim());
  }
  if (!Object.prototype.hasOwnProperty.call(overrides, "benefit_tags") && jobCompanyIds.length > 0) {
    const benefitRows = await fetchJobCompanyBenefits(
      init.admin,
      init.companyId,
      jobCompanyIds
    ).catch(() => []);
    const tagsById = mapBenefitTagsByJobCompanyId(benefitRows);
    const tags = jobCompanyIds.flatMap((id) => tagsById.get(id) ?? []);
    next.benefit_tags = normalizeBenefitTags(tags);
  }

  if (!hasCountryOverride(overrides)) {
    const countries = (await fetchSavedPositionCountries({
      admin: init.admin,
      companyId: init.companyId,
      breezyCompanyId: init.breezyCompanyId,
      positionId: init.positionId,
    }).catch(() => null)) ?? (await fetchJobCompanyCountries({
      admin: init.admin,
      companyId: init.companyId,
      jobCompanyIds,
    }).catch(() => null));
    if (countries) {
      next.nationality_countries = countries;
      next.processable_country_codes = countries.processable.map((country) => country.code);
    }
  }

  return next;
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
    await ensureCompanyMembership(admin, user.id);
    const canEdit = true;
    const companyId = await getPrimaryCompanyId(admin);

    const { data, error } = await admin
      .from("breezy_positions")
      .select(
        "breezy_position_id,name,state,friendly_id,org_type,company,department,job_company_id,details,overrides,synced_at,details_synced_at,updated_at"
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
          job_company_id: string | null;
          details: unknown;
          overrides: unknown;
          synced_at: string | null;
          details_synced_at: string | null;
          updated_at: string | null;
        }
      | null;

    if (row?.details) {
      let merged = applyOverrides(row.details, row.overrides);
      if (row.company && !asTrimmedString((merged as Record<string, unknown>)?.company)) {
        (merged as Record<string, unknown>).company = row.company;
      }
      if (row.department && !asTrimmedString((merged as Record<string, unknown>)?.department)) {
        (merged as Record<string, unknown>).department = row.department;
      }
      const linkedCompanies = await fetchPositionJobCompanyNames(admin, {
        companyId,
        breezyPositionId: posId,
      }).catch(() => []);
      const companies =
        linkedCompanies.length > 0
          ? linkedCompanies
          : row.company && row.company.trim()
            ? [row.company.trim()]
            : [];
      if (companies.length > 0) {
        (merged as Record<string, unknown>).companies = companies;
      }
      merged = await hydrateSavedSelections(merged as Record<string, unknown>, {
        admin,
        companyId,
        breezyCompanyId,
        positionId: posId,
        fallbackCompany: companies[0] ?? row.company,
        jobCompanyId: row.job_company_id,
        overrides: row.overrides,
      });
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
            companies,
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
    const payload = scrubBreezyPositionDetails(breezy.body);
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
    let merged = applyOverrides(payload, overrides) as Record<string, unknown>;
    const effectiveCompany = overrideCompany ?? baseCompany;
    const effectiveDepartment = overrideDepartment ?? baseDepartment;
    if (effectiveCompany && !asTrimmedString(merged.company)) merged.company = effectiveCompany;
    if (effectiveDepartment && !asTrimmedString(merged.department)) {
      merged.department = effectiveDepartment;
    }
    const linkedCompanies = await fetchPositionJobCompanyNames(admin, {
      companyId,
      breezyPositionId: posId,
    }).catch(() => []);
    const companies =
      linkedCompanies.length > 0
        ? linkedCompanies
        : effectiveCompany
          ? [effectiveCompany]
          : [];
    if (companies.length > 0) merged.companies = companies;
    merged = await hydrateSavedSelections(merged, {
      admin,
      companyId,
      breezyCompanyId,
      positionId: posId,
      fallbackCompany: companies[0] ?? effectiveCompany,
      jobCompanyId: null,
      overrides,
    });

    clearJobsResponseCache();
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
          companies,
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
    await ensureCompanyMembership(admin, user.id);
    const companyId = await getPrimaryCompanyId(admin);

    const breezy = await fetchBreezyDetails(breezyCompanyId, posId);
    if (!breezy.res.ok) {
      return NextResponse.json(
        { error: "Breezy request failed", status: breezy.res.status, details: breezy.body },
        { status: breezy.res.status }
      );
    }

    const now = new Date().toISOString();
    const payload = scrubBreezyPositionDetails(breezy.body);
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
      | { overrides?: unknown; reset?: unknown; companies?: unknown }
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
    await ensureCompanyMembership(admin, user.id);
    const companyId = await getPrimaryCompanyId(admin);

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
        if (key === "hidden") {
          const parsed = parseHiddenOverride(value);
          if (parsed === true) nextOverrides.hidden = true;
          else delete nextOverrides.hidden;
          continue;
        }
        if (key === "benefit_tags") {
          nextOverrides.benefit_tags = normalizeBenefitTags(value);
          continue;
        }
        if (key === "processable_country_codes") {
          const codes = normalizeCountryCodes(value);
          if (codes.length > 0) nextOverrides.processable_country_codes = codes;
          else delete nextOverrides.processable_country_codes;
          continue;
        }
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

    const companyNamesInput = Array.isArray(payload.companies)
      ? payload.companies
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];
    const nextCompany =
      typeof nextOverrides.company === "string" && nextOverrides.company.trim()
        ? nextOverrides.company.trim()
        : extractCompany(currentDetails) || "";
    const hasExplicitCompanies = Array.isArray(payload.companies);
    const companyNames =
      companyNamesInput.length > 0 ? companyNamesInput : nextCompany ? [nextCompany] : [];
    let linkedJobCompanies: Array<{ id: string; metadata?: unknown }> = [];
    if (hasExplicitCompanies || companyNames.length > 0) {
      const companies = await ensureJobCompaniesByName(admin, companyId, companyNames, {
        breezyCompanyId,
      });
      linkedJobCompanies = companies;
      const jobCompanyIds = companies.map((company) => company.id).filter(Boolean);
      await setPositionJobCompanies(admin, {
        companyId,
        breezyPositionId: posId,
        jobCompanyIds,
        primaryJobCompanyId: jobCompanyIds[0] ?? null,
      });
    }

    const overrideRecord = overridesInput as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(overrideRecord, "benefit_tags")) {
      const tags = normalizeBenefitTags(overrideRecord.benefit_tags);
      const primaryJobCompany = linkedJobCompanies[0] ?? null;
      if (primaryJobCompany) {
        const metadata =
          primaryJobCompany.metadata &&
          typeof primaryJobCompany.metadata === "object" &&
          !Array.isArray(primaryJobCompany.metadata)
            ? (primaryJobCompany.metadata as Record<string, unknown>)
            : {};

        await admin
          .from("job_company_benefits")
          .delete()
          .eq("company_id", companyId)
          .eq("job_company_id", primaryJobCompany.id);
        if (tags.length > 0) {
          await admin.from("job_company_benefits").insert(
            tags.map((tag, index) => ({
              company_id: companyId,
              job_company_id: primaryJobCompany.id,
              tag,
              sort_order: index,
              enabled: true,
            }))
          );
        }
        await admin
          .from("job_companies")
          .update({
            metadata: { ...metadata, job_company_benefits_manual_override: true },
          })
          .eq("company_id", companyId)
          .eq("id", primaryJobCompany.id);
      }
    }

    if (Object.prototype.hasOwnProperty.call(overrideRecord, "processable_country_codes")) {
      const codes = normalizeCountryCodes(overrideRecord.processable_country_codes);
      await admin
        .from("breezy_position_countries")
        .delete()
        .eq("company_id", companyId)
        .eq("breezy_company_id", breezyCompanyId)
        .eq("breezy_position_id", posId);
      if (codes.length > 0) {
        await admin.from("breezy_position_countries").insert(
          codes.map((code) => ({
            company_id: companyId,
            breezy_company_id: breezyCompanyId,
            breezy_position_id: posId,
            country_code: code,
            country_name: canonicalizeCountry(code) ?? code,
            group: "processable",
          }))
        );
      }
    }

    if (!hasExplicitCompanies) {
      try {
        await syncJobCompaniesFromPositions(admin, {
          companyId,
          breezyCompanyId,
        });
      } catch {
        // Best effort: override save should still succeed without company sync.
      }
    }

    clearJobsResponseCache();
    return NextResponse.json({ ok: true, overrides: nextOverrides }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
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

    const { error } = await admin
      .from("breezy_positions")
      .delete()
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .eq("breezy_position_id", posId);

    if (error) {
      if (isMissingPositionsTableError(error.message ?? "")) {
        return NextResponse.json(
          {
            error:
              "Database table `breezy_positions` is not set up. Apply `supabase/breezy_positions.sql` in your Supabase project.",
          },
          { status: 500 }
        );
      }
      throw new Error(error.message ?? "Failed to delete record.");
    }

    clearJobsResponseCache();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
