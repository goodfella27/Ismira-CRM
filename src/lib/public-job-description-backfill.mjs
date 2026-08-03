const BODY_KEYS = [
  "description",
  "job_description",
  "jobDescription",
  "description_html",
  "html",
  "content",
  "body",
];

export function visibleText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasVisibleBody(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  return BODY_KEYS.some((key) => visibleText(details[key]).length > 0);
}

function flattenJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== "object") return [];

  const record = value;
  const graph = Array.isArray(record["@graph"]) ? record["@graph"].flatMap(flattenJsonLd) : [];
  return [record, ...graph];
}

function decodeScriptJson(value) {
  return value
    .replace(/&quot;/gi, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function scrubPublicPostingDescription(html) {
  if (typeof html !== "string") return "";
  let next = html.trim();
  next = next.replace(/<script[\s\S]*?<\/script>/gi, "");
  next = next.replace(/<style[\s\S]*?<\/style>/gi, "");
  next = next.replace(
    /\s*<p[^>]*>\s*You can submit your Resume[\s\S]*?<\/p>/gi,
    ""
  );
  next = next.replace(
    /\s*<p[^>]*>\s*If you are not sure what position to apply for[\s\S]*?<\/p>/gi,
    ""
  );
  next = next.replace(/\s*<p[^>]*>\s*Last updated:?\s*[\s\S]*?<\/p>/gi, "");
  next = next.replace(/https?:\/\/ismira\.breezy\.hr\/p\/[a-z0-9-]*general-application[^\s<"]*/gi, "");
  next = next.replace(/<p[^>]*>\s*<\/p>/gi, "");
  next = next.replace(/(\s*<br\s*\/?>\s*){3,}/gi, "<br><br>");
  return next.trim();
}

export function extractJobPostingDescription(pageHtml) {
  if (typeof pageHtml !== "string" || !pageHtml.trim()) return null;

  const scripts = [
    ...pageHtml.matchAll(
      /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  for (const match of scripts) {
    try {
      const parsed = JSON.parse(decodeScriptJson(match[1].trim()));
      const posting = flattenJsonLd(parsed).find((entry) => {
        const type = entry?.["@type"];
        return Array.isArray(type) ? type.includes("JobPosting") : type === "JobPosting";
      });
      const rawDescription = posting?.description;
      if (typeof rawDescription !== "string") continue;
      const html = scrubPublicPostingDescription(rawDescription);
      const text = visibleText(html);
      if (text) return { html, text };
    } catch {
      // Ignore invalid JSON-LD blocks and keep looking.
    }
  }

  return null;
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildPublicPostingUrl(baseUrl, row) {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Missing source base URL");

  const friendlyId = String(row?.friendly_id ?? "").trim();
  if (friendlyId) return `${base}/p/${encodeURIComponent(friendlyId)}`;

  const positionId = String(row?.breezy_position_id ?? "").trim();
  if (!positionId) throw new Error("Missing position id");

  const slug = slugify(row?.name);
  return `${base}/p/${encodeURIComponent(slug ? `${positionId}-${slug}` : positionId)}`;
}

export function buildBackfilledDetails(row, extracted, sourceUrl, importedAt) {
  const existing =
    row?.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? row.details
      : {};
  const id = String(row?.breezy_position_id ?? "").trim();
  const name = String(row?.name ?? "").trim();
  const friendlyId = String(row?.friendly_id ?? "").trim();
  const company = String(row?.company ?? "").trim();
  const department = String(row?.department ?? "").trim();
  const state = String(row?.state ?? "").trim();
  const orgType = String(row?.org_type ?? "").trim();

  const next = {
    ...existing,
    description: extracted.html,
    html: extracted.html,
    content: extracted.text,
    source_url: sourceUrl,
    imported_from_public_portal_at: importedAt,
  };

  if (id) {
    next._id = id;
    next.id = id;
  }
  if (name) {
    next.name = name;
    next.title = name;
  }
  if (friendlyId) next.friendly_id = friendlyId;
  if (company) next.company = company;
  if (department) next.department = department;
  if (state) next.state = state;
  if (orgType) next.org_type = orgType;

  delete next.jd_content_missing;
  return next;
}
