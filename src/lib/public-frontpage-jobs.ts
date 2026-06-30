import { normalizePriorityKey } from "./breezy-priority-types";

type UnknownRecord = Record<string, unknown>;

export type PublicFrontpageJob = {
  id: string;
  view_id?: string;
  name: string;
  company?: string;
  department?: string;
  priority: string;
  priority_label: string;
  company_logo_url?: string;
  application_url?: string;
  details_url: string;
  updated_at?: string;
  ship_types: string[];
  benefit_tags: string[];
};

export type PublicFrontpageJobsPayload = {
  version: 1;
  jobs: PublicFrontpageJob[];
  benefitLabels: Record<string, string>;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => asString(item)).filter(Boolean))
  );
}

function asStringMap(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, label]) => [key.trim(), asString(label)] as const)
      .filter(([key, label]) => key && label)
  );
}

export function buildPublicFrontpageJobsPayload(
  source: unknown,
  origin: string
): PublicFrontpageJobsPayload {
  const payload = isRecord(source) ? source : {};
  const jobs = Array.isArray(payload.jobs)
    ? payload.jobs.filter(isRecord)
    : Array.isArray(source)
      ? source.filter(isRecord)
      : [];
  const priorityTypes = Array.isArray(payload.priorityTypes)
    ? payload.priorityTypes.filter(isRecord)
    : [];

  const visiblePriorityLabels = new Map<string, string>();
  for (const type of priorityTypes) {
    if (type.showOnFrontpage !== true) continue;
    const key = normalizePriorityKey(asString(type.key));
    const label = asString(type.label);
    if (key && label) visiblePriorityLabels.set(key, label);
  }

  const normalizedOrigin = origin.replace(/\/+$/, "");
  const publicJobs = jobs
    .map((job): PublicFrontpageJob | null => {
      const id = asString(job.id);
      const name = asString(job.name);
      const priority = normalizePriorityKey(asString(job.priority));
      const priorityLabel = visiblePriorityLabels.get(priority) ?? "";
      const state = asString(job.state).toLowerCase();
      const orgType = asString(job.org_type).toLowerCase();
      if (!id || !name || !priorityLabel) return null;
      if (state && state !== "published") return null;
      if (orgType === "pool") return null;

      const shipTypes = asStringArray(job.ship_types);
      const fallbackShipType = asString(job.ship_type);
      if (shipTypes.length === 0 && fallbackShipType) shipTypes.push(fallbackShipType);

      return {
        id,
        ...(asString(job.view_id) ? { view_id: asString(job.view_id) } : {}),
        name,
        ...(asString(job.company) ? { company: asString(job.company) } : {}),
        ...(asString(job.department) ? { department: asString(job.department) } : {}),
        priority,
        priority_label: priorityLabel,
        ...(asString(job.company_logo_url)
          ? { company_logo_url: asString(job.company_logo_url) }
          : {}),
        ...(asString(job.application_url)
          ? { application_url: asString(job.application_url) }
          : {}),
        details_url: `${normalizedOrigin}/jobs?job=${encodeURIComponent(id)}`,
        ...(asString(job.updated_at) ? { updated_at: asString(job.updated_at) } : {}),
        ship_types: shipTypes,
        benefit_tags: asStringArray(job.benefit_tags),
      };
    })
    .filter((job): job is PublicFrontpageJob => job !== null)
    .sort((a, b) => {
      const timeDifference = Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? "");
      if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  return {
    version: 1,
    jobs: publicJobs,
    benefitLabels: asStringMap(payload.benefitLabels),
  };
}
