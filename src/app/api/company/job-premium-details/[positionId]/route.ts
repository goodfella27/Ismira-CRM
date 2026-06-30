import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import {
  EMPTY_JOB_PREMIUM_DETAILS,
  hasJobPremiumDetails,
  normalizeJobPremiumDetails,
} from "@/lib/job-premium-details";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const isMissingPremiumSchemaError = (message: string) =>
  /job_premium_details|position_compensation_type|contract_length|stripes|cabin_type|salary_note|schema cache|does not exist|could not find/i.test(
    message
  );

async function requireEditor() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated.");
  const admin = createSupabaseAdminClient();
  const membership = await ensureCompanyMembership(admin, data.user.id);
  return { admin, membership, userId: data.user.id };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await context.params;
    const id = positionId.trim();
    if (!id) return NextResponse.json({ error: "Missing positionId" }, { status: 400 });
    const { admin, membership } = await requireEditor();
    const { data, error } = await admin
      .from("job_premium_details")
      .select(
        "salary_text,tips_text,position_compensation_type,contract_length,stripes,cabin_type,salary_note,additional_info"
      )
      .eq("company_id", membership.companyId)
      .eq("breezy_position_id", id)
      .maybeSingle();
    if (error && !isMissingPremiumSchemaError(error.message ?? "")) {
      throw new Error(error.message ?? "Failed to load premium details");
    }
    return NextResponse.json({
      details: data ? normalizeJobPremiumDetails(data) : EMPTY_JOB_PREMIUM_DETAILS,
      configured: !error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message)
      ? 401
      : /editor access/i.test(message)
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await context.params;
    const id = positionId.trim();
    if (!id) return NextResponse.json({ error: "Missing positionId" }, { status: 400 });
    const { admin, membership, userId } = await requireEditor();
    const payload = await request.json().catch(() => null);
    const details = normalizeJobPremiumDetails(payload);

    if (details.salaryText && !details.salaryNote) {
      return NextResponse.json(
        { error: 'Salary note is required, for example "Paid while on board".' },
        { status: 400 }
      );
    }

    if (!hasJobPremiumDetails(details)) {
      const { error } = await admin
        .from("job_premium_details")
        .delete()
        .eq("company_id", membership.companyId)
        .eq("breezy_position_id", id);
      if (error) {
        throw new Error(
          isMissingPremiumSchemaError(error.message ?? "")
            ? "Protected details storage is not configured yet. Apply the latest Supabase migration."
            : error.message ?? "Failed to clear premium details"
        );
      }
    } else {
      const { error } = await admin.from("job_premium_details").upsert(
        {
          company_id: membership.companyId,
          breezy_position_id: id,
          salary_text: details.salaryText || null,
          tips_text: details.tipsText || null,
          position_compensation_type: details.positionCompensationType || null,
          contract_length: details.contractLength || null,
          stripes: details.stripes || null,
          cabin_type: details.cabinType || null,
          salary_note: details.salaryNote || null,
          additional_info: details.additionalInfo || null,
          enabled: true,
          updated_by: userId,
        },
        { onConflict: "company_id,breezy_position_id" }
      );
      if (error) {
        throw new Error(
          isMissingPremiumSchemaError(error.message ?? "")
            ? "Protected details storage is not configured yet. Apply the latest Supabase migration."
            : error.message ?? "Failed to save premium details"
        );
      }
    }

    clearJobsResponseCache();
    return NextResponse.json({ details });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message)
      ? 401
      : /editor access/i.test(message)
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
