import { getOpeningTypeColor } from "./opening-type-colors";
import { getCountryLabel } from "./country";
import { getPriorityWebsiteTitle, humanizePriorityKey, normalizePriorityKey } from "./breezy-priority-types";
import { buildPublicPositionDescription } from "./breezy-position-description";
import { getPublicJobShareUrl } from "./public-job-links";

type UnknownRecord = Record<string, unknown>;

export type PublicFrontpageJob = {
  id: string;
  view_id?: string;
  name: string;
  company?: string;
  department?: string;
  priority: string;
  priority_label: string;
  priority_style: "orange" | "sky" | "violet" | "pink";
  company_logo_url?: string;
  application_url?: string;
  details_url: string;
  updated_at?: string;
  ship_types: string[];
  benefit_tags: string[];
};

export type PublicFrontpageJobsPayload = {
  version: 1;
  sections: PublicFrontpageJobSection[];
  jobs: PublicFrontpageJob[];
  urgentTitle: string;
  interviewJobs: PublicFrontpageJob[];
  interviewsTitle: string;
  benefitLabels: Record<string, string>;
};

export type PublicFrontpageJobSection = {
  key: string;
  title: string;
  style: PublicFrontpageJob["priority_style"];
  jobs: PublicFrontpageJob[];
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
      name: getCountryLabel(asString(country.code), asString(country.name)),
    }))
    .filter((country) => country.code && country.name);
}

const DEFAULT_INTERVIEWS_TITLE = "UPCOMING INTERVIEWS WITH CRUISE EMPLOYERS";

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
  if (state !== "published" || asBoolean(job.not_active)) return null;
  if (orgType === "pool") return null;

  const shipTypes = asStringArray(job.ship_types);
  const fallbackShipType = asString(job.ship_type);
  if (shipTypes.length === 0 && fallbackShipType) shipTypes.push(fallbackShipType);

  const priority = normalizePriorityKey(asString(job.priority));

  const publicJob = {
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
    ...(asString(job.updated_at) ? { updated_at: asString(job.updated_at) } : {}),
    ship_types: shipTypes,
    benefit_tags: asStringArray(job.benefit_tags),
  };

  return {
    ...publicJob,
    details_url: getPublicJobShareUrl(publicJob, origin),
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
    description_html: buildPublicPositionDescription(source),
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

  const orderedTypes = [...priorityTypes].sort((a, b) =>
    Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || asString(a.label).localeCompare(asString(b.label))
  );
  const typeByKey = new Map(orderedTypes.map(type => [normalizePriorityKey(asString(type.key)), type]));
  const sectionsByKey = new Map<string, PublicFrontpageJobSection>();
  const seenJobs = new Set<string>();
  for (const job of jobs) {
    if (!asBoolean(job.show_on_ismira_web)) continue;
    const priority = normalizePriorityKey(asString(job.priority));
    const type = typeByKey.get(priority);
    const label = asString(type?.label) || humanizePriorityKey(priority) || "Other Openings";
    const style = getOpeningTypeColor(priority, [{ key: priority, label }]);
    const publicJob = toPublicJob(job, origin, { label, style });
    if (!publicJob) continue;
    const identity = publicJob.view_id || publicJob.id;
    if (seenJobs.has(identity)) continue;
    seenJobs.add(identity);
    const key = priority || "other-openings";
    let section = sectionsByKey.get(key);
    if (!section) {
      section = { key, title: getPriorityWebsiteTitle({ label, websiteTitle: asString(type?.websiteTitle) }), style, jobs: [] };
      sectionsByKey.set(key, section);
    }
    section.jobs.push(publicJob);
  }
  const configuredKeys = orderedTypes.map(type => normalizePriorityKey(asString(type.key)));
  const sectionKeys = Array.from(new Set([...configuredKeys, ...sectionsByKey.keys()]));
  const sections = sectionKeys.flatMap(key => {
    const section = sectionsByKey.get(key);
    return section ? [{ ...section, jobs: sortPublicJobs(section.jobs) }] : [];
  });

  return {
    version: 1,
    sections,
    // Flat fields keep older embeds usable during deployment and cache refreshes.
    jobs: sections.flatMap(section => section.jobs),
    urgentTitle: "Job Openings",
    interviewJobs: [],
    interviewsTitle: DEFAULT_INTERVIEWS_TITLE,
    benefitLabels: asStringMap(payload.benefitLabels),
  };
}
