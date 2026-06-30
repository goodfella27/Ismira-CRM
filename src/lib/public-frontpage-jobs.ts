import { normalizePriorityKey } from "./breezy-priority-types";
import { pickPositionDescription } from "./breezy-position-description";

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

export type PublicFrontpageJobDetails = {
  version: 1;
  id: string;
  name: string;
  company?: string;
  department?: string;
  company_logo_url?: string;
  description_html: string;
  ship_types: string[];
  benefit_tags: string[];
  processable_countries: Array<{ code: string; name: string }>;
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

function asCountryRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((country) => ({
      code: asString(country.code).toUpperCase(),
      name: asString(country.name),
    }))
    .filter((country) => country.code && country.name);
}

export function buildPublicFrontpageJobDetails(
  source: unknown,
  positionId: string
): PublicFrontpageJobDetails | null {
  if (!isRecord(source) || source.not_active === true) return null;

  const id = asString(source.id) || asString(source._id) || positionId.trim();
  const name = asString(source.name);
  if (!id || !name) return null;

  const shipTypes = asStringArray(source.ship_types);
  const fallbackShipType = asString(source.ship_type);
  if (shipTypes.length === 0 && fallbackShipType) shipTypes.push(fallbackShipType);

  const nationalityCountries = isRecord(source.nationality_countries)
    ? source.nationality_countries
    : {};

  return {
    version: 1,
    id,
    name,
    ...(asString(source.company) ? { company: asString(source.company) } : {}),
    ...(asString(source.department) ? { department: asString(source.department) } : {}),
    ...(asString(source.company_logo_url)
      ? { company_logo_url: asString(source.company_logo_url) }
      : {}),
    description_html: pickPositionDescription(source),
    ship_types: shipTypes,
    benefit_tags: asStringArray(source.benefit_tags),
    processable_countries: asCountryRows(nationalityCountries.processable),
  };
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
