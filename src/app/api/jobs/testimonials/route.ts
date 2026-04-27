import { NextResponse } from "next/server";

import { getPrimaryCompanyId } from "@/lib/company/primary";
import {
  JOB_TESTIMONIALS_SELECT,
  mapJobTestimonialRow,
  normalizeJobTestimonialsError,
  signJobTestimonialImageUrls,
  type JobTestimonialRow,
} from "@/lib/job-testimonials";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);

    const { data, error } = await admin
      .from("job_testimonials")
      .select(JOB_TESTIMONIALS_SELECT)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(normalizeJobTestimonialsError(error.message));
    }

    const rows = Array.isArray(data) ? (data as JobTestimonialRow[]) : [];
    const signed = await signJobTestimonialImageUrls(admin, rows);

    return NextResponse.json(
      {
        testimonials: rows
          .map((row) => mapJobTestimonialRow(row, signed))
          .filter((item) => item.quote && item.name),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
