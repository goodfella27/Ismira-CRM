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
      .select("company,org_type,job_company_id,overrides")
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
    const companyNameById = new Map(companies.map((company) => [company.id, company.name]));
    const companyNameByNormalized = new Map(
      companies.map((company) => [company.normalized_name, company.name])
    );

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (normalizePositionType(row.org_type) !== recordType) continue;

      const rawCompany = asString(row.company).trim();
      const company =
        (row.job_company_id ? companyNameById.get(row.job_company_id) : "") ||
        resolveKnownJobCompanyName(rawCompany, companyNameByNormalized) ||
        rawCompany;
      if (normalizedCompanyFilter && normalizeJobCompanyName(company) !== normalizedCompanyFilter) {
        continue;
      }

      const overrides =
        row.overrides && typeof row.overrides === "object" && !Array.isArray(row.overrides)
          ? (row.overrides as Record<string, unknown>)
          : {};
      const priority = normalizePriorityKey(asString(overrides.priority));
      if (!priority) continue;
      counts.set(priority, (counts.get(priority) ?? 0) + 1);
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
