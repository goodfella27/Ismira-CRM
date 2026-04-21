import { NextResponse } from "next/server";

import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type BreezyTemplate = {
  _id?: string;
  id?: string;
  name?: string;
  subject?: string;
  body?: string;
  content?: string;
};

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

const isMissingTemplatesTableError = (message: string) =>
  /could not find the table/i.test(message) &&
  (/breezy_templates/i.test(message) || /breezy_template_folders/i.test(message));

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getId(value: { _id?: string; id?: string } | null | undefined) {
  return asString(value?._id).trim() || asString(value?.id).trim();
}

function normalizeTemplates(payload: unknown): BreezyTemplate[] {
  if (Array.isArray(payload)) return payload as BreezyTemplate[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as BreezyTemplate[];
    if (Array.isArray(obj.results)) return obj.results as BreezyTemplate[];
    if (Array.isArray(obj.templates)) return obj.templates as BreezyTemplate[];
  }
  return [];
}

function pickBody(template: BreezyTemplate) {
  return (
    asString(template.body).trim() ||
    asString(template.content).trim() ||
    asString((template as Record<string, unknown>).html).trim() ||
    ""
  );
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

async function fetchBreezyTemplatesList(breezyCompanyId: string): Promise<TemplateListItem[]> {
  const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(breezyCompanyId)}/templates`;
  const res = await breezyFetch(url);
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    throw new Error(
      typeof body === "string"
        ? body
        : (body as { message?: string })?.message ?? "Failed to load templates from Breezy"
    );
  }

  return normalizeTemplates(body)
    .map((tpl) => {
      const id = getId(tpl);
      const name = asString(tpl.name).trim() || "Template";
      const subject = asString(tpl.subject).trim() || undefined;
      const bodyText = pickBody(tpl);
      return {
        id,
        name,
        subject,
        body: bodyText || undefined,
        folder_id: null,
      } satisfies TemplateListItem;
    })
    .filter((tpl) => tpl.id);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
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
      if (isMissingTemplatesTableError(folderError.message ?? "")) {
        const fallback = await fetchBreezyTemplatesList(breezyCompanyId);
        return NextResponse.json(
          {
            folders: [],
            templates: fallback,
            warning:
              "Database tables `breezy_templates` and `breezy_template_folders` are not set up. Apply `supabase/breezy_templates.sql` in your Supabase project to enable caching and folders.",
          },
          { status: 200 }
        );
      }
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
      if (isMissingTemplatesTableError(templateError.message ?? "")) {
        const fallback = await fetchBreezyTemplatesList(breezyCompanyId);
        return NextResponse.json(
          {
            folders: [],
            templates: fallback,
            warning:
              "Database tables `breezy_templates` and `breezy_template_folders` are not set up. Apply `supabase/breezy_templates.sql` in your Supabase project to enable caching and folders.",
          },
          { status: 200 }
        );
      }
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

    if (templates.length === 0) {
      const fallback = await fetchBreezyTemplatesList(breezyCompanyId);
      return NextResponse.json(
        {
          folders,
          templates: fallback,
          warning: "No cached templates yet. Click Sync to store them in the database.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ folders, templates }, { status: 200 });
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

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;

    const listUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(breezyCompanyId)}/templates`;
    const listRes = await breezyFetch(listUrl);
    const listType = listRes.headers.get("content-type") ?? "";
    const listIsJson = listType.includes("application/json");
    const listBody = listIsJson ? await listRes.json() : await listRes.text();

    if (!listRes.ok) {
      return NextResponse.json(
        { error: "Breezy request failed", status: listRes.status, details: listBody },
        { status: listRes.status }
      );
    }

    const breezyList = normalizeTemplates(listBody)
      .map((tpl) => ({
        id: getId(tpl),
        name: asString(tpl.name).trim() || null,
      }))
      .filter((tpl) => tpl.id);

    const now = new Date().toISOString();

    const detailsResults = await mapWithConcurrency(
      breezyList,
      8,
      async (tpl): Promise<{ ok: boolean; id: string; details?: unknown; error?: unknown }> => {
        const url = `https://api.breezy.hr/v3/company/${encodeURIComponent(
          breezyCompanyId
        )}/template/${encodeURIComponent(tpl.id)}`;
        const res = await breezyFetch(url);
        const type = res.headers.get("content-type") ?? "";
        const isJson = type.includes("application/json");
        const body = isJson ? await res.json() : await res.text();
        if (!res.ok) return { ok: false, id: tpl.id, error: body };
        return { ok: true, id: tpl.id, details: body };
      }
    );

    const rows = detailsResults
      .filter((r) => r.ok)
      .map((r) => {
        const payload = r.details ?? null;
        const record =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : null;
        const name = asString(record?.name).trim() || null;
        const subject = asString(record?.subject).trim() || null;
        const body = pickBody(record as unknown as BreezyTemplate) || null;
        return {
          company_id: companyId,
          breezy_company_id: breezyCompanyId,
          breezy_template_id: r.id,
          name,
          subject,
          body,
          raw: payload,
          synced_at: now,
        };
      });

    if (rows.length > 0) {
      const { error: upsertError } = await admin.from("breezy_templates").upsert(rows, {
        onConflict: "company_id,breezy_company_id,breezy_template_id",
        defaultToNull: false,
      });
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
        throw new Error(upsertError.message ?? "Failed to store templates");
      }
    }

    const failed = detailsResults.filter((r) => !r.ok);

    return NextResponse.json(
      { templates: breezyList.length, stored: rows.length, failed: failed.length },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
