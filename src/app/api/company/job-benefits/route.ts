import { NextResponse } from "next/server";

import {
  DEFAULT_JOB_BENEFIT_OPTIONS,
  fetchJobBenefitOptions,
  normalizeBenefitOptions,
} from "@/lib/job-benefit-options";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { normalizeBenefitTag } from "@/lib/job-company-benefits";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

export async function GET() {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const benefits = await fetchJobBenefitOptions(admin, membership.companyId);
    return NextResponse.json({ benefits }, { status: 200 });
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
    const options = normalizeBenefitOptions(isRecord(payload) ? payload.benefits : null);
    const nextTags = new Set(options.map((option) => option.tag));
    const previousOptions = await fetchJobBenefitOptions(admin, membership.companyId).catch(
      () => DEFAULT_JOB_BENEFIT_OPTIONS
    );
    const removedTags = previousOptions
      .map((option) => normalizeBenefitTag(option.tag))
      .filter((tag) => tag && !nextTags.has(tag));

    const { error: upsertError } = await admin.from("job_benefit_options").upsert(
      options.map((option, index) => ({
        company_id: membership.companyId,
        tag: option.tag,
        label: option.label,
        sort_order: index,
        enabled: true,
      })),
      { onConflict: "company_id,tag" }
    );
    if (upsertError) {
      throw new Error(
        upsertError.message ??
          "Failed to save benefit options. Run `supabase/job_benefit_options.sql` first."
      );
    }

    if (removedTags.length > 0) {
      const { error: disableError } = await admin
        .from("job_benefit_options")
        .update({ enabled: false })
        .eq("company_id", membership.companyId)
        .in("tag", removedTags);
      if (disableError) throw new Error(disableError.message ?? "Failed to remove benefit options");

      const { error: selectionError } = await admin
        .from("job_company_benefits")
        .delete()
        .eq("company_id", membership.companyId)
        .in("tag", removedTags);
      if (selectionError) {
        throw new Error(selectionError.message ?? "Failed to clear removed benefits");
      }
    }

    clearJobsResponseCache();
    const benefits = await fetchJobBenefitOptions(admin, membership.companyId);
    return NextResponse.json({ benefits }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
