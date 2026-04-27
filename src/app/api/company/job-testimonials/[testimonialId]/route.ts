import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import {
  JOB_TESTIMONIALS_SELECT,
  mapJobTestimonialRow,
  normalizeJobTestimonialsError,
  sanitizeJobTestimonialFilename,
  signJobTestimonialImageUrls,
  type JobTestimonialRow,
} from "@/lib/job-testimonials";
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

function parseBoolean(value: FormDataEntryValue | null, fallback: boolean) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ testimonialId: string }> }
) {
  try {
    const user = await requireUser();
    const { testimonialId } = await params;
    const id = (testimonialId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing testimonialId" }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: existing, error: existingError } = await admin
      .from("job_testimonials")
      .select(JOB_TESTIMONIALS_SELECT)
      .eq("company_id", membership.companyId)
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      throw new Error(normalizeJobTestimonialsError(existingError.message));
    }
    if (!existing) {
      return NextResponse.json({ error: "Testimonial not found." }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("image");
    const removeImage = form.get("removeImage");

    let nextImagePath: string | null | undefined = undefined;
    if (removeImage === "1" || removeImage === "true") {
      nextImagePath = null;
    }

    if (file instanceof File) {
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Photo must be an image file." }, { status: 400 });
      }
      if (file.size > 2_000_000) {
        return NextResponse.json({ error: "Photo is too large (max 2MB)." }, { status: 400 });
      }

      const safeName = sanitizeJobTestimonialFilename(file.name || "testimonial");
      const path = `company/${membership.companyId}/job-testimonials/${id}-${Date.now()}-${safeName}`;

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) {
        return NextResponse.json(
          { error: uploadError.message ?? "Failed to upload photo." },
          { status: 500 }
        );
      }

      nextImagePath = path;
    }

    const update: Record<string, unknown> = {};
    const name = form.get("name");
    const role = form.get("role");
    const country = form.get("country");
    const quote = form.get("quote");
    const sortOrder = form.get("sortOrder");

    if (typeof name === "string") update.name = name.trim().slice(0, 90);
    if (typeof role === "string") update.role = role.trim().slice(0, 120);
    if (typeof country === "string") update.country = country.trim().slice(0, 80);
    if (typeof quote === "string") update.quote = quote.trim().slice(0, 500);
    if (typeof sortOrder === "string") {
      const nextSortOrder = Number.parseInt(sortOrder, 10);
      if (Number.isFinite(nextSortOrder)) update.sort_order = nextSortOrder;
    }
    update.is_active = parseBoolean(form.get("isActive"), existing.is_active !== false);
    if (nextImagePath !== undefined) update.image_path = nextImagePath;

    const { error: updateError } = await admin
      .from("job_testimonials")
      .update(update)
      .eq("company_id", membership.companyId)
      .eq("id", id);

    if (updateError) {
      throw new Error(normalizeJobTestimonialsError(updateError.message));
    }

    const { data: row, error: reloadError } = await admin
      .from("job_testimonials")
      .select(JOB_TESTIMONIALS_SELECT)
      .eq("company_id", membership.companyId)
      .eq("id", id)
      .maybeSingle();

    if (reloadError || !row) {
      throw new Error(normalizeJobTestimonialsError(reloadError?.message ?? "Failed to reload testimonial."));
    }

    const signed = await signJobTestimonialImageUrls(admin, [row as JobTestimonialRow]);

    return NextResponse.json(
      {
        testimonial: mapJobTestimonialRow(row as JobTestimonialRow, signed),
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
  { params }: { params: Promise<{ testimonialId: string }> }
) {
  try {
    const user = await requireUser();
    const { testimonialId } = await params;
    const id = (testimonialId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing testimonialId" }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { error } = await admin
      .from("job_testimonials")
      .delete()
      .eq("company_id", membership.companyId)
      .eq("id", id);

    if (error) throw new Error(normalizeJobTestimonialsError(error.message));

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
