import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { canonicalizeCountry } from "@/lib/country";
import { normalizeBenefitTags } from "@/lib/job-company-benefits";
import {
  ensureJobCompaniesByName,
  setPositionJobCompanies,
} from "@/lib/job-companies";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";

export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const companyParam = (searchParams.get("companyId") ?? "").trim();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    let query = admin
      .from("breezy_positions")
      .select("breezy_position_id,name,state,friendly_id,org_type,details")
      .eq("company_id", membership.companyId)
      .order("name", { ascending: true });

    if (companyParam) query = query.eq("breezy_company_id", companyParam);

    const { data, error } = await query;
    if (error) throw new Error(error.message ?? "Failed to load positions.");

    const positions = Array.isArray(data)
      ? data.map((row) => ({
          id: row.breezy_position_id,
          _id: row.breezy_position_id,
          name: row.name,
          state: row.state,
          friendly_id: row.friendly_id,
          org_type: row.org_type,
          ...(typeof row.details === "object" && row.details !== null && !Array.isArray(row.details)
            ? row.details
            : {}),
        }))
      : [];

    return NextResponse.json({ positions, source: "supabase" }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as
      | {
          companyId?: string;
          name?: string;
          description?: string;
          type?: string;
          job_company?: string;
          department?: string;
          location_name?: string;
          org_type?: string;
          hidden?: boolean;
          job_companies?: unknown;
          benefit_tags?: unknown;
          processable_country_codes?: unknown;
        }
      | null;

    const companyId = (payload?.companyId ?? "").trim();
    const name = (payload?.name ?? "").trim();
    const description = (payload?.description ?? "").trim();
    const type = (payload?.type ?? "").trim() || "contract";
    const jobCompany = (payload?.job_company ?? "").trim();
    const jobCompaniesInput = Array.isArray(payload?.job_companies)
      ? payload.job_companies
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];
    const jobCompanyNames = jobCompaniesInput.length > 0 ? jobCompaniesInput : jobCompany ? [jobCompany] : [];
    const department = (payload?.department ?? "").trim();
    const locationName = (payload?.location_name ?? "").trim();
    const orgType = (payload?.org_type ?? "").trim() || "position";
    const hidden = payload?.hidden === true;
    const benefitTags = normalizeBenefitTags(payload?.benefit_tags);
    const countryCodesPayload = payload?.processable_country_codes;
    const processableCountryCodes = Array.isArray(countryCodesPayload)
      ? Array.from(
          new Set(
            countryCodesPayload
              .map((item) => (typeof item === "string" ? item.trim().toUpperCase() : ""))
              .filter((item) => /^[A-Z]{2}$/.test(item))
          )
        )
      : [];

    if (!name) {
      return NextResponse.json({ error: "Missing position name" }, { status: 400 });
    }
    if (!companyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: "Missing position description" }, { status: 400 });
    }

    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const now = new Date().toISOString();
    const localId = `local_${randomUUID().slice(0, 8)}`;
    const state = orgType === "position" && !hidden ? "published" : "draft";
    const jobCompanies = jobCompanyNames.length > 0
      ? await ensureJobCompaniesByName(admin, membership.companyId, jobCompanyNames, {
          breezyCompanyId: companyId,
        })
      : [];
    const jobCompanyRow = jobCompanies[0] ?? null;
    const jobCompanyId = jobCompanyRow?.id ?? null;
    const nationalityCountries = processableCountryCodes.map((code) => ({
      code,
      name: canonicalizeCountry(code) ?? code,
    }));
    const details = {
      id: localId,
      _id: localId,
      name,
      title: name,
      description,
      type,
      state,
      org_type: orgType,
      company: (jobCompanyNames[0] ?? jobCompany) || "",
      companies: jobCompanyNames,
      department,
      location_name: locationName,
      locationName,
      location_label: locationName,
      benefit_tags: benefitTags,
      processable_country_codes: processableCountryCodes,
      nationality_countries: {
        processable: nationalityCountries,
        blocked: [],
        mentioned: [],
        all: nationalityCountries,
      },
    };

    const { error: insertError } = await admin.from("breezy_positions").insert([
      {
        company_id: membership.companyId,
        breezy_company_id: companyId,
        breezy_position_id: localId,
        name,
        state,
        org_type: orgType,
        company: (jobCompanyNames[0] ?? jobCompany) || null,
        department: department || null,
        job_company_id: jobCompanyId,
        details,
        synced_at: now,
        details_synced_at: now,
      },
    ]);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message ?? "Failed to create opening in Supabase" },
        { status: 500 }
      );
    }

    if (jobCompanies.length > 0) {
      await setPositionJobCompanies(admin, {
        companyId: membership.companyId,
        breezyPositionId: localId,
        jobCompanyIds: jobCompanies.map((company) => company.id),
        primaryJobCompanyId: jobCompanyId,
      });
    }

    if (jobCompanyId && benefitTags.length > 0) {
      const metadata =
        jobCompanyRow?.metadata &&
        typeof jobCompanyRow.metadata === "object" &&
        !Array.isArray(jobCompanyRow.metadata)
          ? (jobCompanyRow.metadata as Record<string, unknown>)
          : {};

      await admin
        .from("job_company_benefits")
        .delete()
        .eq("company_id", membership.companyId)
        .eq("job_company_id", jobCompanyId);
      await admin.from("job_company_benefits").insert(
        benefitTags.map((tag, index) => ({
          company_id: membership.companyId,
          job_company_id: jobCompanyId,
          tag,
          sort_order: index,
          enabled: true,
        }))
      );
      await admin
        .from("job_companies")
        .update({
          metadata: { ...metadata, job_company_benefits_manual_override: true },
        })
        .eq("company_id", membership.companyId)
        .eq("id", jobCompanyId);
    }

    if (processableCountryCodes.length > 0) {
      await admin
        .from("breezy_position_countries")
        .delete()
        .eq("company_id", membership.companyId)
        .eq("breezy_company_id", companyId)
        .eq("breezy_position_id", localId);
      await admin.from("breezy_position_countries").insert(
        processableCountryCodes.map((code) => ({
          company_id: membership.companyId,
          breezy_company_id: companyId,
          breezy_position_id: localId,
          country_code: code,
          country_name: canonicalizeCountry(code) ?? code,
          group: "processable",
        }))
      );
    }

    clearJobsResponseCache();

    return NextResponse.json(
      { id: localId, _id: localId, local: true, source: "supabase" },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
