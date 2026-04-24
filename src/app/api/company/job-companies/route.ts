import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import {
  fetchJobCompanyBenefits,
  mapBenefitTagsByJobCompanyId,
  syncAutoBenefitsFromCachedPositions,
} from "@/lib/job-company-benefits";
import {
  normalizeJobCompanyName,
  signJobCompanyLogoUrls,
  type JobCompanyRow,
} from "@/lib/job-companies";
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
    const logoUrls = await signJobCompanyLogoUrls(admin, rows);
    let benefits = await fetchJobCompanyBenefits(
      admin,
      membership.companyId,
      rows.map((row) => row.id)
    ).catch((benefitsError) => {
      const message =
        benefitsError instanceof Error ? benefitsError.message : "Failed to load job company benefits.";
      throw new Error(normalizeJobCompaniesError(message));
    });
    let benefitTagsByCompanyId = mapBenefitTagsByJobCompanyId(benefits);
    const companiesMissingBenefits = rows.filter((row) => !benefitTagsByCompanyId.has(row.id));

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
        rows.map((row) => row.id)
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
      .select("job_company_id,company,state,org_type")
      .eq("company_id", membership.companyId);

    if (positionError) {
      throw new Error(positionError.message ?? "Failed to load company counts");
    }

    const countsById = new Map<string, number>();
    const countsByName = new Map<string, number>();
    const positionList = Array.isArray(positionRows)
      ? (positionRows as Array<{
          job_company_id: string | null;
          company: string | null;
          state: string | null;
          org_type: string | null;
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
    }

    return NextResponse.json(
      {
        companies: rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          website: row.website,
          logoUrl:
            (typeof row.logo_path === "string" && row.logo_path.trim()
              ? logoUrls.get(row.logo_path.trim())
              : null) ?? null,
          benefitTags: benefitTagsByCompanyId.get(row.id) ?? [],
          positionsCount:
            countsById.get(row.id) ?? countsByName.get(row.normalized_name) ?? 0,
          createdAt: row.created_at ?? null,
          updatedAt: row.updated_at ?? null,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
