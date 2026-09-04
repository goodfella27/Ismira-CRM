type PublicJobLinkSource = {
  id: string;
  name?: string;
  company?: string;
};

const PUBLIC_JOB_DETAIL_PARAM = "jd";
const LEGACY_JOB_DETAIL_PARAM = "job";

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPublicIdKey(id: string) {
  const parts = slugify(id)
    .split("-")
    .filter((part) => part && part !== "local");
  return parts.slice(-2).join("-") || parts.join("-") || "job";
}

export function getPublicJobShareSlug(job: PublicJobLinkSource) {
  const title = slugify([job.name, job.company].filter(Boolean).join(" "));
  const key = getPublicIdKey(job.id);
  return [title, key].filter(Boolean).join("-");
}

export function getPublicJobSharePath(job: PublicJobLinkSource, basePath = "/") {
  const params = new URLSearchParams();
  params.set(PUBLIC_JOB_DETAIL_PARAM, getPublicJobShareSlug(job));
  return `${basePath}?${params.toString()}`;
}

export function getPublicJobShareUrl(
  job: PublicJobLinkSource,
  origin: string,
  basePath = "/"
) {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  return `${normalizedOrigin}${getPublicJobSharePath(job, basePath)}`;
}

export function getRequestedPublicJobValue(searchParams: URLSearchParams) {
  return (
    searchParams.get(PUBLIC_JOB_DETAIL_PARAM)?.trim() ||
    searchParams.get(LEGACY_JOB_DETAIL_PARAM)?.trim() ||
    ""
  );
}

export function resolvePublicJobId(value: string, jobs: PublicJobLinkSource[]) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const decoded = decodeURIComponent(trimmed);
  const normalized = decoded.toLowerCase();
  const direct = jobs.find((job) => job.id === decoded);
  if (direct) return direct.id;

  const bySlug = jobs.find((job) => getPublicJobShareSlug(job).toLowerCase() === normalized);
  return bySlug?.id ?? null;
}
