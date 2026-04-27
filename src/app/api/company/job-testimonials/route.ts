import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import {
  JOB_TESTIMONIALS_SELECT,
  mapJobTestimonialRow,
  normalizeJobTestimonialsError,
  signJobTestimonialImageUrls,
  type JobTestimonialRow,
} from "@/lib/job-testimonials";
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

export async function GET() {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const { data, error } = await admin
      .from("job_testimonials")
      .select(JOB_TESTIMONIALS_SELECT)
      .eq("company_id", membership.companyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(normalizeJobTestimonialsError(error.message));
    }

    const rows = Array.isArray(data) ? (data as JobTestimonialRow[]) : [];
    const signed = await signJobTestimonialImageUrls(admin, rows);

    return NextResponse.json(
      {
        testimonials: rows.map((row) => mapJobTestimonialRow(row, signed)),
      },
      { status: 200 }
    );
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
    const name = typeof payload?.name === "string" ? payload.name.trim().slice(0, 90) : "";
    const role = typeof payload?.role === "string" ? payload.role.trim().slice(0, 120) : "";
    const country = typeof payload?.country === "string" ? payload.country.trim().slice(0, 80) : "";
    const quote = typeof payload?.quote === "string" ? payload.quote.trim().slice(0, 500) : "";

    const { data: existing, error: existingError } = await admin
      .from("job_testimonials")
      .select("sort_order")
      .eq("company_id", membership.companyId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(normalizeJobTestimonialsError(existingError.message));
    }

    const prevOrder =
      typeof existing?.sort_order === "number" && Number.isFinite(existing.sort_order)
        ? existing.sort_order
        : null;
    const nextOrder = prevOrder !== null ? prevOrder + 1 : 0;

    const { data: created, error: createError } = await admin
      .from("job_testimonials")
      .insert({
        company_id: membership.companyId,
        name,
        role,
        country,
        quote,
        is_active: true,
        sort_order: nextOrder,
      })
      .select(JOB_TESTIMONIALS_SELECT)
      .single();

    if (createError || !created) {
      throw new Error(normalizeJobTestimonialsError(createError?.message ?? "Failed to create testimonial."));
    }

    const signed = await signJobTestimonialImageUrls(admin, [created as JobTestimonialRow]);

    return NextResponse.json(
      {
        testimonial: mapJobTestimonialRow(created as JobTestimonialRow, signed),
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
