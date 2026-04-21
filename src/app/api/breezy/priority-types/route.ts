import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  dedupePriorityTypes,
  normalizePriorityKey,
} from "@/lib/breezy-priority-types";

export const runtime = "nodejs";

type PriorityTypeRow = {
  company_id: string;
  key: string | null;
  label: string | null;
  sort_order: number | null;
};

const isMissingPriorityTypesTableError = (message: string) =>
  /could not find the table/i.test(message) && /breezy_priority_types/i.test(message);

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
  const { data, error } = await admin
    .from("breezy_priority_types")
    .select("company_id,key,label,sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw error;

  return dedupePriorityTypes(
    (Array.isArray(data) ? (data as PriorityTypeRow[]) : []).map((row, index) => ({
      key: row.key ?? "",
      label: row.label ?? "",
      sortOrder: Number.isFinite(row.sort_order) ? Number(row.sort_order) : index,
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
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin only." }, { status: 403 });
    }

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
    });
    if (error) throw error;

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
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin only." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      key?: unknown;
      label?: unknown;
    } | null;
    const key = typeof body?.key === "string" ? normalizePriorityKey(body.key) : "";
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    if (!key || !label) {
      return NextResponse.json({ error: "Missing key or label." }, { status: 400 });
    }

    const { error } = await admin
      .from("breezy_priority_types")
      .update({ label })
      .eq("company_id", membership.companyId)
      .eq("key", key);
    if (error) throw error;

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

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin only." }, { status: 403 });
    }

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

    const { error } = await admin
      .from("breezy_priority_types")
      .delete()
      .eq("company_id", membership.companyId)
      .eq("key", key);
    if (error) throw error;

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
