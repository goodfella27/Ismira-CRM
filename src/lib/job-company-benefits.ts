import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  AVAILABLE_BENEFIT_TAGS,
  extractBenefitTagsFromDescription,
  type BenefitTag,
} from "@/lib/job-benefits";
import { pickPositionDescription } from "@/lib/breezy-position-description";
import type { JobCompanyRow } from "@/lib/job-companies";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type JobCompanyBenefitRow = {
  id: string;
  company_id: string;
  job_company_id: string;
  tag: BenefitTag;
  sort_order: number | null;
  enabled: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const ALLOWED_TAGS = new Set<string>(AVAILABLE_BENEFIT_TAGS);

export function normalizeBenefitTags(value: unknown): BenefitTag[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<BenefitTag>();
  for (const item of value) {
    const tag = typeof item === "string" ? item.trim() : "";
    if (!ALLOWED_TAGS.has(tag)) continue;
    deduped.add(tag as BenefitTag);
  }
  return AVAILABLE_BENEFIT_TAGS.filter((tag) => deduped.has(tag));
}

export async function fetchJobCompanyBenefits(
  admin: AdminClient,
  companyId: string,
  jobCompanyIds: string[]
) {
  const ids = Array.from(new Set(jobCompanyIds.map((value) => value.trim()).filter(Boolean)));
  if (ids.length === 0) return [] as JobCompanyBenefitRow[];

  const { data, error } = await admin
    .from("job_company_benefits")
    .select("id,company_id,job_company_id,tag,sort_order,enabled,created_at,updated_at")
    .eq("company_id", companyId)
    .in("job_company_id", ids)
    .eq("enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message ?? "Failed to load job company benefits");
  return Array.isArray(data) ? (data as JobCompanyBenefitRow[]) : [];
}

export function mapBenefitTagsByJobCompanyId(rows: JobCompanyBenefitRow[]) {
  const byId = new Map<string, BenefitTag[]>();
  for (const row of rows) {
    const id = row.job_company_id?.trim();
    if (!id) continue;
    const current = byId.get(id) ?? [];
    if (!current.includes(row.tag)) current.push(row.tag);
    byId.set(id, current);
  }
  return byId;
}

export function hasManualBenefitsOverride(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const value = (metadata as Record<string, unknown>).job_company_benefits_manual_override;
  return value === true;
}

export async function syncAutoBenefitsFromCachedPositions(
  admin: AdminClient,
  options: {
    companyId: string;
    jobCompanies: JobCompanyRow[];
    maxTags?: number;
    samplePerCompany?: number;
  }
) {
  const maxTags = Math.max(1, options.maxTags ?? 6);
  const samplePerCompany = Math.max(1, options.samplePerCompany ?? 6);
  const autoCompanies = options.jobCompanies.filter(
    (company) => !hasManualBenefitsOverride(company.metadata)
  );
  if (autoCompanies.length === 0) return new Map<string, BenefitTag[]>();

  const jobCompanyIds = autoCompanies.map((company) => company.id);
  const { data, error } = await admin
    .from("breezy_positions")
    .select("job_company_id,details,state,org_type,details_synced_at,updated_at")
    .eq("company_id", options.companyId)
    .in("job_company_id", jobCompanyIds)
    .eq("state", "published")
    .order("details_synced_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message ?? "Failed to load cached positions for benefits sync");

  type PositionRow = {
    job_company_id: string | null;
    details: unknown;
    state: string | null;
    org_type: string | null;
    details_synced_at: string | null;
    updated_at: string | null;
  };

  const rows = Array.isArray(data) ? (data as PositionRow[]) : [];
  const sampledByCompany = new Map<string, PositionRow[]>();
  for (const row of rows) {
    const jobCompanyId = (row.job_company_id ?? "").trim();
    if (!jobCompanyId) continue;
    if ((row.org_type ?? "").toLowerCase() === "pool") continue;
    const existing = sampledByCompany.get(jobCompanyId) ?? [];
    if (existing.length >= samplePerCompany) continue;
    existing.push(row);
    sampledByCompany.set(jobCompanyId, existing);
  }

  const tagsByJobCompanyId = new Map<string, BenefitTag[]>();
  for (const company of autoCompanies) {
    const positions = sampledByCompany.get(company.id) ?? [];
    const counts = new Map<BenefitTag, number>();
    for (const row of positions) {
      if (!row.details || typeof row.details !== "object" || Array.isArray(row.details)) continue;
      const description = pickPositionDescription(row.details as Record<string, unknown>);
      const tags = extractBenefitTagsFromDescription(description, { maxTags });
      for (const tag of tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    const selected = AVAILABLE_BENEFIT_TAGS.filter((tag) => counts.has(tag))
      .sort((a, b) => {
        const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
        return diff !== 0 ? diff : a.localeCompare(b);
      })
      .slice(0, maxTags);
    tagsByJobCompanyId.set(company.id, selected);
  }

  const { error: deleteError } = await admin
    .from("job_company_benefits")
    .delete()
    .eq("company_id", options.companyId)
    .in("job_company_id", jobCompanyIds);
  if (deleteError) {
    throw new Error(deleteError.message ?? "Failed to clear auto company benefits");
  }

  const insertRows = Array.from(tagsByJobCompanyId.entries()).flatMap(([jobCompanyId, tags]) =>
    tags.map((tag, index) => ({
      company_id: options.companyId,
      job_company_id: jobCompanyId,
      tag,
      sort_order: index,
      enabled: true,
    }))
  );

  if (insertRows.length > 0) {
    const { error: insertError } = await admin.from("job_company_benefits").insert(insertRows);
    if (insertError) {
      throw new Error(insertError.message ?? "Failed to insert auto company benefits");
    }
  }

  return tagsByJobCompanyId;
}
