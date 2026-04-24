import { NextResponse } from "next/server";

import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  extractCompany,
  extractDepartment,
  replacePositionTitleCompany,
} from "@/lib/breezy-position-fields";
import { applyPublicCacheControl } from "@/lib/http/public-api";
import { pickPositionDescription } from "@/lib/breezy-position-description";
import { buildCountryRows, extractNationalityCountryGroups } from "@/lib/nationality-countries";
import { buildBreezyPublicPositionUrl } from "@/lib/breezy-public";
import { extractBenefitTagsFromDescription } from "@/lib/job-benefits";
import {
  fetchJobCompaniesByNormalizedName,
  normalizeJobCompanyName,
  signJobCompanyLogoUrls,
} from "@/lib/job-companies";

export const runtime = "nodejs";

const DETAILS_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";
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
  }
) {
  const companyName =
    (typeof details.company === "string" && details.company.trim()) ||
    init.fallbackCompany?.trim() ||
    extractCompany(details);
  const normalizedName = normalizeJobCompanyName(companyName);
  if (!normalizedName) return details;

  const companies = await fetchJobCompaniesByNormalizedName(init.admin, init.companyId, [
    normalizedName,
  ]);
  const company = companies[0];
  if (!company) return details;

  const signedUrls = await signJobCompanyLogoUrls(init.admin, [company]);
  const logoPath = typeof company.logo_path === "string" ? company.logo_path.trim() : "";
  const nextName =
    typeof details.name === "string"
      ? replacePositionTitleCompany(details.name, companyName, company.name)
      : null;
  const nextTitle =
    typeof details.title === "string"
      ? replacePositionTitleCompany(details.title, companyName, company.name)
      : null;

  return {
    ...details,
    ...(nextName ? { name: nextName } : {}),
    ...(nextTitle ? { title: nextTitle } : {}),
    company: company.name,
    company_slug: company.slug,
    company_logo_url: logoPath ? signedUrls.get(logoPath) ?? null : null,
  };
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
    const companyId = companyParam || requireBreezyCompanyId().companyId;
    const cacheKey = `${companyId}:${positionId}`;
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (isRecord(cached.payload) && !("nationality_countries" in cached.payload)) {
        responseCache.delete(cacheKey);
      } else {
      return jsonResponse(request, cached.payload, { status: 200 });
      }
    }

    // Prefer database cache (fast + supports local edits). Falls back to Breezy.
    try {
      const admin = createSupabaseAdminClient();
      const primaryCompanyId = await getPrimaryCompanyId(admin);

      const { data, error } = await admin
        .from("breezy_positions")
        .select("state,company,department,details,overrides,details_synced_at")
        .eq("company_id", primaryCompanyId)
        .eq("breezy_company_id", companyId)
        .eq("breezy_position_id", positionId)
        .maybeSingle();

      if (!error && data) {
        const row = data as {
          state: string | null;
          company: string | null;
          department: string | null;
          details: unknown;
          overrides: unknown;
          details_synced_at: string | null;
        };

        if (row.state && row.state !== "published") {
          return jsonResponse(request, { error: "Not found" }, { status: 404 });
        }

        if (row.overrides && typeof row.overrides === "object" && !Array.isArray(row.overrides)) {
          const overrides = row.overrides as Record<string, unknown>;
          const hidden =
            overrides.hidden === true ||
            (typeof overrides.hidden === "string" &&
              ["1", "true", "yes", "y", "on"].includes(overrides.hidden.trim().toLowerCase()));
          if (hidden) {
            const title =
              (row.details && isRecord(row.details)
                ? (row.details as Record<string, unknown>).name ??
                  (row.details as Record<string, unknown>).title
                : null) ?? null;
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

        if (row.details) {
          const orgType =
            normalizeOrgType(
              isRecord(row.details)
                ? (row.details as Record<string, unknown>).org_type ??
                    (row.details as Record<string, unknown>).orgType
                : null
            ) || "";
          if (orgType.toLowerCase() === "pool") {
            return jsonResponse(request, { error: "Not found" }, { status: 404 });
          }

          const merged = applyOverrides(row.details, row.overrides) as Record<string, unknown>;
          const mergedCompany =
            typeof merged.company === "string" ? merged.company.trim() : "";
          const mergedDepartment =
            typeof merged.department === "string" ? merged.department.trim() : "";
          if (row.company && !mergedCompany) merged.company = row.company;
          if (row.department && !mergedDepartment) merged.department = row.department;
          let enriched = merged;
          try {
            enriched = await attachJobCompanyBranding(merged, {
              admin,
              companyId: primaryCompanyId,
              fallbackCompany: row.company,
            });
		          } catch {
		            enriched = merged;
		          }
		          enriched = ensureApplicationUrl(enriched);
		          await storeNationalityCountries({
		            admin,
		            primaryCompanyId,
		            breezyCompanyId: companyId,
		            positionId,
		            details: merged,
		          });

	          const countries =
	            (await fetchNationalityCountries({
	              admin,
	              primaryCompanyId,
	              breezyCompanyId: companyId,
	              positionId,
	            })) ?? computeNationalityCountries(merged);

	          const benefitTags = extractBenefitTagsFromDescription(pickPositionDescription(enriched));
	          const basePayload = {
	            ...enriched,
	            benefit_tags: benefitTags,
	          };
	          const payload = countries
	            ? { ...basePayload, nationality_countries: countries }
	            : basePayload;
	          responseCache.set(cacheKey, {
	            expiresAt: Date.now() + 5 * 60_000,
	            payload,
	          });
	          return jsonResponse(request, payload, { status: 200 });
        }

        // No cached details yet; fetch from Breezy and store for next time.
        const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(
          companyId
        )}/position/${encodeURIComponent(positionId)}`;

        const res = await breezyFetch(url);
        const contentType = res.headers.get("content-type") ?? "";
        const isJson = contentType.includes("application/json");
        const body = isJson ? await res.json() : await res.text();

        if (!res.ok) {
          return jsonResponse(
            request,
            { error: "Breezy request failed", status: res.status, details: body },
            { status: res.status }
          );
        }

        if (body && typeof body === "object") {
          const state = (body as Record<string, unknown>).state;
          if (typeof state === "string" && state !== "published") {
            return jsonResponse(request, { error: "Not found" }, { status: 404 });
          }

          const orgType = normalizeOrgType(
            (body as Record<string, unknown>).org_type ??
              (body as Record<string, unknown>).orgType
          );
          if (orgType.toLowerCase() === "pool") {
            return jsonResponse(request, { error: "Not found" }, { status: 404 });
          }
        }

        const record = isRecord(body) ? (body as Record<string, unknown>) : null;
        await admin.from("breezy_positions").upsert(
          [
            {
              company_id: primaryCompanyId,
              breezy_company_id: companyId,
              breezy_position_id: positionId,
              details: body,
              company: extractCompany(record) || null,
              department: extractDepartment(record) || null,
              details_synced_at: new Date().toISOString(),
            },
          ],
          { onConflict: "company_id,breezy_position_id", defaultToNull: false }
        );
        await storeNationalityCountries({
          admin,
          primaryCompanyId,
          breezyCompanyId: companyId,
          positionId,
          details: isRecord(body) ? (body as Record<string, unknown>) : null,
        });

        const merged = applyOverrides(body, row.overrides) as Record<string, unknown>;
        const mergedCompany = typeof merged.company === "string" ? merged.company.trim() : "";
        const mergedDepartment =
          typeof merged.department === "string" ? merged.department.trim() : "";
        const effectiveCompany =
          mergedCompany || extractCompany(isRecord(merged) ? merged : null) || "";
        const effectiveDepartment =
          mergedDepartment || extractDepartment(isRecord(merged) ? merged : null) || "";
        if (effectiveCompany && !mergedCompany) merged.company = effectiveCompany;
        if (effectiveDepartment && !mergedDepartment) merged.department = effectiveDepartment;
        let enriched = merged;
	        try {
	          enriched = await attachJobCompanyBranding(merged, {
	            admin,
	            companyId: primaryCompanyId,
	            fallbackCompany: effectiveCompany,
	          });
		        } catch {
		          enriched = merged;
		        }
		        enriched = ensureApplicationUrl(enriched);
		        const countries =
		          (await fetchNationalityCountries({
		            admin,
		            primaryCompanyId,
	            breezyCompanyId: companyId,
	            positionId,
	          })) ?? computeNationalityCountries(merged);

	        const payload = countries ? { ...enriched, nationality_countries: countries } : enriched;
	        responseCache.set(cacheKey, {
	          expiresAt: Date.now() + 5 * 60_000,
	          payload,
	        });
	        return jsonResponse(request, payload, { status: 200 });
      }
    } catch {
      // Ignore and fall back to Breezy.
    }

    const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(
      companyId
    )}/position/${encodeURIComponent(positionId)}`;

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

    if (body && typeof body === "object") {
      const state = (body as Record<string, unknown>).state;
      if (typeof state === "string" && state !== "published") {
        return jsonResponse(request, { error: "Not found" }, { status: 404 });
      }

      const orgType = normalizeOrgType(
        (body as Record<string, unknown>).org_type ??
          (body as Record<string, unknown>).orgType
      );
      if (orgType.toLowerCase() === "pool") {
        return jsonResponse(request, { error: "Not found" }, { status: 404 });
      }
    }

	    let enriched = body;
	    try {
	      if (isRecord(body)) {
	        const admin = createSupabaseAdminClient();
	        const primaryCompanyId = await getPrimaryCompanyId(admin);
	        const record = body as Record<string, unknown>;
	        try {
	          const now = new Date().toISOString();
	          await admin.from("breezy_positions").upsert(
	            [
	              {
                company_id: primaryCompanyId,
                breezy_company_id: companyId,
                breezy_position_id: positionId,
                name: typeof record.name === "string" ? record.name : null,
                state: typeof record.state === "string" ? record.state : null,
                friendly_id: typeof record.friendly_id === "string" ? record.friendly_id : null,
                org_type:
                  typeof record.org_type === "string"
                    ? record.org_type
                    : typeof record.orgType === "string"
                      ? record.orgType
                      : null,
                details: record,
                company: extractCompany(record) || null,
                department: extractDepartment(record) || null,
                details_synced_at: now,
                synced_at: now,
              },
            ],
            { onConflict: "company_id,breezy_position_id", defaultToNull: false }
          );
          await storeNationalityCountries({
            admin,
            primaryCompanyId,
            breezyCompanyId: companyId,
            positionId,
            details: record,
          });
        } catch {
          // Ignore cache write failures.
        }
	        try {
	          enriched = await attachJobCompanyBranding(body as Record<string, unknown>, {
	            admin,
	            companyId: primaryCompanyId,
	          });
	        } catch {
	          enriched = body;
	        }
	        if (isRecord(enriched)) {
	          enriched = ensureApplicationUrl(enriched);
	        }
	
		        const countries =
			          (await fetchNationalityCountries({
		            admin,
		            primaryCompanyId,
		            breezyCompanyId: companyId,
		            positionId,
		          })) ?? computeNationalityCountries(record);

	        if (countries && isRecord(enriched)) {
	          enriched = {
	            ...(enriched as Record<string, unknown>),
	            nationality_countries: countries,
	          };
	        }
	      }
		  } catch {
		    enriched = body;
		  }

    if (isRecord(enriched)) {
      const benefitTags = extractBenefitTagsFromDescription(pickPositionDescription(enriched));
      enriched = { ...(enriched as Record<string, unknown>), benefit_tags: benefitTags };
    }

    responseCache.set(cacheKey, {
      expiresAt: Date.now() + 5 * 60_000,
      payload: enriched,
    });
    return jsonResponse(request, enriched, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(request, { error: message }, { status: 500 });
  }
}
