function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseHiddenOverride(value) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function displayNameForDuplicate(row) {
  const overrides = isRecord(row?.overrides) ? row.overrides : {};
  return asString(overrides.name) || asString(row?.name) || asString(row?.breezy_position_id);
}

export function buildDuplicatePositionInsert({
  row,
  companyId,
  breezyCompanyId,
  duplicateId,
}) {
  const rawOverrides = isRecord(row?.overrides) ? row.overrides : {};
  const nextName = `${displayNameForDuplicate(row)} (Copy)`;

  return {
    company_id: companyId,
    breezy_company_id: breezyCompanyId,
    breezy_position_id: duplicateId,
    name: row?.name ?? null,
    state: row?.state ?? null,
    friendly_id: row?.friendly_id ?? null,
    org_type: row?.org_type ?? null,
    company: row?.company ?? null,
    department: row?.department ?? null,
    details: row?.details ?? null,
    overrides: {
      ...rawOverrides,
      name: nextName,
      hidden: true,
    },
    synced_at: row?.synced_at ?? null,
    details_synced_at: row?.details_synced_at ?? null,
  };
}

export function buildDuplicatePositionListItem(insert) {
  const overrides = isRecord(insert?.overrides) ? insert.overrides : {};
  const overrideCompany = asString(overrides.company);
  const overrideDepartment = asString(overrides.department);
  const overridePriority = asString(overrides.priority);
  const name = asString(overrides.name) || asString(insert?.name) || asString(insert?.breezy_position_id);

  return {
    id: asString(insert?.breezy_position_id),
    name,
    state: asString(insert?.state) || undefined,
    friendly_id: asString(insert?.friendly_id) || undefined,
    org_type: asString(insert?.org_type) || undefined,
    company: overrideCompany || asString(insert?.company) || undefined,
    department: overrideDepartment || asString(insert?.department) || undefined,
    priority: overridePriority || undefined,
    edited: Object.keys(overrides).length > 0,
    hidden: parseHiddenOverride(overrides.hidden),
    synced_at: insert?.synced_at ?? null,
    details_synced_at: insert?.details_synced_at ?? null,
  };
}
