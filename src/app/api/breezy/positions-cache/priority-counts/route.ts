import { buildJobCompanyNameMaps } from "@/lib/job-company-name-maps";
import { NextResponse } from "next/server";

import { requireBreezyCompanyId } from "@/lib/breezy";
import { normalizePriorityKey } from "@/lib/breezy-priority-types";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normalizeJobCompanyName,
  resolveActiveJobCompanies,
  resolveKnownJobCompanyName,
  type JobCompanyRow,
} from "@/lib/job-companies";
import {
  getPositionOpeningTypeOverride,
  resolveOpeningType,
} from "@/lib/job-company-opening-types";

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
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

function normalizePositionType(value: string | null) {
  return (value || "position").trim().toLowerCase() === "pool" ? "pool" : "position";
}

export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const recordTypeRaw = (searchParams.get("recordType") ?? "position").trim().toLowerCase();
    const recordType = recordTypeRaw === "pool" ? "pool" : "position";
    const jobCompanyFilter = (searchParams.get("jobCompany") ?? "").trim();
    const normalizedCompanyFilter = normalizeJobCompanyName(jobCompanyFilter);

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);

    const { data, error } = await admin
      .from("breezy_positions")
      .select("breezy_position_id,company,org_type,job_company_id,overrides")
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId);

    if (error) {
      if (isMissingPositionsTableError(error.message ?? "")) {
        return NextResponse.json(
          {
            priorities: [],
            warning:
              "Database table `breezy_positions` is not set up. Apply `supabase/breezy_positions.sql` and run Sync to enable opening type counts.",
          },
          { status: 200 }
        );
      }
      throw new Error(error.message ?? "Failed to load opening type counts");
    }

    type Row = {
      breezy_position_id?: string | null;
      company: string | null;
      org_type: string | null;
      job_company_id: string | null;
      overrides: unknown;
    };
    const rows = Array.isArray(data) ? (data as unknown as Row[]) : [];

    const { data: companyRows } = await admin
      .from("job_companies")
      .select("id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at")
      .eq("company_id", companyId);
    const companies = await resolveActiveJobCompanies(
      admin,
      companyId,
      Array.isArray(companyRows) ? (companyRows as JobCompanyRow[]) : []
    );
    const { companyNameById, companyNameByNormalized } = buildJobCompanyNameMaps([
      ...(Array.isArray(companyRows) ? (companyRows as JobCompanyRow[]) : []),
      ...companies,
    ]);
    const companyById = new Map(companies.map((company) => [company.id, company] as const));
    const companyByNormalized = new Map(
      companies.map((company) => [company.normalized_name, company] as const)
    );
    const { data: joinRows } = await admin
      .from("job_position_companies")
      .select("breezy_position_id,job_company_id,is_primary")
      .eq("company_id", companyId);
    const joinsByPosition = new Map<string, string[]>();
    if (Array.isArray(joinRows)) {
      for (const row of joinRows as Array<{
        breezy_position_id: string | null;
        job_company_id: string | null;
        is_primary: boolean | null;
      }>) {
        const positionId = (row.breezy_position_id ?? "").trim();
        const jobCompanyId = (row.job_company_id ?? "").trim();
        if (!positionId || !jobCompanyId || !companyById.has(jobCompanyId)) continue;
        const current = joinsByPosition.get(positionId) ?? [];
        current.push(jobCompanyId);
        joinsByPosition.set(positionId, current);
      }
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (normalizePositionType(row.org_type) !== recordType) continue;

      const rawCompany = asString(row.company).trim();
      const positionId = (row.breezy_position_id ?? "").trim();
      const joinedCompanyIds = positionId ? joinsByPosition.get(positionId) ?? [] : [];
      const fallbackCompany =
        (row.job_company_id ? companyById.get(row.job_company_id) : undefined) ??
        companyByNormalized.get(normalizeJobCompanyName(resolveKnownJobCompanyName(rawCompany, companyNameByNormalized) || rawCompany));
      const candidateCompanies =
        joinedCompanyIds.length > 0
          ? joinedCompanyIds.map((id) => companyById.get(id)).filter((item): item is JobCompanyRow => Boolean(item))
          : fallbackCompany
            ? [fallbackCompany]
            : [];
      const fallbackCompanyName =
        fallbackCompany?.name ||
        (row.job_company_id ? companyNameById.get(row.job_company_id) : "") ||
        resolveKnownJobCompanyName(rawCompany, companyNameByNormalized) ||
        rawCompany;

      const overrides =
        row.overrides && typeof row.overrides === "object" && !Array.isArray(row.overrides)
          ? (row.overrides as Record<string, unknown>)
          : {};
      const priorityOverride = getPositionOpeningTypeOverride(overrides);
      const countForCompany = (company: JobCompanyRow | null, companyName: string) => {
        if (
          normalizedCompanyFilter &&
          normalizeJobCompanyName(company?.name || companyName) !== normalizedCompanyFilter
        ) {
          return;
        }
        const priority = normalizePriorityKey(
          resolveOpeningType({ metadata: company?.metadata, override: priorityOverride })
        );
        if (!priority) return;
        counts.set(priority, (counts.get(priority) ?? 0) + 1);
      };

      if (candidateCompanies.length > 0) {
        candidateCompanies.forEach((company) => countForCompany(company, company.name));
      } else {
        countForCompany(null, fallbackCompanyName);
      }
    }

    const priorities = Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.key.localeCompare(b.key, undefined, { sensitivity: "base" });
      });

    return NextResponse.json({ priorities }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
