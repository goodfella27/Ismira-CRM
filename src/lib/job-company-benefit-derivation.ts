import { AVAILABLE_BENEFIT_TAGS, extractBenefitTagsFromDescription, withRequiredBenefitTags } from "@/lib/job-benefits";
import { pickPositionDescription } from "@/lib/breezy-position-description";
import { hasManualBenefitsOverride } from "@/lib/job-company-benefits";

export type BenefitPosition = {
  job_company_id: string | null;
  details: unknown;
  state: string | null;
  org_type: string | null;
  details_synced_at?: string | null;
  updated_at?: string | null;
};

// Match the automatic sync's six newest published descriptions without persisting on a read.
export function deriveMissingCompanyBenefits(
  companies: Array<{ id: string; metadata: unknown }>,
  positions: BenefitPosition[],
  storedTags: Map<string, string[]>
) {
  const result = new Map(storedTags);
  const missing = new Set(companies.filter(company =>
    !storedTags.has(company.id) && !hasManualBenefitsOverride(company.metadata)
  ).map(company => company.id));
  if (missing.size === 0) return result;

  const timestamp = (value: string | null | undefined) => {
    const parsed = Date.parse(value ?? "");
    return Number.isFinite(parsed) ? parsed : -Infinity;
  };
  const rows = positions.filter(row => missing.has(row.job_company_id ?? "") &&
    row.state === "published" && (row.org_type ?? "").toLowerCase() !== "pool")
    .sort((a, b) => (timestamp(b.details_synced_at) - timestamp(a.details_synced_at)) ||
      (timestamp(b.updated_at) - timestamp(a.updated_at)) || 0);
  const sampled = new Map<string, number>();
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const id = row.job_company_id!;
    const count = sampled.get(id) ?? 0;
    if (count >= 6) continue;
    sampled.set(id, count + 1);
    if (!row.details || typeof row.details !== "object" || Array.isArray(row.details)) continue;
    const tags = extractBenefitTagsFromDescription(pickPositionDescription(row.details as Record<string, unknown>), { maxTags: 6 });
    const bucket = counts.get(id) ?? new Map<string, number>();
    for (const tag of tags) bucket.set(tag, (bucket.get(tag) ?? 0) + 1);
    counts.set(id, bucket);
  }
  for (const id of missing) {
    const bucket = counts.get(id) ?? new Map<string, number>();
    const tags = AVAILABLE_BENEFIT_TAGS.filter(tag => bucket.has(tag))
      .sort((a, b) => (bucket.get(b) ?? 0) - (bucket.get(a) ?? 0) || a.localeCompare(b))
      .slice(0, 6);
    result.set(id, withRequiredBenefitTags(tags));
  }
  return result;
}
