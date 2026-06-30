import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { fetchJobCompanyBenefits, mapBenefitTagsByJobCompanyId, normalizeBenefitTags } from "@/lib/job-company-benefits";
import { normalizeBenefitOptions } from "@/lib/job-benefit-options";
import { normalizeCountryCode } from "@/lib/job-country-options";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import { signJobCompanyLogoUrls, type JobCompanyRow } from "@/lib/job-companies";
import { normalizeJobShipTypes, resolveJobShipType, resolveJobShipTypes } from "@/lib/job-ship-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "candidate-documents";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

function getMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeCountryCodeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((code) => normalizeCountryCode(code)).filter(Boolean))];
}

function getJobCompanyCountryCodes(metadata: unknown) {
  const record = getMetadata(metadata);
  return normalizeCountryCodeList(record.job_company_country_codes);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobCompanyId: string }> }
) {
  try {
    const user = await requireUser();
    const { jobCompanyId } = await params;
    const id = (jobCompanyId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing jobCompanyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const { data: existing, error: existingError } = await admin
      .from("job_companies")
      .select("id,name,logo_path,metadata")
      .eq("company_id", membership.companyId)
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message ?? "Failed to load job company");
    }
    if (!existing) {
      return NextResponse.json({ error: "Job company not found." }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("logo");
    const removeLogo = form.get("removeLogo");
    const websiteRaw = form.get("website");
    const nameRaw = form.get("name");
    const benefitTagsRaw = form.get("benefitTags");
    const benefitOptionsRaw = form.get("benefitOptions");
    const countryCodesRaw = form.get("countryCodes");
    const shipTypeRaw = form.get("shipType");
    const shipTypesRaw = form.get("shipTypes");

    let nextLogoPath: string | null | undefined = undefined;
    if (removeLogo === "1" || removeLogo === "true") {
      nextLogoPath = null;
    }

    if (file instanceof File) {
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Logo must be an image file." }, { status: 400 });
      }
      if (file.size > 2_000_000) {
        return NextResponse.json({ error: "Logo is too large (max 2MB)." }, { status: 400 });
      }

      const safeName = sanitizeFilename(file.name || "logo");
      const path = `job-companies/${membership.companyId}/${id}-${Date.now()}-${safeName}`;

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) {
        return NextResponse.json(
          { error: uploadError.message ?? "Failed to upload logo." },
          { status: 500 }
        );
      }

      nextLogoPath = path;
    }

    const update: Record<string, unknown> = {};
    if (nextLogoPath !== undefined) update.logo_path = nextLogoPath;
    if (typeof nameRaw === "string") {
      const name = nameRaw.trim();
      if (!name) {
        return NextResponse.json({ error: "Company name is required." }, { status: 400 });
      }
      update.name = name;
    }
    if (typeof benefitTagsRaw === "string") {
      const metadata = getMetadata(existing.metadata);
      metadata.job_company_benefits_manual_override = true;
      update.metadata = metadata;
    }
    if (typeof countryCodesRaw === "string") {
      const metadata =
        update.metadata && typeof update.metadata === "object" && !Array.isArray(update.metadata)
          ? { ...(update.metadata as Record<string, unknown>) }
          : getMetadata(existing.metadata);
      const countryCodes = normalizeCountryCodeList(JSON.parse(countryCodesRaw) as unknown);
      if (countryCodes.length > 0) metadata.job_company_country_codes = countryCodes;
      else delete metadata.job_company_country_codes;
      update.metadata = metadata;
    }
    if (typeof shipTypesRaw === "string" || typeof shipTypeRaw === "string") {
      const metadata =
        (update.metadata && typeof update.metadata === "object" && !Array.isArray(update.metadata)
          ? { ...(update.metadata as Record<string, unknown>) }
          : getMetadata(existing.metadata));
      const shipTypes = normalizeJobShipTypes(
        typeof shipTypesRaw === "string" ? shipTypesRaw : shipTypeRaw
      );
      if (shipTypes.length > 0) {
        metadata.ship_types = shipTypes;
        metadata.ship_type = shipTypes[0];
      } else {
        delete metadata.ship_types;
        delete metadata.ship_type;
      }
      update.metadata = metadata;
    }
    if (typeof websiteRaw === "string") {
      const website = websiteRaw.trim();
      update.website = website || null;
    }

    if (Object.keys(update).length > 0) {
      const { error: updateError } = await admin
        .from("job_companies")
        .update(update)
        .eq("company_id", membership.companyId)
        .eq("id", id);
      if (updateError) throw new Error(updateError.message ?? "Failed to update job company");
    }

    if (typeof benefitOptionsRaw === "string") {
      const options = normalizeBenefitOptions(JSON.parse(benefitOptionsRaw) as unknown);
      const { error: optionsError } = await admin.from("job_benefit_options").upsert(
        options.map((option, index) => ({
          company_id: membership.companyId,
          tag: option.tag,
          label: option.label,
          sort_order: index,
          enabled: true,
        })),
        { onConflict: "company_id,tag" }
      );
      if (optionsError) {
        throw new Error(
          optionsError.message ??
            "Failed to save benefit options. Run `supabase/job_benefit_options.sql` first."
        );
      }
    }

    if (typeof benefitTagsRaw === "string") {
      const parsed = JSON.parse(benefitTagsRaw) as unknown;
      const tags = normalizeBenefitTags(parsed);
      const { error: deleteError } = await admin
        .from("job_company_benefits")
        .delete()
        .eq("company_id", membership.companyId)
        .eq("job_company_id", id);
      if (deleteError) {
        throw new Error(deleteError.message ?? "Failed to clear job company benefits");
      }

      if (tags.length > 0) {
        const { error: insertError } = await admin.from("job_company_benefits").insert(
          tags.map((tag, index) => ({
            company_id: membership.companyId,
            job_company_id: id,
            tag,
            sort_order: index,
            enabled: true,
          }))
        );
        if (insertError) {
          throw new Error(insertError.message ?? "Failed to update job company benefits");
        }
      }
    }

    clearJobsResponseCache();

    const savedBenefits = await fetchJobCompanyBenefits(admin, membership.companyId, [id]).catch(() => []);
    const benefitTagsByCompanyId = mapBenefitTagsByJobCompanyId(savedBenefits);

    const { data: company, error: companyError } = await admin
      .from("job_companies")
      .select("id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at")
      .eq("company_id", membership.companyId)
      .eq("id", id)
      .maybeSingle();

    if (companyError || !company) {
      throw new Error(companyError?.message ?? "Failed to reload job company");
    }

    const [signedUrls] = await Promise.all([
      signJobCompanyLogoUrls(admin, [company as JobCompanyRow]),
    ]);

    const logoPath =
      typeof company.logo_path === "string" && company.logo_path.trim()
        ? company.logo_path.trim()
        : "";

    return NextResponse.json(
      {
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          website: company.website,
          shipType: resolveJobShipType({ metadata: company.metadata, name: company.name }),
          shipTypes: resolveJobShipTypes({ metadata: company.metadata, name: company.name }),
          benefitTags: benefitTagsByCompanyId.get(company.id) ?? [],
          countryCodes: getJobCompanyCountryCodes(company.metadata),
          logoUrl: logoPath ? signedUrls.get(logoPath) ?? null : null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobCompanyId: string }> }
) {
  try {
    const user = await requireUser();
    const { jobCompanyId } = await params;
    const id = (jobCompanyId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing jobCompanyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const { data: existing, error: existingError } = await admin
      .from("job_companies")
      .select("id")
      .eq("company_id", membership.companyId)
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message ?? "Failed to load job company");
    if (!existing) {
      return NextResponse.json({ error: "Job company not found." }, { status: 404 });
    }

    const { error: deleteError } = await admin
      .from("job_companies")
      .delete()
      .eq("company_id", membership.companyId)
      .eq("id", id);
    if (deleteError) throw new Error(deleteError.message ?? "Failed to delete job company");

    clearJobsResponseCache();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
