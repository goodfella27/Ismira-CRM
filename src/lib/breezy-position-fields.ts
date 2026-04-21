export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    const parts = value.map((item) => asTrimmedString(item)).filter(Boolean);
    return Array.from(new Set(parts)).join(", ");
  }
  if (isRecord(value)) {
    for (const key of ["name", "label", "title", "value", "text"]) {
      const picked = asTrimmedString(value[key]);
      if (picked) return picked;
    }
  }
  return "";
}

export function getFirstTextField(
  payload: Record<string, unknown> | null,
  keys: string[]
) {
  if (!payload) return "";
  for (const key of keys) {
    const value = payload[key];
    const text = asTrimmedString(value);
    if (text) return text;
  }
  return "";
}

function normalizeCustomAttributes(details: Record<string, unknown>) {
  const buckets: unknown[] = [];
  for (const key of ["custom_attributes", "customAttributes", "custom_fields", "customFields"]) {
    const value = details[key];
    if (Array.isArray(value)) buckets.push(...value);
    else if (isRecord(value) && Array.isArray(value.items)) buckets.push(...value.items);
  }

  const entries: Array<{ name: string; value: unknown }> = [];
  for (const item of buckets) {
    if (!isRecord(item)) continue;
    const name = asTrimmedString(item.name ?? item.label ?? item.key ?? item.field ?? item.id);
    if (!name) continue;
    const value = item.value ?? item.values ?? item.selected ?? item.option ?? item.data;
    entries.push({ name, value });
  }
  return entries;
}

function findCustomValue(details: Record<string, unknown>, patterns: RegExp[]) {
  const entries = normalizeCustomAttributes(details);
  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (!patterns.some((rx) => rx.test(name))) continue;
    const text = asTrimmedString(entry.value);
    if (text) return text;
  }
  return "";
}

export function extractDepartment(details: Record<string, unknown> | null) {
  if (!details) return "";
  const direct = getFirstTextField(details, [
    "department",
    "department_name",
    "departmentName",
    "category",
    "team",
    "function",
    "division",
  ]);
  if (direct) return direct;

  const custom = findCustomValue(details, [
    /department/i,
    /\bdept\b/i,
    /division/i,
    /team/i,
    /function/i,
  ]);
  return custom;
}

export function inferCompanyFromPositionName(value: unknown) {
  const title = asTrimmedString(value);
  if (!title) return "";

  const cleaned = title.replace(/^[^A-Za-z0-9]+/, "").trim();
  if (!cleaned) return "";

  const parts = cleaned.split(/\s[-–—]\s/);
  if (parts.length < 2) return "";

  const prefix = parts[0]?.trim() ?? "";
  if (prefix.length < 2 || prefix.length > 80) return "";
  return prefix;
}

export function extractCompany(details: Record<string, unknown> | null) {
  if (!details) return "";
  const direct = getFirstTextField(details, [
    "company",
    "company_name",
    "companyName",
    "client",
    "client_name",
    "clientName",
    "employer",
    "employer_name",
    "employerName",
    "brand",
    "brand_name",
    "brandName",
    "property",
    "property_name",
    "propertyName",
    "ship",
    "ship_name",
    "shipName",
    "vessel",
    "vessel_name",
    "vesselName",
  ]);
  if (direct) return direct;

  const custom = findCustomValue(details, [
    /company/i,
    /client/i,
    /employer/i,
    /brand/i,
    /property/i,
    /hotel/i,
    /ship/i,
    /vessel/i,
    /cruise/i,
  ]);
  if (custom) return custom;

  const titleLike = getFirstTextField(details, ["name", "title", "position", "role"]);
  const inferred = inferCompanyFromPositionName(titleLike);
  if (inferred) return inferred;

  const rawLocation =
    details.locations ??
    details.location ??
    details.office_location ??
    details.officeLocation ??
    null;
  const locationText = asTrimmedString(rawLocation);
  if (locationText) {
    const first = locationText.split(",")[0]?.trim() ?? "";
    if (first) return first;
  }

  // Last resort: take the first part of location_name-like fields.
  const locationLike = getFirstTextField(details, [
    "location_name",
    "locationName",
    "location_label",
    "locationLabel",
  ]);
  if (locationLike) return locationLike.split(",")[0]?.trim() ?? "";

  return "";
}

export function extractOrgType(details: Record<string, unknown> | null) {
  if (!details) return "";
  const raw = asTrimmedString(details.org_type ?? details.orgType ?? details.organization_type);
  const normalized = raw.toLowerCase();
  if (normalized === "position" || normalized === "pool") return normalized;
  return raw;
}
