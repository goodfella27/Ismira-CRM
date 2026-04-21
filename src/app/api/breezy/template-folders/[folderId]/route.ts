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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    const user = await requireUser();

    const { folderId } = await params;
    const id = asString(folderId).trim();
    if (!id) {
      return NextResponse.json({ error: "Missing folderId" }, { status: 400 });
    }

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const payload = (await request.json().catch(() => null)) as
      | { name?: unknown; sort_order?: unknown }
      | null;
    if (!payload) {
      return NextResponse.json({ error: "Missing JSON body" }, { status: 400 });
    }

    const name = payload.name === undefined ? undefined : asString(payload.name).trim();
    const sortOrderRaw = payload.sort_order;
    const sortOrder =
      typeof sortOrderRaw === "number" && Number.isFinite(sortOrderRaw) ? sortOrderRaw : undefined;

    if (name !== undefined && !name) {
      return NextResponse.json({ error: "Folder name cannot be empty" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (sortOrder !== undefined) updates.sort_order = sortOrder;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;

    const { data, error } = await admin
      .from("breezy_template_folders")
      .update(updates)
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .eq("id", id)
      .select("id,name,sort_order,created_at,updated_at")
      .maybeSingle();

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
      throw new Error(error.message ?? "Failed to update folder");
    }

    if (!data) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    return NextResponse.json({ folder: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    const user = await requireUser();

    const { folderId } = await params;
    const id = asString(folderId).trim();
    if (!id) {
      return NextResponse.json({ error: "Missing folderId" }, { status: 400 });
    }

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;

    const { error } = await admin
      .from("breezy_template_folders")
      .delete()
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .eq("id", id);

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
      throw new Error(error.message ?? "Failed to delete folder");
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
