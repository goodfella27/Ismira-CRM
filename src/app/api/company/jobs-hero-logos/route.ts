import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { signJobsHeroLogoUrls, type JobsHeroLogoRow } from "@/lib/jobs-hero-logos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
      .from("jobs_hero_logos")
      .select("id,company_id,label,logo_path,sort_order,created_at,updated_at")
      .eq("company_id", membership.companyId)
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
        logos: rows.map((row) => {
          const path =
            typeof row.logo_path === "string" && row.logo_path.trim() ? row.logo_path.trim() : "";
          return {
            id: row.id,
            label: (row.label ?? "").trim(),
            logoUrl: path ? signed.get(path) ?? null : null,
            sortOrder: Number.isFinite(row.sort_order) ? row.sort_order : 0,
            createdAt: row.created_at ?? null,
            updatedAt: row.updated_at ?? null,
          };
        }),
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

    const body = (await request.json().catch(() => null)) as
      | { label?: string | null }
      | null;
    const label = typeof body?.label === "string" ? body.label.trim().slice(0, 60) : "";

    const { data: existing, error: existingError } = await admin
      .from("jobs_hero_logos")
      .select("sort_order")
      .eq("company_id", membership.companyId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(normalizeJobsHeroLogosError(existingError.message ?? "Failed to read sort order"));
    }
    const prevOrder =
      typeof existing?.sort_order === "number" && Number.isFinite(existing.sort_order)
        ? existing.sort_order
        : null;
    const nextOrder = prevOrder !== null ? prevOrder + 1 : 0;

    const { data: created, error: createError } = await admin
      .from("jobs_hero_logos")
      .insert({
        company_id: membership.companyId,
        label,
        sort_order: nextOrder,
      })
      .select("id,company_id,label,logo_path,sort_order,created_at,updated_at")
      .single();

    if (createError || !created) {
      throw new Error(
        normalizeJobsHeroLogosError(createError?.message ?? "Failed to create hero logo")
      );
    }

    return NextResponse.json(
      {
        logo: {
          id: created.id,
          label: (created.label ?? "").trim(),
          logoUrl: null,
          sortOrder: Number.isFinite(created.sort_order) ? created.sort_order : 0,
          createdAt: created.created_at ?? null,
          updatedAt: created.updated_at ?? null,
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
