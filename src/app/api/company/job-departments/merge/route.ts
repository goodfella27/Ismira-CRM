import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import {
  fetchJobDepartments,
  getEffectivePositionDepartment,
  normalizeJobDepartmentKey,
  normalizeJobDepartmentsError,
} from "@/lib/job-departments";
import { clearJobsResponseCache } from "@/lib/jobs-api-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    if (membership.role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const sourceKey = normalizeJobDepartmentKey(
      typeof payload?.sourceKey === "string" ? payload.sourceKey : ""
    );
    const targetKey = normalizeJobDepartmentKey(
      typeof payload?.targetKey === "string" ? payload.targetKey : ""
    );

    if (!sourceKey || !targetKey) {
      return NextResponse.json(
        { error: "Source and target departments are required." },
        { status: 400 }
      );
    }
    if (sourceKey === targetKey) {
      return NextResponse.json(
        { error: "Source and target departments must be different." },
        { status: 400 }
      );
    }

    const departments = await fetchJobDepartments(admin, membership.companyId);
    const source = departments.find((item) => item.key === sourceKey);
    const target = departments.find((item) => item.key === targetKey);
    if (!source || !target) {
      return NextResponse.json({ error: "Department was not found." }, { status: 404 });
    }

    const { data, error } = await admin
      .from("breezy_positions")
      .select("breezy_position_id,department,overrides")
      .eq("company_id", membership.companyId);

    if (error) throw new Error(error.message ?? "Failed to load department positions.");

    const rows = Array.isArray(data)
      ? (data as Array<{
          breezy_position_id: string | null;
          department: string | null;
          overrides: unknown;
        }>)
      : [];
    const matchingRows = rows.filter((row) => {
      const label = getEffectivePositionDepartment(row);
      return normalizeJobDepartmentKey(label) === sourceKey;
    });

    for (const row of matchingRows) {
      const positionId = (row.breezy_position_id ?? "").trim();
      if (!positionId) continue;
      const overrides = isRecord(row.overrides) ? row.overrides : {};
      const { error: updateError } = await admin
        .from("breezy_positions")
        .update({
          overrides: {
            ...overrides,
            department: target.label,
          },
        })
        .eq("company_id", membership.companyId)
        .eq("breezy_position_id", positionId);
      if (updateError) throw new Error(updateError.message ?? "Failed to move position.");
    }

    const { error: targetError } = await admin.from("job_departments").upsert(
      {
        company_id: membership.companyId,
        key: target.key,
        label: target.label,
        is_hidden: false,
        sort_order: 0,
      },
      { onConflict: "company_id,key" }
    );
    if (targetError) throw new Error(normalizeJobDepartmentsError(targetError.message));

    const { error: sourceError } = await admin.from("job_departments").upsert(
      {
        company_id: membership.companyId,
        key: source.key,
        label: source.label,
        is_hidden: true,
        sort_order: 0,
      },
      { onConflict: "company_id,key" }
    );
    if (sourceError) throw new Error(normalizeJobDepartmentsError(sourceError.message));

    clearJobsResponseCache();
    const nextDepartments = await fetchJobDepartments(admin, membership.companyId);
    return NextResponse.json(
      {
        departments: nextDepartments,
        merge: {
          sourceKey: source.key,
          sourceLabel: source.label,
          targetKey: target.key,
          targetLabel: target.label,
          positionsMoved: matchingRows.length,
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
