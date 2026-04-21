const BREEZY_BASE_URL = "https://api.breezy.hr/v3";

type BreezyToken = {
  token: string;
  tokenType?: string;
  expiresAt: number;
};

let tokenCache: BreezyToken | null = null;

export function getBreezyEnv() {
  const email = process.env.BREEZY_EMAIL;
  const password = process.env.BREEZY_PASSWORD;
  const apiToken = process.env.BREEZY_API_TOKEN;
  const companyId = process.env.BREEZY_COMPANY_ID;
  const positionId = process.env.BREEZY_POSITION_ID;

  return { email, password, apiToken, companyId, positionId };
}

function buildAuthHeader(token: string, tokenType?: string) {
  if (tokenType) return `${tokenType} ${token}`;
  if (token.startsWith("Bearer ")) return token;
  return token;
}

async function requestTokenWithBasic(email: string, password: string) {
  const basic = Buffer.from(`${email}:${password}`).toString("base64");
  const res = await fetch(`${BREEZY_BASE_URL}/signin`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
  });

  const data = await res.json().catch(() => null);
  return { res, data };
}

async function requestTokenWithBody(email: string, password: string) {
  const res = await fetch(`${BREEZY_BASE_URL}/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => null);
  return { res, data };
}

async function getBreezyToken() {
  const { email, password, apiToken } = getBreezyEnv();

  if (apiToken) {
    return {
      token: apiToken,
      expiresAt: Date.now() + 1000 * 60 * 60,
    } satisfies BreezyToken;
  }

  if (!email || !password) {
    throw new Error("Missing Breezy credentials");
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + 1000 * 60) {
    return tokenCache;
  }

  const basicAttempt = await requestTokenWithBasic(email, password);
  if (basicAttempt.res.ok) {
    const token =
      basicAttempt.data?.access_token ??
      basicAttempt.data?.token ??
      basicAttempt.data?.data?.access_token;
    const tokenType =
      basicAttempt.data?.token_type ??
      basicAttempt.data?.type ??
      undefined;

    if (!token) {
      throw new Error("Breezy signin response missing access token");
    }

    tokenCache = {
      token,
      tokenType: tokenType ?? undefined,
      expiresAt: Date.now() + 1000 * 60 * 30,
    };

    return tokenCache;
  }

  const bodyAttempt = await requestTokenWithBody(email, password);
  if (!bodyAttempt.res.ok) {
    const message =
      bodyAttempt.data?.message ||
      bodyAttempt.data?.error ||
      "Breezy signin failed";
    throw new Error(message);
  }

  const token =
    bodyAttempt.data?.access_token ??
    bodyAttempt.data?.token ??
    bodyAttempt.data?.data?.access_token;
  const tokenType = bodyAttempt.data?.token_type ?? bodyAttempt.data?.type ?? undefined;

  if (!token) {
    throw new Error("Breezy signin response missing access token");
  }

  tokenCache = {
    token,
    tokenType: tokenType ?? undefined,
    expiresAt: Date.now() + 1000 * 60 * 30,
  };

  return tokenCache;
}

export async function breezyFetch(pathOrUrl: string, init?: RequestInit) {
  const tokenInfo = await getBreezyToken();
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${BREEZY_BASE_URL}${pathOrUrl}`;

  const headers: HeadersInit = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: buildAuthHeader(tokenInfo.token, tokenInfo.tokenType),
    ...(init?.headers ?? {}),
  };

  let res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers,
  });

  if (
    res.status === 401 &&
    !tokenInfo.tokenType &&
    !tokenInfo.token.startsWith("Bearer ")
  ) {
    res = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: {
        ...headers,
        Authorization: `Bearer ${tokenInfo.token}`,
      },
    });
  }

  return res;
}

export function requireBreezyIds() {
  const { companyId, positionId } = getBreezyEnv();
  if (!companyId || !positionId) {
    throw new Error("Missing BREEZY_COMPANY_ID or BREEZY_POSITION_ID");
  }
  return { companyId, positionId };
}

export function requireBreezyCompanyId() {
  const { companyId } = getBreezyEnv();
  if (!companyId) {
    throw new Error("Missing BREEZY_COMPANY_ID");
  }
  return { companyId };
}

type BreezySearchResult = {
  candidates: Record<string, unknown>[];
  candidateId: string | null;
  error?: { status: number; message: string; details?: unknown };
};

function extractCandidates(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.candidates)) return obj.candidates;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return [] as unknown[];
}

export async function findCandidatesByEmail(
  email: string,
  companyId: string
): Promise<BreezySearchResult> {
  const encoded = encodeURIComponent(email);
  const attempts: Array<{ method: string; url: string; body?: unknown }> = [
    {
      method: "GET",
      url: `${BREEZY_BASE_URL}/company/${companyId}/candidates/search?email_address=${encoded}`,
    },
    {
      method: "GET",
      url: `${BREEZY_BASE_URL}/company/${companyId}/candidates/search?email=${encoded}`,
    },
    {
      method: "GET",
      url: `${BREEZY_BASE_URL}/company/${companyId}/candidates?email_address=${encoded}`,
    },
    {
      method: "GET",
      url: `${BREEZY_BASE_URL}/company/${companyId}/candidates?email=${encoded}`,
    },
    {
      method: "POST",
      url: `${BREEZY_BASE_URL}/company/${companyId}/candidates/search`,
      body: { email_address: email },
    },
    {
      method: "POST",
      url: `${BREEZY_BASE_URL}/company/${companyId}/candidates/search`,
      body: { email },
    },
  ];

  let lastError: BreezySearchResult["error"];

  for (const attempt of attempts) {
    const res = await breezyFetch(attempt.url, {
      method: attempt.method,
      body: attempt.body ? JSON.stringify(attempt.body) : undefined,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json() : await res.text();

    if (res.ok) {
      const candidates = extractCandidates(body) as Record<string, unknown>[];
      const first = candidates[0];
      const candidateId =
        (first?._id as string | undefined) ?? (first?.id as string | undefined);
      return { candidates, candidateId: candidateId ?? null };
    }

    if ([400, 404, 405].includes(res.status)) {
      lastError = {
        status: res.status,
        message: "Breezy search attempt failed",
        details: body,
      };
      continue;
    }

    throw new Error(
      typeof body === "string"
        ? body
        : (body as { message?: string })?.message ?? "Breezy search failed"
    );
  }

  return { candidates: [], candidateId: null, error: lastError };
}
