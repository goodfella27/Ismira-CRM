"use client";

export type CompanyBranding = {
  title: string;
  logoUrl: string | null;
};

let cached: CompanyBranding | null = null;
let inflight: Promise<CompanyBranding> | null = null;

export function invalidateCompanyBrandingCache() {
  cached = null;
  inflight = null;
}

export async function getCompanyBranding(): Promise<CompanyBranding> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = fetch("/api/company/branding", { cache: "no-store" })
    .then(async (res) => {
      const data = (await res.json().catch(() => null)) as
        | (Partial<CompanyBranding> & { error?: unknown })
        | null;
      if (!res.ok) {
        const maybeError =
          typeof data?.error === "string" && data.error.trim()
            ? data.error.trim()
            : null;
        throw new Error(maybeError ?? "Failed to load branding.");
      }
      const result: CompanyBranding = {
        title: typeof data?.title === "string" && data.title.trim() ? data.title.trim() : "ISMIRA CRM",
        logoUrl: typeof data?.logoUrl === "string" ? data.logoUrl : null,
      };
      cached = result;
      return result;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
