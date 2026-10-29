import { NextResponse } from "next/server";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { normalizeJobCompanyName } from "@/lib/job-companies";
import { COMPANY_WEBSITE_VISIBILITY_KEY } from "@/lib/job-company-website-visibility";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobCompanyId: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (typeof body?.showAllOnIsmiraWeb !== "boolean") {
      return NextResponse.json({ error: "showAllOnIsmiraWeb must be a boolean." }, { status: 400 });
    }
    const { jobCompanyId } = await params;
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, data.user.id);
    const { data: companies, error: loadError } = await admin.from("job_companies")
      .select("id,name,normalized_name,metadata")
      .eq("company_id", membership.companyId);
    if (loadError) throw new Error(loadError.message);
    const rows = (companies ?? []).filter(row => !row.metadata?.merged_into_job_company_id);
    const selected = rows.find(row => row.id === jobCompanyId);
    if (!selected) return NextResponse.json({ error: "Job company not found." }, { status: 404 });
    const groupKey = (row: typeof selected) => normalizeJobCompanyName(row.name) || row.normalized_name || row.id;
    const group = rows.filter(row => groupKey(row) === groupKey(selected));
    // Keep each grouped row's other metadata and every JD override intact.
    try {
      for (const row of group) {
        const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? row.metadata : {};
        const { error: saveError } = await admin.from("job_companies")
          .update({ metadata: { ...metadata, [COMPANY_WEBSITE_VISIBILITY_KEY]: body.showAllOnIsmiraWeb } })
          .eq("company_id", membership.companyId).eq("id", row.id);
        if (saveError) throw new Error(saveError.message);
      }
    } finally {
      // Invalidate even if a grouped update only partially succeeded.
      clearJobsResponseCache();
    }
    return NextResponse.json({ showAllOnIsmiraWeb: body.showAllOnIsmiraWeb });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save website visibility." }, { status: 500 });
  }
}
