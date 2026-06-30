import { NextResponse } from "next/server";

import { resolveUserAccess } from "@/lib/auth/access";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import {
  hasJobPremiumDetails,
  normalizeJobPremiumDetails,
} from "@/lib/job-premium-details";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const isMissingPremiumSchemaError = (message: string) =>
  /job_premium_details|position_compensation_type|contract_length|stripes|cabin_type|salary_note|schema cache|does not exist|could not find/i.test(
    message
  );

export async function GET(
  _request: Request,
  context: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await context.params;
    const id = positionId.trim();
    if (!id) return NextResponse.json({ error: "Missing positionId" }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);
    const { data: row, error } = await admin
      .from("job_premium_details")
      .select(
        "salary_text,tips_text,position_compensation_type,contract_length,stripes,cabin_type,salary_note,additional_info,enabled"
      )
      .eq("company_id", companyId)
      .eq("breezy_position_id", id)
      .maybeSingle();
    if (error && isMissingPremiumSchemaError(error.message ?? "")) {
      return NextResponse.json(
        { available: false, canView: false, access: "visitor", details: null },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } }
      );
    }
    if (error) throw new Error(error.message ?? "Failed to load premium details");

    const details = normalizeJobPremiumDetails(row);
    const available = row?.enabled !== false && hasJobPremiumDetails(details);
    const supabase = await createSupabaseServerClient();
    const { data: authData } = await supabase.auth.getUser();
    const access = authData.user
      ? await resolveUserAccess(admin, authData.user.id)
      : null;

    const response = access?.canViewPrivateFields && available
      ? {
          available: true,
          canView: true,
          access: access.isAdmin ? "admin" : access.accessLevel,
          details,
        }
      : {
          available,
          canView: false,
          access: access ? access.accessLevel : "visitor",
          details: null,
        };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }
}
