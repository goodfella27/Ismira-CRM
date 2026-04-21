import { NextResponse } from "next/server";

import { breezyFetch, requireBreezyIds } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getId(value: { _id?: unknown; id?: unknown } | null | undefined) {
  return asString(value?._id).trim() || asString(value?.id).trim();
}

function normalizeList(payload: unknown) {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (isRecord(payload)) {
    for (const key of ["data", "results", "candidates"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
  }
  return [] as Record<string, unknown>[];
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

async function fetchJson(url: string) {
  const res = await breezyFetch(url);
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  return { res, body };
}

function getBreezyIdsFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyParam = (searchParams.get("companyId") ?? "").trim();
  const positionParam = (searchParams.get("positionId") ?? "").trim();
  if (companyParam && positionParam) {
    return { companyId: companyParam, positionId: positionParam };
  }
  if (companyParam || positionParam) {
    throw new Error("Missing companyId or positionId");
  }
  return requireBreezyIds();
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    await ensureCompanyMembership(admin, user.id);

    const url = new URL(request.url);
    const limit = clampInt(url.searchParams.get("limit"), 0, 25, 10);
    const scan = clampInt(url.searchParams.get("scan"), 10, 300, 120);
    const minDocs = clampInt(url.searchParams.get("minDocs"), 1, 10, 1);
    const docsConcurrency = clampInt(url.searchParams.get("docsConcurrency"), 1, 12, 6);
    const detailsConcurrency = clampInt(url.searchParams.get("detailsConcurrency"), 1, 8, 4);
    const includeDetails = url.searchParams.get("includeDetails") !== "0";

    const { companyId, positionId } = getBreezyIdsFromRequest(request);

    const listUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
      companyId
    )}/position/${encodeURIComponent(positionId)}/candidates`;

    const list = await fetchJson(listUrl);
    if (!list.res.ok) {
      return NextResponse.json(
        { error: "Breezy request failed", status: list.res.status, details: list.body },
        { status: list.res.status }
      );
    }

    const candidates = normalizeList(list.body)
      .map((item) => ({ ...item, __id: getId(item as { _id?: unknown; id?: unknown }) }))
      .filter((item) => (item.__id as string).trim());

    const toCheck = candidates.slice(0, Math.min(candidates.length, scan));

    const docsResults = await mapWithConcurrency(
      toCheck,
      docsConcurrency,
      async (item) => {
        const id = asString((item as Record<string, unknown>).__id).trim();
        const docsUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
          companyId
        )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(id)}/documents`;
        const docsRes = await fetchJson(docsUrl);
        const docsOk = docsRes.res.ok;
        const docs = docsOk && Array.isArray(docsRes.body) ? docsRes.body : [];
        const summary = { ...(item as Record<string, unknown>) };
        delete summary.__id;
        return { id, ok: docsOk, documents: docs, summary };
      }
    );

    const withDocuments = docsResults.filter((r) => {
      const count = Array.isArray(r.documents) ? r.documents.length : 0;
      return count >= minDocs;
    });
    const withDocumentsCount = withDocuments.length;
    const documentsTotal = withDocuments.reduce(
      (sum, r) => sum + (r.documents?.length ?? 0),
      0
    );
    const with2PlusDocuments = docsResults.filter((r) => {
      const count = Array.isArray(r.documents) ? r.documents.length : 0;
      return count > 1;
    }).length;
    const docsFailures = docsResults.filter((r) => !r.ok).length;

    const pickedBase = withDocuments.slice(0, limit);
    const detailsById = new Map<string, Record<string, unknown> | null>();
    if (includeDetails && pickedBase.length > 0) {
      const detailsResults = await mapWithConcurrency(
        pickedBase,
        detailsConcurrency,
        async (item) => {
          const detailsUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
            companyId
          )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(
            item.id
          )}`;
          const detailsRes = await fetchJson(detailsUrl);
          const details =
            detailsRes.res.ok && isRecord(detailsRes.body)
              ? (detailsRes.body as Record<string, unknown>)
              : null;
          return { id: item.id, details };
        }
      );
      for (const row of detailsResults) detailsById.set(row.id, row.details);
    }

    const picked = pickedBase.map((item) => ({
      id: item.id,
      summary: item.summary,
      details: includeDetails ? detailsById.get(item.id) ?? null : null,
      documents: item.documents,
    }));

    return NextResponse.json(
      {
        meta: {
          limit,
          minDocs,
          scanned: toCheck.length,
          candidatesTotal: candidates.length,
          withDocuments: withDocumentsCount,
          with2PlusDocuments,
          documentsTotal,
          docsFailures,
          displayed: picked.length,
          companyId,
          positionId,
          note:
            candidates.length > toCheck.length
              ? "Counts are for the scanned subset. Increase `scan` to cover more candidates."
              : "Counts cover all returned candidates for this position.",
        },
        candidates: picked,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /missing companyid or positionid/i.test(message)
      ? 400
      : /not authenticated/i.test(message)
      ? 401
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
