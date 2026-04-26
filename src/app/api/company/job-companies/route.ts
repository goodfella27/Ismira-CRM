import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import {
  fetchJobCompanyBenefits,
  mapBenefitTagsByJobCompanyId,
  syncAutoBenefitsFromCachedPositions,
} from "@/lib/job-company-benefits";
import {
  normalizeJobCompanyName,
  slugifyJobCompanyName,
  signJobCompanyLogoUrls,
  type JobCompanyRow,
} from "@/lib/job-companies";
import { resolveJobShipType } from "@/lib/job-ship-types";
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
          shipType: resolveJobShipType({ metadata: row.metadata, name: row.name }),
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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

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
