import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  dedupePriorityTypes,
  getDefaultPriorityFrontpageVisibility,
  normalizePriorityKey,
} from "@/lib/breezy-priority-types";
import { JOB_COMPANY_OPENING_TYPE_METADATA_KEY } from "@/lib/job-company-opening-types";

export const runtime = "nodejs";

type PriorityTypeRow = {
  company_id: string;
  key: string | null;
  label: string | null;
  sort_order: number | null;
  tooltip?: string | null;
    show_on_frontpage?: boolean | null;
};

const isMissingPriorityTypesTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_priority_types/i.test(message);

const isMissingShowOnFrontpageColumnError = (message: string) =>
  /show_on_frontpage/i.test(message) &&
  (/could not find/i.test(message) || /column/i.test(message) || /schema cache/i.test(message));

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

async function readPriorityTypes(companyId: string) {
  const admin = createSupabaseAdminClient();
  const initial = await admin
    .from("breezy_priority_types")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  let data = initial.data as PriorityTypeRow[] | null;
  let error = initial.error;

  if (error && isMissingShowOnFrontpageColumnError(error.message ?? "")) {
    const fallback = await admin
      .from("breezy_priority_types")
      .select("company_id,key,label,sort_order")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    data = fallback.data as PriorityTypeRow[] | null;
    error = fallback.error;
  }

  if (error) throw error;

  return dedupePriorityTypes(
    (Array.isArray(data) ? (data as PriorityTypeRow[]) : []).map((row, index) => ({
      key: row.key ?? "",
      label: row.label ?? "",
      tooltip: typeof row.tooltip === "string" ? row.tooltip : undefined,
      sortOrder: Number.isFinite(row.sort_order) ? Number(row.sort_order) : index,
      showOnFrontpage:
        typeof row.show_on_frontpage === "boolean"
          ? row.show_on_frontpage
          : getDefaultPriorityFrontpageVisibility(row.key ?? "", row.label ?? ""),
    }))
  );
}

export async function GET() {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    try {
      const types = await readPriorityTypes(membership.companyId);
      return NextResponse.json({ priorityTypes: types }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (isMissingPriorityTypesTableError(message)) {
        return NextResponse.json(
          {
            priorityTypes: DEFAULT_BREEZY_PRIORITY_TYPES,
            warning:
              "Database table `breezy_priority_types` is not set up. Apply `supabase/breezy_priority_types.sql` in Supabase to enable managing custom priority types.",
          },
          { status: 200 }
        );
      }
      throw error;
    }
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

    const body = (await request.json().catch(() => null)) as { label?: unknown } | null;
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    if (!label) {
      return NextResponse.json({ error: "Missing label." }, { status: 400 });
    }

    let key = normalizePriorityKey(label);
    if (!key) {
      return NextResponse.json({ error: "Invalid label." }, { status: 400 });
    }

    const existing = await readPriorityTypes(membership.companyId);
    const existingKeys = new Set(existing.map((item) => item.key));
    if (existing.some((item) => item.label.trim().toLowerCase() === label.toLowerCase())) {
      return NextResponse.json({ error: "Type already exists." }, { status: 409 });
    }
    if (existingKeys.has(key)) {
      let index = 2;
      while (existingKeys.has(`${key}-${index}`)) index += 1;
      key = `${key}-${index}`;
    }

    const maxSort = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1);
    const { error } = await admin.from("breezy_priority_types").insert({
      company_id: membership.companyId,
      key,
      label,
      sort_order: maxSort + 1,
      show_on_frontpage: true,
    });
    if (error) throw new Error(error.message.includes("tooltip") ? "Tooltip storage is not set up. Apply supabase/breezy_priority_type_tooltips.sql first." : error.message);

    clearJobsResponseCache();

    return NextResponse.json(
      { priorityTypes: await readPriorityTypes(membership.companyId) },
      { status: 201 }
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";
    const message = isMissingPriorityTypesTableError(raw)
      ? "Apply `supabase/breezy_priority_types.sql` in Supabase before managing custom priority types."
      : raw;
    const status =
      /not authenticated/i.test(message) ? 401 : /admin only/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const body = (await request.json().catch(() => null)) as {
      key?: unknown;
      label?: unknown;
      showOnFrontpage?: unknown;
      tooltip?: unknown;
    } | null;
    const key = typeof body?.key === "string" ? normalizePriorityKey(body.key) : "";
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    const hasShowOnFrontpage = typeof body?.showOnFrontpage === "boolean";
    if (!key || (body?.label !== undefined && !label)) {
      return NextResponse.json({ error: "A key and non-empty label, when provided, are required." }, { status: 400 });
    }

    const updates: { label?: string; show_on_frontpage?: boolean; tooltip?: string } = {};
    if (label) updates.label = label;
    if (typeof body?.tooltip === "string") {
      if (body.tooltip.length > 500) return NextResponse.json({ error: "Tooltip must be 500 characters or fewer." }, { status: 400 });
      updates.tooltip = body.tooltip.trim();
    }
    if (hasShowOnFrontpage) {
      updates.show_on_frontpage = body.showOnFrontpage === true;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No opening type changes provided." }, { status: 400 });
    }

    const { error } = await admin
      .from("breezy_priority_types")
      .update(updates)
      .eq("company_id", membership.companyId)
      .eq("key", key);
    if (error) throw new Error(error.message.includes("tooltip") ? "Tooltip storage is not set up. Apply supabase/breezy_priority_type_tooltips.sql first." : error.message);

    clearJobsResponseCache();

    return NextResponse.json(
      { priorityTypes: await readPriorityTypes(membership.companyId) },
      { status: 200 }
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";
    const message = isMissingPriorityTypesTableError(raw)
      ? "Apply `supabase/breezy_priority_types.sql` in Supabase before managing custom priority types."
      : raw;
    const status =
      /not authenticated/i.test(message) ? 401 : /admin only/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const body = (await request.json().catch(() => null)) as { orderedKeys?: unknown } | null;
    const keys = body?.orderedKeys;
    if (!Array.isArray(keys) || keys.length === 0 ||
        keys.some((key) => typeof key !== "string" || !key) ||
        new Set(keys).size !== keys.length) {
      return NextResponse.json({ error: "Provide each opening type key exactly once." }, { status: 400 });
    }

    const existing = await readPriorityTypes(membership.companyId);
    const byKey = new Map(existing.map((type) => [type.key, type]));
    if (keys.length !== existing.length || keys.some((key) => !byKey.has(key))) {
      return NextResponse.json({ error: "Opening types have changed. Reload and try again." }, { status: 409 });
    }

    // Save the complete order in one statement, so a failed write cannot leave
    // half of a reorder saved. Omitted metadata columns remain unchanged.
    const { error } = await admin.from("breezy_priority_types").upsert(
      keys.map((key, index) => ({
        company_id: membership.companyId,
        key,
        label: byKey.get(key)!.label,
        sort_order: index,
      })),
      { onConflict: "company_id,key", defaultToNull: false }
    );
    if (error) throw new Error(error.message);
    clearJobsResponseCache();
    return NextResponse.json(
      { priorityTypes: await readPriorityTypes(membership.companyId) },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reorder opening types.";
    const status = /not authenticated/i.test(message) ? 401
      : /admin only|access required/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
    const key = typeof body?.key === "string" ? normalizePriorityKey(body.key) : "";
    if (!key) {
      return NextResponse.json({ error: "Missing key." }, { status: 400 });
    }

    const { data, error: selectError } = await admin
      .from("breezy_positions")
      .select("breezy_position_id,overrides")
      .eq("company_id", membership.companyId);
    if (selectError) throw selectError;

    const rows = Array.isArray(data)
      ? (data as Array<{ breezy_position_id: string; overrides: unknown }>)
      : [];

    for (const row of rows) {
      const overrides =
        row.overrides && typeof row.overrides === "object" && !Array.isArray(row.overrides)
          ? ({ ...(row.overrides as Record<string, unknown>) } as Record<string, unknown>)
          : null;
      if (!overrides) continue;
      const current = typeof overrides.priority === "string" ? normalizePriorityKey(overrides.priority) : "";
      if (current !== key) continue;
      delete overrides.priority;
      const { error: updateError } = await admin
        .from("breezy_positions")
        .update({ overrides })
        .eq("company_id", membership.companyId)
        .eq("breezy_position_id", row.breezy_position_id);
      if (updateError) throw updateError;
    }

    const { data: companyRows, error: companySelectError } = await admin
      .from("job_companies")
      .select("id,metadata")
      .eq("company_id", membership.companyId);
    if (companySelectError) throw companySelectError;

    for (const row of Array.isArray(companyRows)
      ? (companyRows as Array<{ id: string; metadata: unknown }>)
      : []) {
      const metadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? { ...(row.metadata as Record<string, unknown>) }
          : {};
      const current =
        typeof metadata[JOB_COMPANY_OPENING_TYPE_METADATA_KEY] === "string"
          ? normalizePriorityKey(metadata[JOB_COMPANY_OPENING_TYPE_METADATA_KEY] as string)
          : "";
      if (current !== key) continue;
      delete metadata[JOB_COMPANY_OPENING_TYPE_METADATA_KEY];
      const { error: updateError } = await admin
        .from("job_companies")
        .update({ metadata })
        .eq("company_id", membership.companyId)
        .eq("id", row.id);
      if (updateError) throw updateError;
    }

    const { error } = await admin
      .from("breezy_priority_types")
      .delete()
      .eq("company_id", membership.companyId)
      .eq("key", key);
    if (error) throw new Error(error.message.includes("tooltip") ? "Tooltip storage is not set up. Apply supabase/breezy_priority_type_tooltips.sql first." : error.message);

    clearJobsResponseCache();

    return NextResponse.json(
      { priorityTypes: await readPriorityTypes(membership.companyId) },
      { status: 200 }
    );
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Unknown error";
    const message = isMissingPriorityTypesTableError(raw)
      ? "Apply `supabase/breezy_priority_types.sql` in Supabase before managing custom priority types."
      : raw;
    const status =
      /not authenticated/i.test(message) ? 401 : /admin only/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
