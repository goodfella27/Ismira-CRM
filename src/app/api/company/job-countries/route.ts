import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import {
  DEFAULT_JOB_COUNTRY_OPTIONS,
  fetchJobCountryOptions,
  normalizeCountryCode,
  normalizeCountryOptions,
} from "@/lib/job-country-options";
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
    const countries = await fetchJobCountryOptions(admin, membership.companyId);
    return NextResponse.json({ countries }, { status: 200 });
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
    const options = normalizeCountryOptions(isRecord(payload) ? payload.countries : null);
    const nextCodes = new Set(options.map((option) => option.code));
    const previousOptions = await fetchJobCountryOptions(admin, membership.companyId).catch(
      () => DEFAULT_JOB_COUNTRY_OPTIONS
    );
    const removedCodes = previousOptions
      .map((option) => normalizeCountryCode(option.code))
      .filter((code) => code && !nextCodes.has(code));

    const { error: upsertError } = await admin.from("job_country_options").upsert(
      options.map((option, index) => ({
        company_id: membership.companyId,
        code: option.code,
        name: option.name,
        sort_order: index,
        enabled: true,
      })),
      { onConflict: "company_id,code" }
    );
    if (upsertError) {
      throw new Error(
        upsertError.message ??
          "Failed to save country options. Run `supabase/job_country_options.sql` first."
      );
    }

    if (removedCodes.length > 0) {
      const { error: disableError } = await admin
        .from("job_country_options")
        .update({ enabled: false })
        .eq("company_id", membership.companyId)
        .in("code", removedCodes);
      if (disableError) throw new Error(disableError.message ?? "Failed to remove country options");
    }

    clearJobsResponseCache();
    const countries = await fetchJobCountryOptions(admin, membership.companyId);
    return NextResponse.json({ countries }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

