function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseHidden(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => asString(item)).filter(Boolean))
  );
}

function setString(target, key, value) {
  const text = asString(value);
  if (text) target[key] = text;
}

function hasJdBodyContent(details) {
  return [
    "description",
    "description_html",
    "description_text",
    "job_description",
    "content",
    "html",
    "responsibilities",
    "responsibilities_html",
    "responsibilities_text",
    "requirements",
    "requirements_html",
    "requirements_text",
  ].some((key) => asString(details?.[key]));
}

/**
 * @param {{ row: Record<string, any> | null | undefined, companies?: string[] }} input
 */
export function buildSupabasePositionDetails({ row, companies = [] }) {
  const base = isRecord(row?.details) ? { ...row.details } : {};
  const overrides = isRecord(row?.overrides) ? row.overrides : {};

  setString(base, "id", base.id || base._id || row?.breezy_position_id);
  setString(base, "_id", base._id || base.id || row?.breezy_position_id);
  setString(base, "name", base.name || base.title || row?.name);
  setString(base, "title", base.title || base.name || row?.name);
  setString(base, "state", base.state || row?.state);
  setString(base, "friendly_id", base.friendly_id || row?.friendly_id);
  setString(base, "org_type", base.org_type || row?.org_type);
  setString(base, "company", base.company || row?.company);
  setString(base, "department", base.department || row?.department);

  for (const key of [
    "name",
    "company",
    "department",
    "priority",
    "location_name",
    "summary",
    "description",
    "requirements",
    "responsibilities",
    "ismira_web_title",
  ]) {
    setString(base, key, overrides[key]);
  }

  if (Array.isArray(overrides.benefit_tags)) {
    base.benefit_tags = overrides.benefit_tags;
  }
  if (Array.isArray(overrides.processable_country_codes)) {
    base.processable_country_codes = overrides.processable_country_codes;
  }
  if (overrides.show_on_ismira_web === true) {
    base.show_on_ismira_web = true;
  } else if (Object.prototype.hasOwnProperty.call(overrides, "show_on_ismira_web")) {
    delete base.show_on_ismira_web;
  }

  const hidden = parseHidden(overrides.hidden);
  if (hidden === true) base.hidden = true;
  if (hidden === false) delete base.hidden;

  if (asString(base.location_name)) {
    base.locationName = asString(base.location_name);
    base.location_label = asString(base.location_name);
  }

  const linkedCompanies = normalizeStringList(companies);
  if (linkedCompanies.length > 0) {
    base.companies = linkedCompanies;
  } else if (asString(base.company)) {
    base.companies = [asString(base.company)];
  }

  if (!hasJdBodyContent(base)) {
    base.jd_content_missing = true;
  } else {
    delete base.jd_content_missing;
  }

  return base;
}
