function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function getBreezyPublicBaseUrl() {
  const env =
    (process.env.NEXT_PUBLIC_BREEZY_PUBLIC_BASE_URL ?? "").trim() ||
    (process.env.BREEZY_PUBLIC_BASE_URL ?? "").trim();
  const normalized = normalizeBaseUrl(env);
  return normalized || "https://ismira.breezy.hr";
}

export function buildBreezyPublicPositionUrl(friendlyId: string, baseUrl?: string) {
  const slug = (friendlyId ?? "").trim();
  if (!slug) return "";
  if (/^https?:\/\//i.test(slug)) return slug;
  const base = normalizeBaseUrl((baseUrl ?? "").trim() || getBreezyPublicBaseUrl());
  return `${base}/p/${encodeURIComponent(slug)}`;
}

