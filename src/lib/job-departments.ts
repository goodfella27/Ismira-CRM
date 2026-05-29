import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type JobDepartmentRow = {
  id: string;
  company_id: string;
  key: string;
  label: string;
  is_hidden: boolean | null;
  sort_order: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type JobDepartmentPayload = {
  id: string;
  key: string;
  label: string;
  count: number;
  isHidden: boolean;
  isCustom: boolean;
};

type BreezyPositionDepartmentRow = {
  department: string | null;
  overrides: unknown;
};

export const JOB_DEPARTMENTS_SELECT =
  "id,company_id,key,label,is_hidden,sort_order,created_at,updated_at";

export function normalizeJobDepartmentKey(value: string) {
  return value.trim().toLowerCase();
}

export function getEffectivePositionDepartment(row: BreezyPositionDepartmentRow) {
  const overrides =
    row.overrides && typeof row.overrides === "object" && !Array.isArray(row.overrides)
      ? (row.overrides as Record<string, unknown>)
      : {};
  const overrideDepartment =
    typeof overrides.department === "string" ? overrides.department.trim() : "";
  return overrideDepartment || (row.department ?? "").trim();
}

export function normalizeJobDepartmentsError(raw?: string | null) {
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) return "Failed to load departments.";
  if (/schema cache/i.test(message) && /job_departments/i.test(message)) {
    return [
      "Departments table is not set up yet.",
      "Run `supabase/job_departments.sql` in Supabase, then reload the API schema cache.",
    ].join(" ");
  }
  if (/could not find the table/i.test(message) && /job_departments/i.test(message)) {
    return "Departments table is not set up yet. Run `supabase/job_departments.sql` in Supabase first.";
  }
  return message;
}

export async function fetchManagedDepartmentRows(admin: AdminClient, companyId: string) {
  const { data, error } = await admin
    .from("job_departments")
    .select(JOB_DEPARTMENTS_SELECT)
    .eq("company_id", companyId)
    .order("label", { ascending: true });

  if (error) throw new Error(normalizeJobDepartmentsError(error.message));
  return Array.isArray(data) ? (data as JobDepartmentRow[]) : [];
}

export async function fetchDiscoveredDepartmentCounts(admin: AdminClient, companyId: string) {
  const { data, error } = await admin
    .from("breezy_positions")
    .select("department,overrides")
    .eq("company_id", companyId)
    .eq("state", "published")
    .or("org_type.eq.position,org_type.is.null");

  if (error) throw new Error(error.message ?? "Failed to load position departments.");

  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  const rows = Array.isArray(data) ? (data as BreezyPositionDepartmentRow[]) : [];
  for (const row of rows) {
    const label = getEffectivePositionDepartment(row);
    const key = normalizeJobDepartmentKey(label);
    if (!key || !label) continue;
    if (!labels.has(key)) labels.set(key, label);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return { labels, counts };
}

export async function fetchJobDepartments(admin: AdminClient, companyId: string) {
  const [{ labels, counts }, managedRows] = await Promise.all([
    fetchDiscoveredDepartmentCounts(admin, companyId),
    fetchManagedDepartmentRows(admin, companyId),
  ]);

  const managedByKey = new Map(
    managedRows.map((row) => [normalizeJobDepartmentKey(row.key), row] as const)
  );
  const keys = new Set([...labels.keys(), ...managedByKey.keys()]);

  return Array.from(keys)
    .map((key) => {
      const managed = managedByKey.get(key);
      const fallbackLabel = labels.get(key) ?? managed?.label ?? key;
      return {
        id: managed?.id ?? key,
        key,
        label: (managed?.label ?? fallbackLabel).trim(),
        count: counts.get(key) ?? 0,
        isHidden: managed?.is_hidden === true,
        isCustom: !labels.has(key),
      } satisfies JobDepartmentPayload;
    })
    .sort((a, b) => {
      if (a.isHidden !== b.isHidden) return a.isHidden ? 1 : -1;
      if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
}

export async function applyDepartmentOverridesToJobs<
  T extends { department?: string | null | undefined },
>(admin: AdminClient, companyId: string, jobs: T[]) {
  const rows = await fetchManagedDepartmentRows(admin, companyId);
  if (rows.length === 0) return jobs;

  const byKey = new Map(rows.map((row) => [normalizeJobDepartmentKey(row.key), row] as const));
  return jobs.map((job) => {
    const department = typeof job.department === "string" ? job.department.trim() : "";
    const key = normalizeJobDepartmentKey(department);
    const override = byKey.get(key);
    if (!override) return job;
    if (override.is_hidden === true) return { ...job, department: undefined };
    const label = override.label.trim();
    return label ? { ...job, department: label } : job;
  });
}
