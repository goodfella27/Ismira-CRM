import { NextResponse } from "next/server";

import { requireBreezyCompanyId } from "@/lib/breezy";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

const isMissingPositionsTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_positions/i.test(message);

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

function getBreezyCompanyIdFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyParam = (searchParams.get("companyId") ?? "").trim();
  if (companyParam) return companyParam;
  try {
    return requireBreezyCompanyId().companyId;
  } catch {
    return "";
  }
}

function normalizePositionType(value: string | null) {
  return (value || "position").trim().toLowerCase() === "pool" ? "pool" : "position";
}

export async function GET(request: Request) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const recordTypeRaw = (searchParams.get("recordType") ?? "position").trim().toLowerCase();
    const recordType = recordTypeRaw === "pool" ? "pool" : "position";

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);

    const { data, error } = await admin
      .from("breezy_positions")
      .select("company,org_type")
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId);

    if (error) {
      if (isMissingPositionsTableError(error.message ?? "")) {
        return NextResponse.json(
          {
            companies: [],
            warning:
              "Database table `breezy_positions` is not set up. Apply `supabase/breezy_positions.sql` and run Sync to enable company counts.",
          },
          { status: 200 }
        );
      }
      throw new Error(error.message ?? "Failed to load company counts");
    }

    type Row = { company: string | null; org_type: string | null };
    const rows = Array.isArray(data) ? (data as unknown as Row[]) : [];

    const counts = new Map<string, number>();
    for (const row of rows) {
      const company = asString(row.company).trim();
      if (!company) continue;
      if (normalizePositionType(row.org_type) !== recordType) continue;
      counts.set(company, (counts.get(company) ?? 0) + 1);
    }

    const companies = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

    return NextResponse.json({ companies }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

