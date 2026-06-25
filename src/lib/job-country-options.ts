import { COUNTRY_OPTIONS, canonicalizeCountry, getCountryCode } from "@/lib/country";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type JobCountryOption = {
  code: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
};

type JobCountryOptionRow = {
  code: string | null;
  name: string | null;
  sort_order: number | null;
  enabled: boolean | null;
};

const DEFAULT_COUNTRY_CODES = [
  "LT",
  "LV",
  "EE",
  "PL",
  "MD",
  "KZ",
  "KG",
  "UZ",
  "AM",
  "GE",
  "AZ",
  "TJ",
  "TM",
  "UA",
  "RU",
  "BY",
];

const COUNTRY_NAME_BY_CODE = new Map<string, string>(
  COUNTRY_OPTIONS.map((item) => [item.code, item.name])
);

export const DEFAULT_JOB_COUNTRY_OPTIONS: JobCountryOption[] = DEFAULT_COUNTRY_CODES.map(
  (code, index) => ({
    code,
    name: COUNTRY_NAME_BY_CODE.get(code) ?? canonicalizeCountry(code) ?? code,
    sortOrder: index,
    enabled: true,
  })
);

export function normalizeCountryCode(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const code = getCountryCode(raw) ?? raw;
  return /^[a-z]{2}$/i.test(code) ? code.toUpperCase() : "";
}

export function normalizeCountryName(value: unknown, code?: string) {
  const raw = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (raw) return raw;
  const normalizedCode = normalizeCountryCode(code);
  return normalizedCode
    ? COUNTRY_NAME_BY_CODE.get(normalizedCode) ?? canonicalizeCountry(normalizedCode) ?? normalizedCode
    : "";
}

export function normalizeCountryOptions(value: unknown): JobCountryOption[] {
  if (!Array.isArray(value)) return DEFAULT_JOB_COUNTRY_OPTIONS;
  const seen = new Set<string>();
  const options: JobCountryOption[] = [];

  value.forEach((item, index) => {
    const row =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    const code = normalizeCountryCode(row.code || row.name);
    const name = normalizeCountryName(row.name, code);
    if (!code || !name || seen.has(code)) return;
    seen.add(code);
    options.push({
      code,
      name,
      sortOrder:
        typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder) ? row.sortOrder : index,
      enabled: row.enabled !== false,
    });
  });

  return options.length > 0 ? options : DEFAULT_JOB_COUNTRY_OPTIONS;
}

export async function fetchJobCountryOptions(admin: AdminClient, companyId: string) {
  const { data, error } = await admin
    .from("job_country_options")
    .select("code,name,sort_order,enabled")
    .eq("company_id", companyId)
    .eq("enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (/job_country_options|schema cache|does not exist/i.test(error.message ?? "")) {
      return DEFAULT_JOB_COUNTRY_OPTIONS;
    }
    throw new Error(error.message ?? "Failed to load job country options");
  }

  const rows = Array.isArray(data) ? (data as JobCountryOptionRow[]) : [];
  if (rows.length === 0) return DEFAULT_JOB_COUNTRY_OPTIONS;

  const saved = rows
    .map((row, index) => {
      const code = normalizeCountryCode(row.code);
      const name = normalizeCountryName(row.name, code);
      if (!code || !name) return null;
      return {
        code,
        name,
        sortOrder: typeof row.sort_order === "number" ? row.sort_order : index,
        enabled: row.enabled !== false,
      } satisfies JobCountryOption;
    })
    .filter((item): item is JobCountryOption => Boolean(item));

  return saved.length > 0 ? saved : DEFAULT_JOB_COUNTRY_OPTIONS;
}
