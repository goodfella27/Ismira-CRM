import { BENEFIT_TAG_LABELS, AVAILABLE_BENEFIT_TAGS, type BenefitTag } from "@/lib/job-benefits";
import { normalizeBenefitTag } from "@/lib/job-company-benefits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type JobBenefitOption = {
  tag: BenefitTag;
  label: string;
  sortOrder: number;
  enabled: boolean;
};

type JobBenefitOptionRow = {
  tag: string | null;
  label: string | null;
  sort_order: number | null;
  enabled: boolean | null;
};

export const DEFAULT_JOB_BENEFIT_OPTIONS: JobBenefitOption[] = AVAILABLE_BENEFIT_TAGS.map(
  (tag, index) => ({
    tag,
    label: BENEFIT_TAG_LABELS[tag] ?? tag,
    sortOrder: index,
    enabled: true,
  })
);

export function normalizeBenefitLabel(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

export function normalizeBenefitOptions(value: unknown): JobBenefitOption[] {
  if (!Array.isArray(value)) return DEFAULT_JOB_BENEFIT_OPTIONS;
  const seen = new Set<string>();
  const options: JobBenefitOption[] = [];

  value.forEach((item, index) => {
    const row = item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};
    const label = normalizeBenefitLabel(row.label);
    const tag = normalizeBenefitTag(row.tag || label);
    if (!tag || !label || seen.has(tag)) return;
    seen.add(tag);
    options.push({
      tag,
      label,
      sortOrder: typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
        ? row.sortOrder
        : index,
      enabled: row.enabled !== false,
    });
  });

  return options.length > 0 ? options : DEFAULT_JOB_BENEFIT_OPTIONS;
}

export async function fetchJobBenefitOptions(admin: AdminClient, companyId: string) {
  const { data, error } = await admin
    .from("job_benefit_options")
    .select("tag,label,sort_order,enabled")
    .eq("company_id", companyId)
    .eq("enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (/job_benefit_options|schema cache|does not exist/i.test(error.message ?? "")) {
      return DEFAULT_JOB_BENEFIT_OPTIONS;
    }
    throw new Error(error.message ?? "Failed to load job benefit options");
  }

  const rows = Array.isArray(data) ? (data as JobBenefitOptionRow[]) : [];
  if (rows.length === 0) return DEFAULT_JOB_BENEFIT_OPTIONS;

  const defaultsByTag = new Map(DEFAULT_JOB_BENEFIT_OPTIONS.map((item) => [item.tag, item]));
  const saved = rows
    .map((row, index) => {
      const tag = normalizeBenefitTag(row.tag);
      const label = normalizeBenefitLabel(row.label) || defaultsByTag.get(tag)?.label || tag;
      if (!tag || !label) return null;
      return {
        tag,
        label,
        sortOrder: typeof row.sort_order === "number" ? row.sort_order : index,
        enabled: row.enabled !== false,
      } satisfies JobBenefitOption;
    })
    .filter((item): item is JobBenefitOption => Boolean(item));

  return saved.length > 0 ? saved : DEFAULT_JOB_BENEFIT_OPTIONS;
}

export function benefitLabelMap(options: JobBenefitOption[]) {
  return Object.fromEntries(options.map((option) => [option.tag, option.label])) as Record<string, string>;
}
