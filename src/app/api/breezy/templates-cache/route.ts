import { NextResponse } from "next/server";

import { retiredBreezyResponse, requireBreezyCompanyId } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type FolderListItem = {
  id: string;
  name: string;
  sort_order: number;
};

type TemplateListItem = {
  id: string;
  name: string;
  subject?: string;
  body?: string;
  folder_id?: string | null;
  synced_at?: string | null;
  updated_at?: string | null;
};

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

    const { data: folderRows, error: folderError } = await admin
      .from("breezy_template_folders")
      .select("id,name,sort_order")
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (folderError) {
      throw new Error(folderError.message ?? "Failed to load folders");
    }

    const folders = (Array.isArray(folderRows) ? folderRows : []).map((row) => ({
      id: asString((row as Record<string, unknown>)?.id).trim(),
      name: asString((row as Record<string, unknown>)?.name).trim() || "Folder",
      sort_order:
        typeof (row as Record<string, unknown>)?.sort_order === "number"
          ? ((row as Record<string, unknown>).sort_order as number)
          : 0,
    })) satisfies FolderListItem[];

    const { data: templateRows, error: templateError } = await admin
      .from("breezy_templates")
      .select("breezy_template_id,name,subject,body,folder_id,synced_at,updated_at")
      .eq("company_id", companyId)
      .eq("breezy_company_id", breezyCompanyId)
      .order("name", { ascending: true });

    if (templateError) {
      throw new Error(templateError.message ?? "Failed to load cached templates");
    }

    const templates = (Array.isArray(templateRows) ? templateRows : [])
      .map((row) => {
        const record = row as Record<string, unknown>;
        const id = asString(record.breezy_template_id).trim();
        if (!id) return null;
        return {
          id,
          name: asString(record.name).trim() || "Template",
          subject: asString(record.subject).trim() || undefined,
          body: asString(record.body).trim() || undefined,
          folder_id: asString(record.folder_id).trim() || null,
          synced_at: asString(record.synced_at).trim() || null,
          updated_at: asString(record.updated_at).trim() || null,
        } satisfies TemplateListItem;
      })
      .filter(Boolean) as TemplateListItem[];

    return NextResponse.json({ folders, templates }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST() {
  return retiredBreezyResponse();
}
