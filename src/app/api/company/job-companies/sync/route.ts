import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { syncAutoBenefitsFromCachedPositions } from "@/lib/job-company-benefits";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import { fetchJobCompaniesByNormalizedName } from "@/lib/job-companies";
import { syncJobCompaniesFromPositions } from "@/lib/job-companies";
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

export async function POST() {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const result = await syncJobCompaniesFromPositions(admin, {
      companyId: membership.companyId,
    });
    const { data: companies } = await admin
      .from("job_companies")
      .select("id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at")
      .eq("company_id", membership.companyId);

    await syncAutoBenefitsFromCachedPositions(admin, {
      companyId: membership.companyId,
      jobCompanies: Array.isArray(companies) ? companies : [],
    });

    clearJobsResponseCache();

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
