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
  priority_style: "orange" | "sky" | "violet" | "emerald";
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
  urgentTitle: string;
  interviewJobs: PublicFrontpageJob[];
  interviewsTitle: string;
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

function asBoolean(value: unknown) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
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

function isUrgentOpeningType(type: UnknownRecord) {
  const key = normalizePriorityKey(asString(type.key));
  const label = normalizePriorityKey(asString(type.label));
  return key === "urgent-opening" || label === "urgent-opening";
}

const DEFAULT_INTERVIEWS_TITLE = "UPCOMING INTERVIEWS WITH CRUISE EMPLOYERS";
const DEFAULT_URGENT_TITLE = "Hot Jobs";

function toPublicJob(
  job: UnknownRecord,
  origin: string,
  priorityDisplay?: { label: string; style: PublicFrontpageJob["priority_style"] }
): PublicFrontpageJob | null {
  const id = asString(job.id);
  const name = asString(job.name);
  const state = asString(job.state).toLowerCase();
  const orgType = asString(job.org_type).toLowerCase();
  if (!id || !name) return null;
  if (state && state !== "published") return null;
  if (orgType === "pool") return null;

  const shipTypes = asStringArray(job.ship_types);
  const fallbackShipType = asString(job.ship_type);
  if (shipTypes.length === 0 && fallbackShipType) shipTypes.push(fallbackShipType);

  const normalizedOrigin = origin.replace(/\/+$/, "");
  const priority = normalizePriorityKey(asString(job.priority));

  return {
    id,
    ...(asString(job.view_id) ? { view_id: asString(job.view_id) } : {}),
    name,
    ...(asString(job.company) ? { company: asString(job.company) } : {}),
    ...(asString(job.department) ? { department: asString(job.department) } : {}),
    priority,
    priority_label: priorityDisplay?.label ?? (asString(job.priority_label) || "Interview"),
    priority_style: priorityDisplay?.style ?? "sky",
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
}

function sortPublicJobs(jobs: PublicFrontpageJob[]) {
  return [...jobs].sort((a, b) => {
    const timeDifference = Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? "");
    if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
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

  const visiblePriorityLabels = new Map<string, { label: string; style: PublicFrontpageJob["priority_style"] }>();
  const visiblePriorityTypes = priorityTypes
    .filter((type) => type.showOnFrontpage === true)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  for (const type of visiblePriorityTypes) {
    if (!isUrgentOpeningType(type)) continue;
    const key = normalizePriorityKey(asString(type.key));
    const label = asString(type.label);
    if (key && label) {
      visiblePriorityLabels.set(key, {
        label,
        style: "orange",
      });
    }
  }

  const publicJobs = sortPublicJobs(
    jobs
    .map((job): PublicFrontpageJob | null => {
      const priority = normalizePriorityKey(asString(job.priority));
      const priorityDisplay = visiblePriorityLabels.get(priority);
      if (!priorityDisplay?.label) return null;
      return toPublicJob(job, origin, priorityDisplay);
    })
    .filter((job): job is PublicFrontpageJob => job !== null)
  );

  const interviewJobs = sortPublicJobs(
    jobs
      .filter((job) => asBoolean(job.show_on_ismira_web))
      .map((job) => toPublicJob(job, origin))
      .filter((job): job is PublicFrontpageJob => job !== null)
  );
  const interviewsTitle =
    jobs
      .map((job) => (asBoolean(job.show_on_ismira_web) ? asString(job.ismira_web_title) : ""))
      .find(Boolean) || DEFAULT_INTERVIEWS_TITLE;

  return {
    version: 1,
    jobs: publicJobs,
    urgentTitle: DEFAULT_URGENT_TITLE,
    interviewJobs,
    interviewsTitle,
    benefitLabels: asStringMap(payload.benefitLabels),
  };
}
