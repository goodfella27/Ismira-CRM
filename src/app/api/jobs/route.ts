import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { applyPublicCacheControl } from "@/lib/http/public-api";
import { inferCompanyFromPositionName } from "@/lib/breezy-position-fields";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  dedupePriorityTypes,
} from "@/lib/breezy-priority-types";
import { buildBreezyPublicPositionUrl } from "@/lib/breezy-public";
import {
  fetchJobCompaniesByNormalizedName,
  normalizeJobCompanyName,
  signJobCompanyLogoUrls,
} from "@/lib/job-companies";

export const runtime = "nodejs";

type JobListItem = {
  id: string;
  name: string;
  state?: string;
  friendly_id?: string;
  org_type?: string;
  company?: string;
  department?: string;
  priority?: string;
  company_logo_url?: string;
  company_slug?: string;
  application_url?: string;
  updated_at?: string;
  processable_countries?: string[];
  blocked_countries?: string[];
  mentioned_countries?: string[];
};

type PriorityTypePayload = {
  key: string;
  label: string;
  sortOrder: number;
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

const isMissingCountriesTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_position_countries/i.test(message);

async function attachNationalityCountries(
  items: JobListItem[],
  init: {
    admin: ReturnType<typeof createSupabaseAdminClient>;
    companyId: string;
    breezyCompanyId: string;
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
  if (normalizedNames.length === 0) return items;

  const jobCompanies = await fetchJobCompaniesByNormalizedName(
    init.admin,
    init.companyId,
    normalizedNames
  );
  const byName = new Map(jobCompanies.map((item) => [item.normalized_name, item] as const));
  const signedUrls = await signJobCompanyLogoUrls(init.admin, jobCompanies);

  return items.map((item) => {
    const company = byName.get(normalizeJobCompanyName(item.company));
    if (!company) return item;
    const logoPath = typeof company.logo_path === "string" ? company.logo_path.trim() : "";
    return {
      ...item,
      company_slug: company.slug,
      company_logo_url: logoPath ? signedUrls.get(logoPath) ?? undefined : undefined,
    };
  });
}

const responseCache = new Map<
  string,
  { expiresAt: number; payload: { jobs: JobListItem[]; priorityTypes: PriorityTypePayload[] } }
>();

const isMissingPriorityTypesTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_priority_types/i.test(message);

async function loadPriorityTypes(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string
) {
  const { data, error } = await admin
    .from("breezy_priority_types")
    .select("key,label,sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    if (isMissingPriorityTypesTableError(error.message ?? "")) {
      return DEFAULT_BREEZY_PRIORITY_TYPES;
    }
    throw error;
  }

  return dedupePriorityTypes(
    (Array.isArray(data)
      ? (data as Array<{ key: string | null; label: string | null; sort_order: number | null }>)
      : []
    ).map((row, index) => ({
      key: row.key ?? "",
      label: row.label ?? "",
      sortOrder: Number.isFinite(row.sort_order) ? Number(row.sort_order) : index,
    }))
  );
}

// Cache aggressively at the CDN while keeping client-side revalidation cheap (ETag + 304).
const LIST_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";

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
    const bypassCache = searchParams.has("ts") || searchParams.get("bypassCache") === "1";
    const cacheKey = companyParam ? `company:${companyId}` : "default";
    const cached = !bypassCache ? responseCache.get(cacheKey) : null;
    if (cached && cached.expiresAt > Date.now()) {
      return jsonResponse(request, cached.payload, { status: 200 });
    }

    // Prefer database cache (fast + supports local edits). Falls back to Breezy if not available.
    try {
      const admin = createSupabaseAdminClient();
      const primaryCompanyId = await getPrimaryCompanyId(admin);

      const { data, error } = await admin
        .from("breezy_positions")
        .select(
          "breezy_position_id,name,state,friendly_id,org_type,company,department,overrides,updated_at"
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
              updated_at: row.updated_at ?? undefined,
            } satisfies JobListItem;
          })
          .filter(Boolean)
          .map((item) => item as JobListItem)
          .filter((pos) => pos.id)
          .filter((pos) => (pos.org_type || "").toLowerCase() !== "pool");

        let enriched = attachPublicApplyUrls(mapped);
        try {
          enriched = await attachJobCompanyBranding(enriched, {
            admin,
            companyId: primaryCompanyId,
          });
        } catch {
          enriched = attachPublicApplyUrls(mapped);
        }

        try {
          enriched = await attachNationalityCountries(enriched, {
            admin,
            companyId: primaryCompanyId,
            breezyCompanyId: companyId,
          });
        } catch {
          // ignore
        }

        enriched = attachPublicApplyUrls(enriched);

        const priorityTypes = await loadPriorityTypes(admin, primaryCompanyId);
        const payload = { jobs: enriched, priorityTypes };
        responseCache.set(cacheKey, {
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
        enriched = attachPublicApplyUrls(finalList);
      }

      try {
        enriched = await attachNationalityCountries(enriched, {
          admin,
          companyId: primaryCompanyId,
          breezyCompanyId: companyId,
        });
      } catch {
        // ignore
      }
      try {
        priorityTypes = await loadPriorityTypes(admin, primaryCompanyId);
      } catch {
        priorityTypes = DEFAULT_BREEZY_PRIORITY_TYPES;
      }
      const payload = { jobs: enriched, priorityTypes };
      responseCache.set(cacheKey, {
        expiresAt: Date.now() + 60_000,
        payload,
      });
      return jsonResponse(request, payload, { status: 200 });
    } catch {
      enriched = attachPublicApplyUrls(finalList);
    }

    enriched = attachPublicApplyUrls(enriched);
    const payload = { jobs: enriched, priorityTypes: DEFAULT_BREEZY_PRIORITY_TYPES };
    responseCache.set(cacheKey, {
      expiresAt: Date.now() + 60_000,
      payload,
    });
    return jsonResponse(request, payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(request, { error: message }, { status: 500 });
  }
}
