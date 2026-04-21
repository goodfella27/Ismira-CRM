type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function normalizeBreezyDocuments(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload)) return payload as UnknownRecord[];
  if (isRecord(payload)) {
    for (const key of ["data", "results", "documents"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value as UnknownRecord[];
    }
  }
  return [];
}

export function extractBreezyDocumentId(doc: UnknownRecord): string {
  return pickFirstString(
    doc._id,
    doc.id,
    doc.document_id,
    doc.documentId,
    doc.file_id,
    doc.fileId,
    doc.uuid,
    doc.uid,
    doc.name,
    doc.filename,
    doc.file_name,
    doc.fileName,
    doc.url,
    doc.download_url,
    doc.downloadUrl
  );
}

export function extractBreezyDocumentName(doc: UnknownRecord): string {
  const file = isRecord(doc.file) ? (doc.file as UnknownRecord) : null;
  return pickFirstString(
    doc.name,
    doc.filename,
    doc.file_name,
    doc.fileName,
    file?.name,
    file?.filename,
    file?.file_name,
    file?.fileName
  );
}

export function extractBreezyDocumentMime(doc: UnknownRecord): string {
  const file = isRecord(doc.file) ? (doc.file as UnknownRecord) : null;
  return pickFirstString(
    doc.mime,
    doc.content_type,
    doc.contentType,
    doc.type,
    file?.mime,
    file?.content_type,
    file?.contentType,
    file?.type
  );
}

export function extractBreezyDocumentCreatedAt(doc: UnknownRecord): string {
  return pickFirstString(doc.created_at, doc.createdAt, doc.added_at, doc.addedAt);
}

export function extractBreezyDocumentCreatedBy(doc: UnknownRecord): string {
  const createdBy =
    isRecord(doc.created_by) || isRecord(doc.createdBy)
      ? ((doc.created_by ?? doc.createdBy) as UnknownRecord)
      : null;
  return pickFirstString(
    doc.created_by,
    doc.createdBy,
    createdBy?._id,
    createdBy?.id,
    createdBy?.name,
    createdBy?.email
  );
}

export function extractBreezyDocumentDownloadUrl(doc: UnknownRecord): string {
  const file = isRecord(doc.file) ? (doc.file as UnknownRecord) : null;
  const links = isRecord(doc.links) ? (doc.links as UnknownRecord) : null;

  const direct = pickFirstString(
    doc.url,
    doc.file_url,
    doc.fileUrl,
    doc.download_url,
    doc.downloadUrl,
    doc.downloadURL,
    doc.link,
    doc.href,
    doc.signed_url,
    doc.signedUrl,
    doc.source_url,
    doc.sourceUrl,
    doc.preview_url,
    doc.previewUrl
  );
  if (direct) return direct;

  const fileUrl = pickFirstString(
    file?.url,
    file?.file_url,
    file?.fileUrl,
    file?.download_url,
    file?.downloadUrl,
    file?.downloadURL,
    file?.link,
    file?.href,
    file?.signed_url,
    file?.signedUrl,
    file?.source_url,
    file?.sourceUrl
  );
  if (fileUrl) return fileUrl;

  const linkUrl = pickFirstString(
    links?.download,
    links?.download_url,
    links?.downloadUrl,
    links?.url,
    links?.href
  );
  if (linkUrl) return linkUrl;

  const deep = findFirstUrlLikeValue(doc);
  return deep;
}

export function ensureAbsoluteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Breezy sometimes returns protocol-less URLs.
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return trimmed;
}

export function toBreezyFetchTarget(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (trimmed.startsWith("/v3/")) return trimmed.slice(3);
  return trimmed;
}

export function safeFileName(value: string, fallback = "document") {
  const name = value.trim() || fallback;
  const cleaned = name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 180);
  return cleaned || fallback;
}

function isUrlLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^\/\//.test(trimmed)) return true;
  if (/^\/(v3\/)?company\//.test(trimmed)) return true;
  return false;
}

function findFirstUrlLikeValue(value: unknown, depth = 0): string {
  if (depth > 4) return "";
  if (typeof value === "string") return isUrlLike(value) ? value.trim() : "";
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findFirstUrlLikeValue(entry, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (!isRecord(value)) return "";

  const obj = value as UnknownRecord;
  const preferredKeys = [
    "downloadUrl",
    "download_url",
    "signedUrl",
    "signed_url",
    "fileUrl",
    "file_url",
    "url",
    "href",
    "link",
    "sourceUrl",
    "source_url",
    "previewUrl",
    "preview_url",
  ];
  for (const key of preferredKeys) {
    if (!(key in obj)) continue;
    const found = findFirstUrlLikeValue(obj[key], depth + 1);
    if (found) return found;
  }

  for (const key of Object.keys(obj)) {
    const found = findFirstUrlLikeValue(obj[key], depth + 1);
    if (found) return found;
  }

  return "";
}
