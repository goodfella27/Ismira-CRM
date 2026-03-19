import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "candidate-documents";

const getPrimaryCompanyId = async (
  admin: ReturnType<typeof createSupabaseAdminClient>
) => {
  const { data, error } = await admin
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load company");
  if (data?.id) return data.id as string;

  const { data: created, error: createError } = await admin
    .from("companies")
    .insert({ name: "Default Company" })
    .select("id")
    .single();
  if (createError || !created?.id) {
    throw new Error(createError?.message ?? "Failed to create company");
  }
  return created.id as string;
};

const isAdmin = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  userId: string
) => {
  const { data, error } = await admin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load member role");
  const role = (data?.role as string | null) ?? null;
  return role ? role.toLowerCase() === "admin" : false;
};

const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);

    const { data: company, error } = await admin
      .from("companies")
      .select("name, branding_title, branding_logo_path")
      .eq("id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message ?? "Failed to load company");

    const title =
      (typeof company?.branding_title === "string" && company.branding_title.trim()) ||
      (typeof company?.name === "string" && company.name.trim()) ||
      "ISMIRA CRM";

    const logoPath =
      typeof company?.branding_logo_path === "string"
        ? company.branding_logo_path
        : null;

    let logoUrl: string | null = null;
    if (logoPath) {
      const { data, error: signError } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(logoPath, 60 * 60 * 24 * 7); // 7 days
      if (!signError) {
        logoUrl = data?.signedUrl ?? null;
      }
    }

    return NextResponse.json(
      { title, logoUrl },
      {
        status: 200,
        headers: {
          // This is safe and avoids spamming the DB on repeated mounts.
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load company branding.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);
    const allowed = await isAdmin(admin, companyId, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const form = await request.formData();
    const titleRaw = form.get("title");
    const file = form.get("logo");
    const removeLogo = form.get("removeLogo");

    const title =
      typeof titleRaw === "string" ? titleRaw.trim().slice(0, 80) : null;

    let nextLogoPath: string | null | undefined = undefined;
    if (removeLogo === "1" || removeLogo === "true") {
      nextLogoPath = null;
    }

    if (file instanceof File) {
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Logo must be an image file." }, { status: 400 });
      }
      if (file.size > 2_000_000) {
        return NextResponse.json(
          { error: "Logo is too large (max 2MB)." },
          { status: 400 }
        );
      }
      const safeName = sanitizeFilename(file.name || "logo");
      const path = `company/${companyId}/logo-${Date.now()}-${safeName}`;

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) {
        return NextResponse.json(
          { error: uploadError.message ?? "Upload failed." },
          { status: 500 }
        );
      }
      nextLogoPath = path;
    }

    const update: Record<string, unknown> = {};
    if (typeof title === "string") update.branding_title = title ? title : null;
    if (nextLogoPath !== undefined) update.branding_logo_path = nextLogoPath;

    if (Object.keys(update).length > 0) {
      const { error: updateError } = await admin
        .from("companies")
        .update(update)
        .eq("id", companyId);
      if (updateError) {
        throw new Error(updateError.message ?? "Failed to update branding");
      }
    }

    // Return fresh data
    const { data: company, error: reloadError } = await admin
      .from("companies")
      .select("name, branding_title, branding_logo_path")
      .eq("id", companyId)
      .maybeSingle();
    if (reloadError) throw new Error(reloadError.message ?? "Failed to reload company");

    const effectiveTitle =
      (typeof company?.branding_title === "string" && company.branding_title.trim()) ||
      (typeof company?.name === "string" && company.name.trim()) ||
      "ISMIRA CRM";

    const logoPath =
      typeof company?.branding_logo_path === "string"
        ? company.branding_logo_path
        : null;

    let logoUrl: string | null = null;
    if (logoPath) {
      const { data } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(logoPath, 60 * 60 * 24 * 7);
      logoUrl = data?.signedUrl ?? null;
    }

    return NextResponse.json({ title: effectiveTitle, logoUrl }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update company branding.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
