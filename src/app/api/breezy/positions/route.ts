import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";
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
    const { searchParams } = new URL(request.url);
    const companyParam = (searchParams.get("companyId") ?? "").trim();
    const companyId = companyParam || requireBreezyCompanyId().companyId;

    const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(companyId)}/positions`;

    const res = await breezyFetch(url);
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "Breezy request failed",
          status: res.status,
          details: body,
        },
        { status: res.status }
      );
    }

    return NextResponse.json(body, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
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

    const companyParam = (payload?.companyId ?? "").trim();
    const companyId = companyParam || requireBreezyCompanyId().companyId;
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
    if (!description) {
      return NextResponse.json({ error: "Missing position description" }, { status: 400 });
    }

    const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(companyId)}/positions`;
    const body: Record<string, unknown> = { name, description, type };
    if (department) {
      body.department = department;
    }

    const res = await breezyFetch(url, { method: "POST", body: JSON.stringify(body) });
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const resBody = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      if (res.status === 403) {
        const user = await requireUser();
        const admin = createSupabaseAdminClient();
        const membership = await ensureCompanyMembership(admin, user.id);
        if (membership.role.toLowerCase() !== "admin") {
          return NextResponse.json({ error: "Not authorized." }, { status: 403 });
        }

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
          name,
          description,
          type,
          state,
          org_type: orgType,
          company: jobCompany,
          department,
          location_name: locationName,
          benefit_tags: benefitTags,
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
            { error: insertError.message ?? "Failed to create local opening" },
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
          {
            id: localId,
            local: true,
            warning:
              "Breezy rejected position creation with 403, so the opening was created locally.",
            breezy: {
              status: res.status,
              details: resBody,
            },
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          error: "Breezy request failed",
          status: res.status,
          details: resBody,
        },
        { status: res.status }
      );
    }

    try {
      const user = await requireUser();
      const admin = createSupabaseAdminClient();
      const membership = await ensureCompanyMembership(admin, user.id);
      const record = typeof resBody === "object" && resBody !== null
        ? (resBody as Record<string, unknown>)
        : {};
      const createdId =
        (typeof record.id === "string" && record.id.trim()) ||
        (typeof record._id === "string" && record._id.trim()) ||
        "";
      if (createdId) {
        const jobCompanies = jobCompanyNames.length > 0
          ? await ensureJobCompaniesByName(admin, membership.companyId, jobCompanyNames, {
              breezyCompanyId: companyId,
            })
          : [];
        const primaryJobCompany = jobCompanies[0] ?? null;
        const now = new Date().toISOString();
        const details = {
          ...record,
          company: (jobCompanyNames[0] ?? jobCompany) || record.company,
          department: department || record.department,
          location_name: locationName || record.location_name,
          org_type: orgType,
          benefit_tags: benefitTags,
        };

        await admin.from("breezy_positions").upsert(
          [
            {
              company_id: membership.companyId,
              breezy_company_id: companyId,
              breezy_position_id: createdId,
              name,
              state: typeof record.state === "string" ? record.state : "published",
              org_type: orgType,
              company: (jobCompanyNames[0] ?? jobCompany) || null,
              department: department || null,
              job_company_id: primaryJobCompany?.id ?? null,
              details,
              synced_at: now,
              details_synced_at: now,
            },
          ],
          { onConflict: "company_id,breezy_position_id", defaultToNull: false }
        );

        if (jobCompanies.length > 0) {
          await setPositionJobCompanies(admin, {
            companyId: membership.companyId,
            breezyPositionId: createdId,
            jobCompanyIds: jobCompanies.map((company) => company.id),
            primaryJobCompanyId: primaryJobCompany?.id ?? null,
          });
        }
      }
    } catch {
      // Best effort: Breezy creation succeeded, so do not fail the request if local cache linking fails.
    }

    clearJobsResponseCache();

    return NextResponse.json(resBody, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
