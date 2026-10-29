export const COMPANY_WEBSITE_VISIBILITY_KEY = "job_company_show_all_on_ismira_web";

export function getCompanyWebsiteVisibility(metadata: unknown): boolean {
  return !!metadata && typeof metadata === "object" && !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>)[COMPANY_WEBSITE_VISIBILITY_KEY] === true;
}

/** Company inclusion never writes or replaces a JD's individual selection. */
export function resolveWebsiteVisibility(individualSelection: unknown, metadata: unknown): boolean {
  return individualSelection === true || getCompanyWebsiteVisibility(metadata);
}
