import { NextResponse } from "next/server";

import { getPrimaryCompanyId } from "@/lib/company/primary";
import { signJobsHeroLogoUrls, type JobsHeroLogoRow } from "@/lib/jobs-hero-logos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const normalizeJobsHeroLogosError = (raw?: string | null) => {
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) return "Failed to load hero logos.";
  if (
    /schema cache/i.test(message) &&
    /jobs_hero_logos/i.test(message)
  ) {
    return [
      "Hero logos table is not set up yet.",
      "Run `supabase/jobs_hero_logos.sql` in the Supabase SQL editor, then reload the API schema cache (Settings → API → Reload schema) or restart the API.",
    ].join(" ");
  }
  return message;
};

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);

    const { data, error } = await admin
      .from("jobs_hero_logos")
      .select("id,company_id,label,logo_path,sort_order,created_at,updated_at")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(
        normalizeJobsHeroLogosError(
          error.message ??
            "Failed to load hero logos. Apply `supabase/jobs_hero_logos.sql` first."
        )
      );
    }

    const rows = Array.isArray(data) ? (data as JobsHeroLogoRow[]) : [];
    const signed = await signJobsHeroLogoUrls(admin, rows);

    return NextResponse.json(
      {
        logos: rows
          .map((row) => {
            const path =
              typeof row.logo_path === "string" && row.logo_path.trim() ? row.logo_path.trim() : "";
            const logoUrl = path ? signed.get(path) ?? null : null;
            if (!logoUrl) return null;
            return {
              id: row.id,
              label: (row.label ?? "").trim(),
              logoUrl,
              sortOrder: Number.isFinite(row.sort_order) ? row.sort_order : 0,
            };
          })
          .filter(Boolean),
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
