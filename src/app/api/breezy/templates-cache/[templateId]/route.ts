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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const user = await requireUser();

    const { templateId } = await params;
    const id = (templateId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing templateId" }, { status: 400 });
    }

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;
    const canEdit = true;

    const { data, error } = await admin
      .from("breezy_templates")
      .select("raw,folder_id,synced_at,updated_at,name,subject,body")
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .eq("breezy_template_id", id)
      .maybeSingle();

    if (error) throw new Error(error.message ?? "Failed to load template");
    if (!data) return NextResponse.json({ error: "Template not found in Supabase" }, { status: 404 });
    const row = data as Record<string, unknown>;
    const raw = isRecord(row.raw) ? row.raw : {};
    return NextResponse.json({
      template: { ...raw, id, _id: id, name: row.name ?? raw.name, subject: row.subject ?? raw.subject, body: row.body ?? raw.body },
      folder_id: row.folder_id ?? null,
      meta: { id, synced_at: row.synced_at, updated_at: row.updated_at, canEdit, source: "supabase" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const user = await requireUser();

    const { templateId } = await params;
    const id = (templateId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing templateId" }, { status: 400 });
    }

    const breezyCompanyId = getBreezyCompanyIdFromRequest(request);
    if (!breezyCompanyId) {
      return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
    }

    const payload = (await request.json().catch(() => null)) as
      | { folderId?: unknown }
      | null;
    if (!payload) {
      return NextResponse.json({ error: "Missing JSON body" }, { status: 400 });
    }

    const nextFolderIdRaw = payload.folderId;
    const nextFolderId =
      nextFolderIdRaw === null || nextFolderIdRaw === undefined
        ? null
        : asString(nextFolderIdRaw).trim();

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;

    if (nextFolderId) {
      const { data: folder, error: folderError } = await admin
        .from("breezy_template_folders")
        .select("id")
        .eq("company_id", companyId)
        .eq("breezy_company_id", breezyCompanyId)
        .eq("id", nextFolderId)
        .maybeSingle();

      if (folderError) {
        if (isMissingTemplatesTableError(folderError.message ?? "")) {
          return NextResponse.json(
            {
              error:
                "Database tables `breezy_templates` and `breezy_template_folders` are not set up. Apply `supabase/breezy_templates.sql` in your Supabase project.",
            },
            { status: 500 }
          );
        }
        throw new Error(folderError.message ?? "Failed to validate folder");
      }
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
    }

    const { error: upsertError } = await admin.from("breezy_templates").upsert(
      [
        {
          company_id: companyId,
          breezy_company_id: breezyCompanyId,
          breezy_template_id: id,
          folder_id: nextFolderId || null,
        },
      ],
      { onConflict: "company_id,breezy_company_id,breezy_template_id", defaultToNull: false }
    );

    if (upsertError) {
      if (isMissingTemplatesTableError(upsertError.message ?? "")) {
        return NextResponse.json(
          {
            error:
              "Database tables `breezy_templates` and `breezy_template_folders` are not set up. Apply `supabase/breezy_templates.sql` in your Supabase project.",
          },
          { status: 500 }
        );
      }
      throw new Error(upsertError.message ?? "Failed to update folder");
    }

    return NextResponse.json({ ok: true, folder_id: nextFolderId || null }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
