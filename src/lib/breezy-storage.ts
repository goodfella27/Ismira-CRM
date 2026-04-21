export const BREEZY_COMPANY_STORAGE_KEY = "breezy.companyId";
export const BREEZY_POSITION_STORAGE_KEY = "breezy.positionId";

export function loadBreezyCompanyId(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(BREEZY_COMPANY_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function saveBreezyCompanyId(companyId: string): void {
  if (typeof window === "undefined") return;
  const value = companyId.trim();
  if (!value) return;
  try {
    window.localStorage.setItem(BREEZY_COMPANY_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

export function loadBreezyPositionId(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(BREEZY_POSITION_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function saveBreezyPositionId(positionId: string): void {
  if (typeof window === "undefined") return;
  const value = positionId.trim();
  if (!value) return;
  try {
    window.localStorage.setItem(BREEZY_POSITION_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}
