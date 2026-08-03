import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
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

function uniqueStrings(rows: Array<{ breezy_company_id: string | null }>) {
  return Array.from(
    new Set(
      rows
        .map((row) => (row.breezy_company_id ?? "").trim())
        .filter(Boolean)
    )
  );
}

export async function GET() {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const { data: positionRows, error: positionError } = await admin
      .from("breezy_positions")
      .select("breezy_company_id")
      .eq("company_id", membership.companyId);
    if (positionError) throw new Error(positionError.message ?? "Failed to load position groups.");

    let ids = uniqueStrings(
      Array.isArray(positionRows)
        ? (positionRows as Array<{ breezy_company_id: string | null }>)
        : []
    );

    if (ids.length === 0) {
      const { data: companyRows } = await admin
        .from("job_companies")
        .select("breezy_company_id")
        .eq("company_id", membership.companyId);
      ids = uniqueStrings(
        Array.isArray(companyRows)
          ? (companyRows as Array<{ breezy_company_id: string | null }>)
          : []
      );
    }

    const companies = ids.map((id, index) => ({
      id,
      _id: id,
      name: index === 0 ? "Supabase jobs" : `Supabase jobs ${index + 1}`,
    }));

    return NextResponse.json({ companies, source: "supabase" }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
