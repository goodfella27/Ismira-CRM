import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inferCompanyFromPositionName } from "@/lib/breezy-position-fields";

const BUCKET = "candidate-documents";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type JobCompanyRow = {
  id: string;
  company_id: string;
  breezy_company_id: string | null;
  name: string;
  normalized_name: string;
  slug: string;
  logo_path: string | null;
  website: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function normalizeJobCompanyName(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return "";

  if (normalized === "vv" || normalized === "virgin voyage") return "virgin voyages";

  return normalized;
}

export function resolveKnownJobCompanyName(
  value: unknown,
  companyNameByNormalized: Map<string, string>
) {
  const normalized = normalizeJobCompanyName(value);
  if (!normalized) return "";

  const exact = companyNameByNormalized.get(normalized);
  if (exact) return exact;
  if (normalized.length < 4) return "";

  const compatibleMatches = Array.from(companyNameByNormalized.entries()).filter(
    ([candidate]) => candidate.startsWith(normalized) || normalized.startsWith(candidate)
  );
  return compatibleMatches.length === 1 ? compatibleMatches[0][1] : "";
}

export function slugifyJobCompanyName(value: unknown) {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	const slug = normalized
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
	return slug || "company";
}

function normalizeLogoPath(raw: unknown) {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;

	if (/^https?:\/\//i.test(trimmed)) {
		const match = trimmed.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/i);
		if (match) {
			const bucket = match[1];
			const path = match[2];
			if (bucket === BUCKET && path) return { kind: "path" as const, path };
		}
		return { kind: "url" as const, url: trimmed };
	}

	const noLeadingSlash = trimmed.replace(/^\/+/, "");
	const withoutBucketPrefix = noLeadingSlash.startsWith(`${BUCKET}/`)
		? noLeadingSlash.slice(`${BUCKET}/`.length)
		: noLeadingSlash;
	return withoutBucketPrefix ? { kind: "path" as const, path: withoutBucketPrefix } : null;
}

function buildUniqueSlug(name: string, existing: Set<string>) {
  const base = slugifyJobCompanyName(name);
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }

  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  const next = `${base}-${index}`;
  existing.add(next);
  return next;
}

export async function signJobCompanyLogoUrls<T extends { logo_path?: string | null }>(
  admin: AdminClient,
  rows: T[]
) {
  const signedByPath = new Map<string, string | null>();
	const rawToPath = new Map<string, string>();
	const paths: string[] = [];
	for (const row of rows) {
		const rawKey = typeof row.logo_path === "string" ? row.logo_path.trim() : "";
		const normalized = normalizeLogoPath(row.logo_path);
		if (!normalized) continue;
		if (normalized.kind === "url") {
			if (rawKey) signedByPath.set(rawKey, normalized.url);
			continue;
		}
		if (rawKey) rawToPath.set(rawKey, normalized.path);
		paths.push(normalized.path);
	}
	const uniquePaths = Array.from(new Set(paths));

  await Promise.all(
    uniquePaths.map(async (path) => {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      signedByPath.set(path, error ? null : data?.signedUrl ?? null);
    })
  );

	for (const [rawKey, path] of rawToPath.entries()) {
		if (signedByPath.has(rawKey)) continue;
		signedByPath.set(rawKey, signedByPath.get(path) ?? null);
	}

  return signedByPath;
}

export async function resolveActiveJobCompanies(
  admin: AdminClient,
  companyId: string,
  rows: JobCompanyRow[]
) {
  const targetIds = Array.from(
    new Set(
      rows
        .map((row) => {
          const metadata =
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? row.metadata
              : {};
          return typeof metadata.merged_into_job_company_id === "string"
            ? metadata.merged_into_job_company_id.trim()
            : "";
        })
        .filter(Boolean)
    )
  );
  if (targetIds.length === 0) return rows;

  const { data, error } = await admin
    .from("job_companies")
    .select("id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at")
    .eq("company_id", companyId)
    .in("id", targetIds);
  if (error) throw new Error(error.message ?? "Failed to load merged job company targets");

  const targetsById = new Map(
    (Array.isArray(data) ? (data as JobCompanyRow[]) : []).map((row) => [row.id, row] as const)
  );
  const resolved = rows.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {};
    const targetId =
      typeof metadata.merged_into_job_company_id === "string"
        ? metadata.merged_into_job_company_id.trim()
        : "";
    return targetId ? targetsById.get(targetId) ?? row : row;
  });

  return Array.from(new Map(resolved.map((row) => [row.id, row] as const)).values());
}

export async function fetchJobCompaniesByNormalizedName(
  admin: AdminClient,
  companyId: string,
  normalizedNames: string[]
) {
  const unique = Array.from(new Set(normalizedNames.filter(Boolean)));
  if (unique.length === 0) return [] as JobCompanyRow[];

  const { data, error } = await admin
    .from("job_companies")
    .select("id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at")
    .eq("company_id", companyId)
    .in("normalized_name", unique)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message ?? "Failed to load job companies");
  return Array.isArray(data) ? (data as JobCompanyRow[]) : [];
}

export async function ensureJobCompaniesByName(
  admin: AdminClient,
  companyId: string,
  names: string[],
  options: { breezyCompanyId?: string | null } = {}
) {
  const labelsByNormalized = new Map<string, string>();
  for (const name of names) {
    const label = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
    const normalized = normalizeJobCompanyName(label);
    if (!normalized || labelsByNormalized.has(normalized)) continue;
    labelsByNormalized.set(normalized, label);
  }

  const normalizedNames = Array.from(labelsByNormalized.keys());
  if (normalizedNames.length === 0) return [] as JobCompanyRow[];

  const existingCompanies = await fetchJobCompaniesByNormalizedName(
    admin,
    companyId,
    normalizedNames
  );
  const existingByName = new Map(
    existingCompanies.map((item) => [item.normalized_name, item] as const)
  );
  const existingSlugs = new Set(existingCompanies.map((item) => item.slug).filter(Boolean));

  const missingRows = normalizedNames
    .filter((normalizedName) => !existingByName.has(normalizedName))
    .map((normalizedName) => {
      const name = labelsByNormalized.get(normalizedName) ?? normalizedName;
      return {
        company_id: companyId,
        breezy_company_id: options.breezyCompanyId ?? null,
        name,
        normalized_name: normalizedName,
        slug: buildUniqueSlug(name, existingSlugs),
        metadata: {},
      };
    });

  if (missingRows.length > 0) {
    const { error } = await admin.from("job_companies").insert(missingRows);
    if (error) throw new Error(error.message ?? "Failed to create job companies");
  }

  return fetchJobCompaniesByNormalizedName(admin, companyId, normalizedNames);
}

export async function setPositionJobCompanies(
  admin: AdminClient,
  init: {
    companyId: string;
    breezyPositionId: string;
    jobCompanyIds: string[];
    primaryJobCompanyId?: string | null;
  }
) {
  const uniqueIds = Array.from(new Set(init.jobCompanyIds.map((id) => id.trim()).filter(Boolean)));

  await admin
    .from("job_position_companies")
    .delete()
    .eq("company_id", init.companyId)
    .eq("breezy_position_id", init.breezyPositionId);

  if (uniqueIds.length === 0) return;

  const primary = init.primaryJobCompanyId && uniqueIds.includes(init.primaryJobCompanyId)
    ? init.primaryJobCompanyId
    : uniqueIds[0] ?? null;

  const { error } = await admin.from("job_position_companies").insert(
    uniqueIds.map((jobCompanyId) => ({
      company_id: init.companyId,
      breezy_position_id: init.breezyPositionId,
      job_company_id: jobCompanyId,
      is_primary: jobCompanyId === primary,
    }))
  );
  if (error) throw new Error(error.message ?? "Failed to link position companies");

  await admin
    .from("breezy_positions")
    .update({ job_company_id: primary })
    .eq("company_id", init.companyId)
    .eq("breezy_position_id", init.breezyPositionId);
}

export async function fetchPositionJobCompanyNames(
  admin: AdminClient,
  init: {
    companyId: string;
    breezyPositionId: string;
  }
) {
  const { data: joinRows, error: joinError } = await admin
    .from("job_position_companies")
    .select("job_company_id,is_primary,created_at")
    .eq("company_id", init.companyId)
    .eq("breezy_position_id", init.breezyPositionId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (joinError) throw new Error(joinError.message ?? "Failed to load position company links");

  const ids = Array.from(
    new Set(
      (Array.isArray(joinRows) ? joinRows : [])
        .map((row) => (typeof row.job_company_id === "string" ? row.job_company_id.trim() : ""))
        .filter(Boolean)
    )
  );
  if (ids.length === 0) return [];

  const { data: companies, error: companyError } = await admin
    .from("job_companies")
    .select("id,name")
    .eq("company_id", init.companyId)
    .in("id", ids);

  if (companyError) throw new Error(companyError.message ?? "Failed to load linked companies");

  const nameById = new Map(
    (Array.isArray(companies) ? companies : [])
      .map((row) => [
        typeof row.id === "string" ? row.id : "",
        typeof row.name === "string" ? row.name.trim() : "",
      ] as const)
      .filter(([id, name]) => Boolean(id && name))
  );

  return ids.map((id) => nameById.get(id) ?? "").filter(Boolean);
}

export async function syncJobCompaniesFromPositions(
  admin: AdminClient,
  options: { companyId: string; breezyCompanyId?: string | null }
) {
  let query = admin
    .from("breezy_positions")
    .select("breezy_position_id,breezy_company_id,name,company,job_company_id")
    .eq("company_id", options.companyId);

  if (options.breezyCompanyId) {
    query = query.eq("breezy_company_id", options.breezyCompanyId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message ?? "Failed to load positions for company sync");

  type PositionRow = {
    breezy_position_id: string;
    breezy_company_id: string | null;
    name: string | null;
    company: string | null;
    job_company_id?: string | null;
  };

  const rows = Array.isArray(data) ? (data as PositionRow[]) : [];
  const { data: existingCompanyRows, error: existingCompanyError } = await admin
    .from("job_companies")
    .select(
      "id,company_id,breezy_company_id,name,normalized_name,slug,logo_path,website,metadata,created_at,updated_at"
    )
    .eq("company_id", options.companyId);
  if (existingCompanyError) {
    throw new Error(existingCompanyError.message ?? "Failed to load existing job companies");
  }
  const existingCompanyNamesByNormalized = new Map(
    (Array.isArray(existingCompanyRows) ? (existingCompanyRows as JobCompanyRow[]) : []).map(
      (item) => [item.normalized_name, item.name] as const
    )
  );
  const uniqueNames = new Map<
    string,
    { name: string; breezyCompanyId: string | null }
  >();

  for (const row of rows) {
    const companyLabel =
      (typeof row.company === "string" && row.company.trim()) ||
      inferCompanyFromPositionName(row.name ?? "") ||
      "";
    const resolvedCompanyLabel =
      resolveKnownJobCompanyName(companyLabel, existingCompanyNamesByNormalized) || companyLabel;
    const normalizedName = normalizeJobCompanyName(resolvedCompanyLabel);
    if (!normalizedName) continue;
    if (!uniqueNames.has(normalizedName)) {
      uniqueNames.set(normalizedName, {
        name: resolvedCompanyLabel,
        breezyCompanyId: row.breezy_company_id ?? options.breezyCompanyId ?? null,
      });
    }
  }

  const normalizedNames = Array.from(uniqueNames.keys());
  if (normalizedNames.length === 0) {
    return { companiesUpserted: 0, positionsLinked: 0 };
  }

  const existingCompanies = await fetchJobCompaniesByNormalizedName(
    admin,
    options.companyId,
    normalizedNames
  );
  const existingSlugs = new Set(existingCompanies.map((item) => item.slug).filter(Boolean));
  const existingByName = new Map(
    existingCompanies.map((item) => [item.normalized_name, item] as const)
  );

  const upsertRows = normalizedNames.map((normalizedName) => {
    const item = uniqueNames.get(normalizedName)!;
    const existing = existingByName.get(normalizedName);
    return {
      company_id: options.companyId,
      breezy_company_id: existing?.breezy_company_id ?? item.breezyCompanyId,
      name: existing?.name ?? item.name,
      normalized_name: normalizedName,
      slug: existing?.slug ?? buildUniqueSlug(existing?.name ?? item.name, existingSlugs),
    };
  });

  const { error: upsertError } = await admin.from("job_companies").upsert(upsertRows, {
    onConflict: "company_id,normalized_name",
    defaultToNull: false,
  });
  if (upsertError) throw new Error(upsertError.message ?? "Failed to upsert job companies");

  const companies = await fetchJobCompaniesByNormalizedName(admin, options.companyId, normalizedNames);
  const companyByNormalizedName = new Map(
    companies.map((item) => [item.normalized_name, item] as const)
  );

  const positionUpdates = rows
    .map((row) => {
      const companyLabel =
        (typeof row.company === "string" && row.company.trim()) ||
        inferCompanyFromPositionName(row.name ?? "") ||
        "";
      const resolvedCompanyLabel =
        resolveKnownJobCompanyName(companyLabel, existingCompanyNamesByNormalized) || companyLabel;
      const normalizedName = normalizeJobCompanyName(resolvedCompanyLabel);
      const company = normalizedName ? companyByNormalizedName.get(normalizedName) ?? null : null;
      if (!company) return null;
      if (row.job_company_id === company.id && row.company === company.name) return null;
      return {
        company_id: options.companyId,
        breezy_company_id: row.breezy_company_id ?? options.breezyCompanyId ?? null,
        breezy_position_id: row.breezy_position_id,
        job_company_id: company.id,
        company: company.name,
      };
    })
    .filter(Boolean) as Array<{
      company_id: string;
      breezy_company_id: string | null;
      breezy_position_id: string;
      job_company_id: string;
      company: string;
    }>;

  if (positionUpdates.length > 0) {
    const { error: linkError } = await admin.from("breezy_positions").upsert(positionUpdates, {
      onConflict: "company_id,breezy_position_id",
      defaultToNull: false,
    });
    if (linkError) throw new Error(linkError.message ?? "Failed to link job companies");
  }

  const joinRows = rows
    .map((row) => {
      const companyLabel =
        (typeof row.company === "string" && row.company.trim()) ||
        inferCompanyFromPositionName(row.name ?? "") ||
        "";
      const resolvedCompanyLabel =
        resolveKnownJobCompanyName(companyLabel, existingCompanyNamesByNormalized) || companyLabel;
      const normalizedName = normalizeJobCompanyName(resolvedCompanyLabel);
      const jobCompanyId = normalizedName
        ? companyByNormalizedName.get(normalizedName)?.id ?? null
        : null;
      if (!jobCompanyId) return null;
      return {
        company_id: options.companyId,
        breezy_position_id: row.breezy_position_id,
        job_company_id: jobCompanyId,
        is_primary: true,
      };
    })
    .filter(Boolean) as Array<{
      company_id: string;
      breezy_position_id: string;
      job_company_id: string;
      is_primary: boolean;
    }>;

  if (joinRows.length > 0) {
    const { error: joinError } = await admin.from("job_position_companies").upsert(joinRows, {
      onConflict: "company_id,breezy_position_id,job_company_id",
      defaultToNull: false,
    });
    if (joinError) throw new Error(joinError.message ?? "Failed to sync position company joins");
  }

  return {
    companiesUpserted: upsertRows.length,
    positionsLinked: positionUpdates.length + joinRows.length,
  };
}
