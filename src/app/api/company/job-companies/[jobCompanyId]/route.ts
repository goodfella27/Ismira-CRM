import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { signJobCompanyLogoUrls, type JobCompanyRow } from "@/lib/job-companies";
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
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: existing, error: existingError } = await admin
      .from("job_companies")
      .select("id,name,logo_path")
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

