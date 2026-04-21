import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { signJobsHeroLogoUrls, type JobsHeroLogoRow } from "@/lib/jobs-hero-logos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "candidate-documents";

const normalizeJobsHeroLogosError = (raw?: string | null) => {
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) return "Hero logos table is not set up yet.";
  if (/schema cache/i.test(message) && /jobs_hero_logos/i.test(message)) {
    return [
      "Hero logos table is not set up yet.",
      "Run `supabase/jobs_hero_logos.sql` in the Supabase SQL editor, then reload the API schema cache (Settings → API → Reload schema) or restart the API.",
    ].join(" ");
  }
  return message;
};

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
  { params }: { params: Promise<{ heroLogoId: string }> }
) {
  try {
    const user = await requireUser();
    const { heroLogoId } = await params;
    const id = (heroLogoId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing heroLogoId" }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: existing, error: existingError } = await admin
      .from("jobs_hero_logos")
      .select("id,label,logo_path,sort_order,company_id,created_at,updated_at")
      .eq("company_id", membership.companyId)
      .eq("id", id)
      .maybeSingle();
    if (existingError) {
      throw new Error(normalizeJobsHeroLogosError(existingError.message ?? "Failed to load hero logo"));
    }
    if (!existing) return NextResponse.json({ error: "Hero logo not found." }, { status: 404 });

    const form = await request.formData();
    const file = form.get("logo");
    const removeLogo = form.get("removeLogo");
    const labelRaw = form.get("label");

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
      const path = `company/${membership.companyId}/jobs-hero-logos/${id}-${Date.now()}-${safeName}`;

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) {
        return NextResponse.json(
          { error: normalizeJobsHeroLogosError(uploadError.message ?? "Failed to upload logo.") },
          { status: 500 }
        );
      }

      nextLogoPath = path;
    }

    const update: Record<string, unknown> = {};
    if (nextLogoPath !== undefined) update.logo_path = nextLogoPath;
    if (typeof labelRaw === "string") update.label = labelRaw.trim().slice(0, 60);

    if (Object.keys(update).length > 0) {
      const { error: updateError } = await admin
        .from("jobs_hero_logos")
        .update(update)
        .eq("company_id", membership.companyId)
        .eq("id", id);
      if (updateError) {
        throw new Error(normalizeJobsHeroLogosError(updateError.message ?? "Failed to update hero logo"));
      }
    }

    const { data: row, error: reloadError } = await admin
      .from("jobs_hero_logos")
      .select("id,company_id,label,logo_path,sort_order,created_at,updated_at")
      .eq("company_id", membership.companyId)
      .eq("id", id)
      .maybeSingle();
    if (reloadError || !row) {
      throw new Error(
        normalizeJobsHeroLogosError(reloadError?.message ?? "Failed to reload hero logo")
      );
    }

    const signed = await signJobsHeroLogoUrls(admin, [row as JobsHeroLogoRow]);
    const logoPath =
      typeof row.logo_path === "string" && row.logo_path.trim() ? row.logo_path.trim() : "";

    return NextResponse.json(
      {
        logo: {
          id: row.id,
          label: (row.label ?? "").trim(),
          logoUrl: logoPath ? signed.get(logoPath) ?? null : null,
          sortOrder: Number.isFinite(row.sort_order) ? row.sort_order : 0,
          createdAt: row.created_at ?? null,
          updatedAt: row.updated_at ?? null,
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
  _request: Request,
  { params }: { params: Promise<{ heroLogoId: string }> }
) {
  try {
    const user = await requireUser();
    const { heroLogoId } = await params;
    const id = (heroLogoId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing heroLogoId" }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { error } = await admin
      .from("jobs_hero_logos")
      .delete()
      .eq("company_id", membership.companyId)
      .eq("id", id);
    if (error) throw new Error(normalizeJobsHeroLogosError(error.message ?? "Failed to delete hero logo"));

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
