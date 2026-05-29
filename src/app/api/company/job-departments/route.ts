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

export async function GET() {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const departments = await fetchJobDepartments(admin, membership.companyId);

    return NextResponse.json({ departments }, { status: 200 });
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
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const label = typeof payload?.label === "string" ? payload.label.trim().slice(0, 100) : "";
    if (!label) return NextResponse.json({ error: "Department name is required." }, { status: 400 });

    const key = normalizeJobDepartmentKey(label);
    const { error } = await admin.from("job_departments").upsert(
      {
        company_id: membership.companyId,
        key,
        label,
        is_hidden: false,
        sort_order: 0,
      },
      { onConflict: "company_id,key" }
    );

    if (error) throw new Error(normalizeJobDepartmentsError(error.message));
    clearJobsResponseCache();

    const departments = await fetchJobDepartments(admin, membership.companyId);
    return NextResponse.json({ departments }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
