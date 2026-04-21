import { NextResponse } from "next/server";

import { requireBreezyCompanyId } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const isMissingTemplatesTableError = (message: string) =>
  /could not find the table/i.test(message) &&
  (/breezy_templates/i.test(message) || /breezy_template_folders/i.test(message));

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

function getBreezyCompanyIdFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyParam = (searchParams.get("companyId") ?? "").trim();
  if (companyParam) return companyParam;
  try {
    return requireBreezyCompanyId().companyId;
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;

    const { data, error } = await admin
      .from("breezy_template_folders")
      .select("id,name,sort_order,created_at,updated_at")
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      if (isMissingTemplatesTableError(error.message ?? "")) {
        return NextResponse.json(
          {
            folders: [],
            warning:
              "Database tables `breezy_templates` and `breezy_template_folders` are not set up. Apply `supabase/breezy_templates.sql` in your Supabase project to enable caching and folders.",
          },
          { status: 200 }
        );
      }
      throw new Error(error.message ?? "Failed to load folders");
    }

    return NextResponse.json({ folders: Array.isArray(data) ? data : [] }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const payload = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = asString(payload?.name).trim();
    if (!name) {
      return NextResponse.json({ error: "Missing folder name" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;

    const { data, error } = await admin
      .from("breezy_template_folders")
      .insert({
        company_id: companyId,
        breezy_company_id: breezyCompanyId,
        name,
      })
      .select("id,name,sort_order,created_at,updated_at")
      .single();

    if (error) {
      if (isMissingTemplatesTableError(error.message ?? "")) {
        return NextResponse.json(
          {
            error:
              "Database tables `breezy_templates` and `breezy_template_folders` are not set up. Apply `supabase/breezy_templates.sql` in your Supabase project.",
          },
          { status: 500 }
        );
      }
      throw new Error(error.message ?? "Failed to create folder");
    }

    return NextResponse.json({ folder: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
