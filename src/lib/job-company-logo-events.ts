export const JOB_COMPANY_LOGOS_CHANGED_EVENT = "job-company-logos-changed";
export const JOB_COMPANY_LOGOS_CHANGED_KEY = "job-company-logos:changed-at";

export function notifyJobCompanyLogosChanged() {
  if (typeof window === "undefined") return;

  const timestamp = String(Date.now());
  try {
    window.localStorage.setItem(JOB_COMPANY_LOGOS_CHANGED_KEY, timestamp);
  } catch {
    // Best-effort cross-tab notification.
  }

  window.dispatchEvent(new CustomEvent(JOB_COMPANY_LOGOS_CHANGED_EVENT));
}

export function getJobCompanyLogosChangedAt() {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number(window.localStorage.getItem(JOB_COMPANY_LOGOS_CHANGED_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function subscribeJobCompanyLogosChanged(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleLocalEvent = () => callback();
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key !== JOB_COMPANY_LOGOS_CHANGED_KEY) return;
    callback();
  };

  window.addEventListener(JOB_COMPANY_LOGOS_CHANGED_EVENT, handleLocalEvent);
  window.addEventListener("storage", handleStorageEvent);

  return () => {
    window.removeEventListener(JOB_COMPANY_LOGOS_CHANGED_EVENT, handleLocalEvent);
    window.removeEventListener("storage", handleStorageEvent);
  };
}
