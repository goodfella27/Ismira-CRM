import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import {
  fetchJobDepartments,
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

async function requireAdmin() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();
  const membership = await ensureCompanyMembership(admin, user.id);
  return { admin, companyId: membership.companyId, response: null };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ departmentKey: string }> }
) {
  try {
    const { departmentKey } = await params;
    const key = normalizeJobDepartmentKey(decodeURIComponent(departmentKey ?? ""));
    if (!key) return NextResponse.json({ error: "Missing department key." }, { status: 400 });

    const { admin, companyId, response } = await requireAdmin();
    if (response) return response;

    const payload = await request.json().catch(() => null);
    const label = typeof payload?.label === "string" ? payload.label.trim().slice(0, 100) : "";
    const isHidden = typeof payload?.isHidden === "boolean" ? payload.isHidden : false;
    if (!label) return NextResponse.json({ error: "Department name is required." }, { status: 400 });

    const { error } = await admin.from("job_departments").upsert(
      {
        company_id: companyId,
        key,
        label,
        is_hidden: isHidden,
        sort_order: 0,
      },
      { onConflict: "company_id,key" }
    );

    if (error) throw new Error(normalizeJobDepartmentsError(error.message));
    clearJobsResponseCache();

    const departments = await fetchJobDepartments(admin, companyId);
    return NextResponse.json({ departments }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ departmentKey: string }> }
) {
  try {
    const { departmentKey } = await params;
    const key = normalizeJobDepartmentKey(decodeURIComponent(departmentKey ?? ""));
    if (!key) return NextResponse.json({ error: "Missing department key." }, { status: 400 });

    const { admin, companyId, response } = await requireAdmin();
    if (response) return response;

    const departments = await fetchJobDepartments(admin, companyId);
    const current = departments.find((item) => item.key === key);

    if (current?.isCustom && current.count === 0) {
      const { error } = await admin
        .from("job_departments")
        .delete()
        .eq("company_id", companyId)
        .eq("key", key);
      if (error) throw new Error(normalizeJobDepartmentsError(error.message));
    } else {
      const { error } = await admin.from("job_departments").upsert(
        {
          company_id: companyId,
          key,
          label: current?.label ?? key,
          is_hidden: true,
          sort_order: 0,
        },
        { onConflict: "company_id,key" }
      );
      if (error) throw new Error(normalizeJobDepartmentsError(error.message));
    }
    clearJobsResponseCache();

    const nextDepartments = await fetchJobDepartments(admin, companyId);
    return NextResponse.json({ departments: nextDepartments }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
