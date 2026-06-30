import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import { fetchJobCountryOptions } from "@/lib/job-country-options";
import { fetchJobBenefitOptions } from "@/lib/job-benefit-options";
import {
  fetchJobCompanyBenefits,
  mapBenefitTagsByJobCompanyId,
  syncAutoBenefitsFromCachedPositions,
} from "@/lib/job-company-benefits";
import {
  normalizeJobCompanyName,
  resolveKnownJobCompanyName,
  slugifyJobCompanyName,
  signJobCompanyLogoUrls,
  type JobCompanyRow,
} from "@/lib/job-companies";
import { resolveJobShipType, resolveJobShipTypes } from "@/lib/job-ship-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

const normalizeJobCompaniesError = (raw?: string | null) => {
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) return "Failed to load job companies.";
  if (/schema cache/i.test(message) && /job_company_benefits/i.test(message)) {
    return [
      "Job company benefits table is not set up yet.",
      "Run `supabase/job_company_benefits.sql` in the Supabase SQL editor, then reload the API schema cache (Settings -> API -> Reload schema) or restart the API.",
    ].join(" ");
  }
  return message;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getJobCompanyCountryCodes(metadata: unknown) {
  if (!isRecord(metadata)) return [];
  const raw = metadata.job_company_country_codes;
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw
      .map((code) => (typeof code === "string" ? code.trim().toUpperCase() : ""))
      .filter((code) => /^[A-Z]{2}$/.test(code))
  )];
}

function normalizeCountryCodeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => {
          if (typeof item === "string") return item.trim().toUpperCase();
          if (isRecord(item) && typeof item.code === "string") {
            return item.code.trim().toUpperCase();
          }
          return "";
        })
        .filter((code) => /^[A-Z]{2}$/.test(code))
    ),
  ];
}

function getPositionProcessableCountryCodes(details: unknown) {
  if (!isRecord(details)) return [];
  const direct = normalizeCountryCodeList(details.processable_country_codes);
  if (direct.length > 0) return direct;
  const countries = isRecord(details.nationality_countries)
    ? details.nationality_countries
    : null;
  return normalizeCountryCodeList(countries?.processable);
}

export async function GET() {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const { data, error } = await admin
      .from("job_companies")
      .select("id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at")
      .eq("company_id", membership.companyId)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(
        error.message ?? "Failed to load job companies. Apply `supabase/job_companies.sql` first."
      );
    }

    const rows = Array.isArray(data) ? (data as JobCompanyRow[]) : [];
    const activeRows = rows.filter((row) => {
      const metadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? row.metadata
          : {};
      return typeof metadata.merged_into_job_company_id !== "string";
    });
    const logoUrls = await signJobCompanyLogoUrls(admin, activeRows);
    let benefits = await fetchJobCompanyBenefits(
      admin,
      membership.companyId,
      activeRows.map((row) => row.id)
    ).catch((benefitsError) => {
      const message =
        benefitsError instanceof Error ? benefitsError.message : "Failed to load job company benefits.";
      throw new Error(normalizeJobCompaniesError(message));
    });
    let benefitTagsByCompanyId = mapBenefitTagsByJobCompanyId(benefits);
    const companiesMissingBenefits = activeRows.filter((row) => !benefitTagsByCompanyId.has(row.id));

    if (companiesMissingBenefits.length > 0) {
      await syncAutoBenefitsFromCachedPositions(admin, {
        companyId: membership.companyId,
        jobCompanies: companiesMissingBenefits,
      }).catch((benefitsError) => {
        const message =
          benefitsError instanceof Error
            ? benefitsError.message
            : "Failed to auto-sync job company benefits.";
        throw new Error(normalizeJobCompaniesError(message));
      });

      benefits = await fetchJobCompanyBenefits(
        admin,
        membership.companyId,
        activeRows.map((row) => row.id)
      ).catch((benefitsError) => {
        throw new Error(
          normalizeJobCompaniesError(
            benefitsError instanceof Error
              ? benefitsError.message
              : "Failed to reload job company benefits."
          )
        );
      });
      benefitTagsByCompanyId = mapBenefitTagsByJobCompanyId(benefits);
    }

    const { data: positionRows, error: positionError } = await admin
      .from("breezy_positions")
      .select("breezy_position_id,job_company_id,company,state,org_type,details")
      .eq("company_id", membership.companyId);

    if (positionError) {
      throw new Error(positionError.message ?? "Failed to load company counts");
    }

    const countsById = new Map<string, number>();
    const countsByName = new Map<string, number>();
    const companyIdByNormalizedName = new Map(
      activeRows.map((row) => [row.normalized_name, row.id] as const)
    );
    const companyNameByNormalized = new Map(
      activeRows.map((row) => [row.normalized_name, row.name] as const)
    );
    const resolveJobCompanyIdFromName = (name: unknown) => {
      const normalizedName = normalizeJobCompanyName(name);
      if (!normalizedName) return "";
      const exactId = companyIdByNormalizedName.get(normalizedName);
      if (exactId) return exactId;
      const resolvedName = resolveKnownJobCompanyName(
        typeof name === "string" ? name : "",
        companyNameByNormalized
      );
      return companyIdByNormalizedName.get(normalizeJobCompanyName(resolvedName)) ?? "";
    };
    const positionList = Array.isArray(positionRows)
      ? (positionRows as Array<{
          breezy_position_id: string | null;
          job_company_id: string | null;
          company: string | null;
          state: string | null;
          org_type: string | null;
          details: unknown;
        }>)
      : [];

    for (const row of positionList) {
      if ((row.state ?? "").toLowerCase() !== "published") continue;
      if ((row.org_type ?? "").toLowerCase() === "pool") continue;
      if (row.job_company_id) {
        countsById.set(row.job_company_id, (countsById.get(row.job_company_id) ?? 0) + 1);
        continue;
      }
      const normalizedName = normalizeJobCompanyName(row.company);
      if (!normalizedName) continue;
      countsByName.set(normalizedName, (countsByName.get(normalizedName) ?? 0) + 1);
      const matchedId = resolveJobCompanyIdFromName(row.company);
      if (matchedId) countsById.set(matchedId, (countsById.get(matchedId) ?? 0) + 1);
    }

    const { data: joinRows } = await admin
      .from("job_position_companies")
      .select("job_company_id,breezy_position_id")
      .eq("company_id", membership.companyId);

    const positionCompanyIds = new Map<string, Set<string>>();
    const addPositionCompany = (positionId: string, jobCompanyId: string) => {
      const trimmedPositionId = positionId.trim();
      const trimmedJobCompanyId = jobCompanyId.trim();
      if (!trimmedPositionId || !trimmedJobCompanyId) return;
      const ids = positionCompanyIds.get(trimmedPositionId) ?? new Set<string>();
      ids.add(trimmedJobCompanyId);
      positionCompanyIds.set(trimmedPositionId, ids);
    };
    for (const row of positionList) {
      if ((row.state ?? "").toLowerCase() !== "published") continue;
      if ((row.org_type ?? "").toLowerCase() === "pool") continue;
      addPositionCompany(row.breezy_position_id ?? "", row.job_company_id ?? "");
      if (!row.job_company_id) {
        const matchedId = resolveJobCompanyIdFromName(row.company);
        if (matchedId) addPositionCompany(row.breezy_position_id ?? "", matchedId);
      }
    }
    if (Array.isArray(joinRows)) {
      for (const row of joinRows) {
        addPositionCompany(
          typeof row.breezy_position_id === "string" ? row.breezy_position_id : "",
          typeof row.job_company_id === "string" ? row.job_company_id : ""
        );
      }
    }

    const countryCodesByPosition = new Map<string, string[]>();
    for (const row of positionList) {
      if ((row.state ?? "").toLowerCase() !== "published") continue;
      if ((row.org_type ?? "").toLowerCase() === "pool") continue;
      const positionId = (row.breezy_position_id ?? "").trim();
      if (!positionId) continue;
      const codes = getPositionProcessableCountryCodes(row.details);
      if (codes.length > 0) countryCodesByPosition.set(positionId, codes);
    }

    const { data: countryRows } = await admin
      .from("breezy_position_countries")
      .select("breezy_position_id,country_code,group")
      .eq("company_id", membership.companyId)
      .eq("group", "processable");
    if (Array.isArray(countryRows)) {
      for (const row of countryRows) {
        const positionId =
          typeof row.breezy_position_id === "string" ? row.breezy_position_id.trim() : "";
        const code = typeof row.country_code === "string" ? row.country_code.trim().toUpperCase() : "";
        if (!positionId || !/^[A-Z]{2}$/.test(code)) continue;
        const current = countryCodesByPosition.get(positionId) ?? [];
        if (!current.includes(code)) current.push(code);
        countryCodesByPosition.set(positionId, current);
      }
    }

    const countryCodesByJobCompanyId = new Map<string, string[]>();
    for (const [positionId, countryCodes] of countryCodesByPosition.entries()) {
      const jobCompanyIds = positionCompanyIds.get(positionId);
      if (!jobCompanyIds || jobCompanyIds.size === 0) continue;
      for (const jobCompanyId of jobCompanyIds) {
        const current = countryCodesByJobCompanyId.get(jobCompanyId) ?? [];
        for (const code of countryCodes) {
          if (!current.includes(code)) current.push(code);
        }
        countryCodesByJobCompanyId.set(jobCompanyId, current);
      }
    }

    const publishedPositionIds = new Set(
      positionList
        .filter((row) => (row.state ?? "").toLowerCase() === "published")
        .filter((row) => (row.org_type ?? "").toLowerCase() !== "pool")
        .map((row) => row.breezy_position_id ?? "")
        .filter(Boolean)
    );
    if (Array.isArray(joinRows) && publishedPositionIds.size > 0) {
      countsById.clear();
      for (const row of joinRows) {
        const jobCompanyId =
          typeof row.job_company_id === "string" ? row.job_company_id : "";
        const positionId =
          typeof row.breezy_position_id === "string" ? row.breezy_position_id : "";
        if (!jobCompanyId || !positionId || !publishedPositionIds.has(positionId)) continue;
        countsById.set(jobCompanyId, (countsById.get(jobCompanyId) ?? 0) + 1);
      }
    }

    const { data: mergeRows } = await admin
      .from("job_company_merge_logs")
      .select("id,source_job_company_id,target_job_company_id,source_snapshot,target_snapshot,position_snapshots,copied_benefits,created_at")
      .eq("company_id", membership.companyId)
      .is("undone_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    const recentMerges = Array.isArray(mergeRows)
      ? mergeRows.map((row) => {
          const sourceSnapshot = isRecord(row.source_snapshot) ? row.source_snapshot : {};
          const targetSnapshot = isRecord(row.target_snapshot) ? row.target_snapshot : {};
          const positions = Array.isArray(row.position_snapshots) ? row.position_snapshots : [];
          const benefits = Array.isArray(row.copied_benefits) ? row.copied_benefits : [];
          return {
            id: typeof row.id === "string" ? row.id : "",
            sourceCompanyId:
              typeof row.source_job_company_id === "string" ? row.source_job_company_id : "",
            targetCompanyId:
              typeof row.target_job_company_id === "string" ? row.target_job_company_id : "",
            sourceName:
              typeof sourceSnapshot.name === "string" ? sourceSnapshot.name : "Merged company",
            targetName:
              typeof targetSnapshot.name === "string" ? targetSnapshot.name : "Target company",
            positionsMoved: positions.length,
            benefitsCopied: benefits.length,
            createdAt: typeof row.created_at === "string" ? row.created_at : null,
          };
        })
      : [];

    const benefitOptions = await fetchJobBenefitOptions(admin, membership.companyId).catch(() => []);
    const countryOptions = await fetchJobCountryOptions(admin, membership.companyId).catch(() => []);

    return NextResponse.json(
      {
        companies: activeRows.map((row) => {
          const savedCountryCodes = getJobCompanyCountryCodes(row.metadata);
          return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            website: row.website,
            logoUrl:
              (typeof row.logo_path === "string" && row.logo_path.trim()
                ? logoUrls.get(row.logo_path.trim())
                : null) ?? null,
            shipType: resolveJobShipType({ metadata: row.metadata, name: row.name }),
            shipTypes: resolveJobShipTypes({ metadata: row.metadata, name: row.name }),
            benefitTags: benefitTagsByCompanyId.get(row.id) ?? [],
            countryCodes:
              savedCountryCodes.length > 0
                ? savedCountryCodes
                : countryCodesByJobCompanyId.get(row.id) ?? [],
            positionsCount:
              countsById.get(row.id) ?? countsByName.get(row.normalized_name) ?? 0,
            createdAt: row.created_at ?? null,
            updatedAt: row.updated_at ?? null,
          };
        }),
        recentMerges,
        benefitOptions,
        countryOptions,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const payload = await request.json().catch(() => null);
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    }

    const normalizedName = normalizeJobCompanyName(name);
    const slugBase = slugifyJobCompanyName(name);
    let slug = slugBase;
    let index = 2;
    while (true) {
      const { data: existingSlug, error: slugError } = await admin
        .from("job_companies")
        .select("id")
        .eq("company_id", membership.companyId)
        .eq("slug", slug)
        .maybeSingle();
      if (slugError) throw new Error(slugError.message ?? "Failed to check company slug");
      if (!existingSlug) break;
      slug = `${slugBase}-${index}`;
      index += 1;
    }

    const { data: existing, error: existingError } = await admin
      .from("job_companies")
      .select("id")
      .eq("company_id", membership.companyId)
      .eq("normalized_name", normalizedName)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message ?? "Failed to check company");
    if (existing) {
      return NextResponse.json(
        { error: "This company already exists." },
        { status: 409 }
      );
    }

    const { error: insertError } = await admin.from("job_companies").insert({
      company_id: membership.companyId,
      name,
      normalized_name: normalizedName,
      slug,
      metadata: {},
    });
    if (insertError) throw new Error(insertError.message ?? "Failed to add company");

    clearJobsResponseCache();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
