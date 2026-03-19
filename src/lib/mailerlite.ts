const MAILERLITE_BASE_URL = "https://connect.mailerlite.com/api";

type CachedKey = { value: string | null; fetchedAt: number };

let cachedKey: CachedKey | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateMailerLiteApiKeyCache() {
  cachedKey = null;
}

async function getMailerLiteApiKeyFromDb() {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

  const admin = createSupabaseAdminClient();
  const { data: companyRow } = await admin
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const companyId = companyRow?.id as string | undefined;
  if (!companyId) return null;

  const { data } = await admin
    .from("company_integrations")
    .select("mailerlite_api_key")
    .eq("company_id", companyId)
    .maybeSingle();

  const key = (data?.mailerlite_api_key as string | null)?.trim() ?? "";
  return key || null;
}

async function getMailerLiteApiKey() {
  if (cachedKey && Date.now() - cachedKey.fetchedAt < CACHE_TTL_MS) {
    if (cachedKey.value) return cachedKey.value;
  }

  const value = await getMailerLiteApiKeyFromDb().catch(() => null);
  cachedKey = { value, fetchedAt: Date.now() };
  if (value) return value;

  const envKey = process.env.MAILERLITE_API_KEY?.trim() ?? "";
  if (envKey) return envKey;

  throw new Error("Missing MailerLite API key. Set it in Company → Integrations.");
}

export async function getMailerLiteHeaders(extra?: HeadersInit) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${await getMailerLiteApiKey()}`,
    ...extra,
  } satisfies HeadersInit;
}

export async function mailerliteFetch(pathOrUrl: string, init?: RequestInit) {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${MAILERLITE_BASE_URL}${pathOrUrl}`;

  return fetch(url, {
    cache: "no-store",
    ...init,
    headers: await getMailerLiteHeaders(init?.headers),
  });
}
