type CompanyNameRow = {
  id: string;
  name: string;
  normalized_name: string;
  metadata?: Record<string, unknown> | null;
};

/** Retain old IDs and names as aliases when resolving merged companies. */
export function buildJobCompanyNameMaps(rows: CompanyNameRow[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const companyNameById = new Map<string, string>();
  const companyNameByNormalized = new Map<string, string>();
  for (const row of rows) {
    let current = row;
    const seen = new Set<string>();
    while (!seen.has(current.id)) {
      seen.add(current.id);
      const targetId = current.metadata?.merged_into_job_company_id;
      const target = typeof targetId === "string" ? byId.get(targetId.trim()) : undefined;
      if (!target || seen.has(target.id)) break;
      current = target;
    }
    companyNameById.set(row.id, current.name);
    companyNameByNormalized.set(row.normalized_name, current.name);
  }
  return { companyNameById, companyNameByNormalized };
}
