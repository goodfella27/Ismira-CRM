import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const payload = await request.json().catch(() => null);
    const sourceCompanyId =
      typeof payload?.sourceCompanyId === "string" ? payload.sourceCompanyId.trim() : "";
    const targetCompanyId =
      typeof payload?.targetCompanyId === "string" ? payload.targetCompanyId.trim() : "";

    if (!sourceCompanyId || !targetCompanyId) {
      return NextResponse.json(
        { error: "Source and target companies are required." },
        { status: 400 }
      );
    }
    if (sourceCompanyId === targetCompanyId) {
      return NextResponse.json(
        { error: "Source and target companies must be different." },
        { status: 400 }
      );
    }

    const { data, error } = await admin.rpc("merge_job_companies", {
      p_company_id: membership.companyId,
      p_source_job_company_id: sourceCompanyId,
      p_target_job_company_id: targetCompanyId,
      p_actor_id: user.id,
    });

    if (error) {
      throw new Error(
        error.message ??
          "Failed to merge job companies. Apply `supabase/job_company_merges.sql` first."
      );
    }

    clearJobsResponseCache();
    return NextResponse.json({ merge: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
