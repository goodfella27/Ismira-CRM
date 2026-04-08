const HUBSPOT_BASE_URL = "https://api.hubapi.com";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type CachedToken = { value: string | null; fetchedAt: number };

let cachedToken: CachedToken | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateHubspotAccessTokenCache() {
  cachedToken = null;
}

export function getHubspotPrivateAppTokenFromEnv() {
  return (process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? "").trim();
}

export function getHubspotAccessTokenFromEnv() {
  return (
    (process.env.HUBSPOT_PRIVATE_APP_TOKEN ?? "").trim() ||
    (process.env.HUBSPOT_ACCESS_TOKEN ?? "").trim()
  );
}

async function getHubspotAccessTokenFromDb() {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const { getPrimaryCompanyId } = await import("@/lib/company/primary");

  const admin = createSupabaseAdminClient();
  const companyId = await getPrimaryCompanyId(admin);

  const { data } = await admin
    .from("company_integrations")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  const raw = (data as Record<string, unknown> | null)?.hubspot_private_app_token;
  const token = typeof raw === "string" ? raw.trim() : "";
  return token || null;
}

async function getHubspotAccessToken() {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < CACHE_TTL_MS) {
    if (cachedToken.value) return cachedToken.value;
  }

  const dbToken = await getHubspotAccessTokenFromDb().catch(() => null);
  if (dbToken) {
    cachedToken = { value: dbToken, fetchedAt: Date.now() };
    return dbToken;
  }

  const envToken = getHubspotAccessTokenFromEnv();
  cachedToken = { value: envToken || null, fetchedAt: Date.now() };
  if (envToken) return envToken;

  throw new Error(
    "Missing HubSpot access token. Set HUBSPOT_PRIVATE_APP_TOKEN (recommended) or configure it in Company → Integrations."
  );
}

export async function hubspotApiJson(
  token: string,
  pathOrUrl: string,
  init?: RequestInit
) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${HUBSPOT_BASE_URL}${pathOrUrl}`;
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : null),
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");
  return { res, body };
}

export async function hubspotFetchJson<T = unknown>(
  pathOrUrl: string,
  init?: RequestInit
): Promise<T> {
  const token = await getHubspotAccessToken();

  const { res, body } = await hubspotApiJson(token, pathOrUrl, init);
  if (!res.ok) {
    const message = isRecord(body)
      ? (body.message as string | undefined) ||
        (body.error as string | undefined) ||
        "HubSpot request failed"
      : typeof body === "string"
      ? body
      : "HubSpot request failed";
    const err = new Error(message);
    (err as Error & { status?: number; details?: unknown }).status = res.status;
    (err as Error & { status?: number; details?: unknown }).details = body;
    throw err;
  }

  return body as T;
}

export function extractAssociationIds(payload: unknown, key: string) {
  if (!isRecord(payload)) return [] as string[];
  const associations = payload.associations;
  if (!isRecord(associations)) return [] as string[];
  const node = associations[key];
  if (!isRecord(node)) return [] as string[];
  const results = node.results;
  if (!Array.isArray(results)) return [] as string[];
  return results
    .map((item) => {
      if (!isRecord(item)) return "";
      const id = item.id;
      if (typeof id === "string") return id;
      if (typeof id === "number") return String(id);
      return "";
    })
    .filter(Boolean);
}

const chunk = <T,>(items: T[], size: number) => {
  const safeSize = Math.max(1, Math.min(500, Math.floor(size)));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) chunks.push(items.slice(i, i + safeSize));
  return chunks;
};

export async function hubspotBatchRead(
  token: string,
  objectType: "contacts" | "deals" | "tickets" | "notes" | string,
  ids: string[],
  properties: string[]
) {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (unique.length === 0) return [] as Record<string, unknown>[];

  const batches = chunk(unique, 100);
  const results: Record<string, unknown>[] = [];

  for (const batch of batches) {
    const { res, body } = await hubspotApiJson(
      token,
      `/crm/v3/objects/${encodeURIComponent(objectType)}/batch/read`,
      {
        method: "POST",
        body: JSON.stringify({
          properties,
          inputs: batch.map((id) => ({ id })),
        }),
      }
    );

    if (!res.ok) {
      const message = isRecord(body)
        ? (body.message as string | undefined) || "HubSpot batch read failed"
        : "HubSpot batch read failed";
      const err = new Error(message);
      (err as Error & { status?: number; details?: unknown }).status = res.status;
      (err as Error & { status?: number; details?: unknown }).details = body;
      throw err;
    }

    if (isRecord(body) && Array.isArray(body.results)) {
      for (const item of body.results) {
        if (isRecord(item)) results.push(item);
      }
    }
  }

  return results;
}
