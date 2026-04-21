import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids) ? (body?.ids as unknown[]) : [];
    const ordered = ids
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean);

    if (ordered.length === 0) {
      return NextResponse.json({ error: "Missing ids" }, { status: 400 });
    }

    // Keep changes bounded to this company.
    const { data: existing, error: existingError } = await admin
      .from("jobs_hero_logos")
      .select("id")
      .eq("company_id", membership.companyId);
    if (existingError) {
      throw new Error(
        normalizeJobsHeroLogosError(existingError.message ?? "Failed to load existing logos")
      );
    }

    const existingIds = new Set(
      (Array.isArray(existing) ? existing : []).map((row) => String((row as { id: string }).id))
    );
    const safeOrdered = ordered.filter((id) => existingIds.has(id));
    if (safeOrdered.length === 0) {
      return NextResponse.json({ error: "No matching ids" }, { status: 400 });
    }

    for (let i = 0; i < safeOrdered.length; i += 1) {
      const id = safeOrdered[i]!;
      const { error } = await admin
        .from("jobs_hero_logos")
        .update({ sort_order: i })
        .eq("company_id", membership.companyId)
        .eq("id", id);
      if (error) {
        throw new Error(
          normalizeJobsHeroLogosError(error.message ?? "Failed to reorder hero logos")
        );
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
