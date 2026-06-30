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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ mergeId: string }> }
) {
  try {
    const user = await requireUser();
    const { mergeId } = await params;
    const id = (mergeId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing mergeId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const { data, error } = await admin.rpc("undo_job_company_merge", {
      p_company_id: membership.companyId,
      p_merge_log_id: id,
      p_actor_id: user.id,
    });

    if (error) {
      throw new Error(
        error.message ??
          "Failed to undo job company merge. Apply `supabase/job_company_merges.sql` first."
      );
    }

    clearJobsResponseCache();
    return NextResponse.json({ undo: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
