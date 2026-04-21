import { NextResponse } from "next/server";

import { breezyFetch, findCandidatesByEmail, requireBreezyCompanyId } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeBreezyDocuments } from "@/lib/breezy-documents";

export const runtime = "nodejs";

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function extractEmailFromCandidate(value: unknown) {
  if (!isRecord(value)) return "";
  const profile = isRecord(value.profile) ? (value.profile as Record<string, unknown>) : null;
  const contact = isRecord(value.contact) ? (value.contact as Record<string, unknown>) : null;
  return pickFirstString(
    value.email_address,
    value.email,
    value.emailAddress,
    profile?.email,
    profile?.email_address,
    contact?.email,
    contact?.email_address
  );
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

function extractExtraDocuments(details: Record<string, unknown> | null) {
  if (!details) return [] as Record<string, unknown>[];
  const keys = ["documents", "files", "attachments", "e_documents", "eDocuments", "edocuments"];
  const out: Record<string, unknown>[] = [];
  for (const key of keys) {
    const value = details[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item)) out.push(item);
      }
    }
  }
  return out;
}

type BreezyPosition = {
  _id?: unknown;
  id?: unknown;
  name?: unknown;
  state?: unknown;
  org_type?: unknown;
};

function getId(value: { _id?: unknown; id?: unknown } | null | undefined) {
  return asString(value?._id).trim() || asString(value?.id).trim();
}

function normalizePositions(payload: unknown): BreezyPosition[] {
  if (Array.isArray(payload)) return payload as BreezyPosition[];
  if (isRecord(payload)) {
    for (const key of ["data", "results", "positions"]) {
      const value = payload[key];
      if (Array.isArray(value)) return value as BreezyPosition[];
    }
  }
  return [];
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

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    await ensureCompanyMembership(admin, user.id);

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") ?? "").trim();
    const positionId = (searchParams.get("positionId") ?? "").trim();
    const companyParam = (searchParams.get("companyId") ?? "").trim();
    const companyId = companyParam || requireBreezyCompanyId().companyId;
    const minDocs = clampInt(searchParams.get("minDocs"), 1, 10, 2);
    const maxCandidates = clampInt(searchParams.get("limit"), 1, 10, 5);
    const locate = (searchParams.get("locate") ?? "1").trim() !== "0";
    const locateMaxPositions = clampInt(searchParams.get("locateMaxPositions"), 10, 400, 400);
    const locateConcurrency = clampInt(searchParams.get("locateConcurrency"), 1, 10, 4);

    if (!query) {
      return NextResponse.json({ error: "Missing q" }, { status: 400 });
    }
    if (!positionId) {
      return NextResponse.json({ error: "Missing positionId" }, { status: 400 });
    }

    // Currently supports email search (best signal).
    const email = query.includes("@") ? query : "";
    if (!email) {
      return NextResponse.json(
        { error: "Search currently supports email (must include @)." },
        { status: 400 }
      );
    }

    // Prefer searching within the selected position, because company-wide search can return
    // candidates that do not belong to this position (and then documents endpoint returns 404).
    let candidates: Record<string, unknown>[] = [];
    try {
      const listUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
        companyId
      )}/position/${encodeURIComponent(positionId)}/candidates`;
      const listRes = await fetchJson(listUrl);
      if (listRes.res.ok) {
        const list = normalizeList(listRes.body);
        const wanted = email.trim().toLowerCase();
        const matches = list.filter((row) => {
          const rowEmail = extractEmailFromCandidate(row).trim().toLowerCase();
          return rowEmail && rowEmail === wanted;
        });
        candidates = matches.slice(0, maxCandidates);
      }
    } catch {
      candidates = [];
    }

    if (candidates.length === 0) {
      const search = await findCandidatesByEmail(email, companyId);
      candidates = (search.candidates ?? []).slice(0, maxCandidates);
    }

    let positionsCache:
      | Array<{ id: string; name: string; state?: string; org_type?: string }>
      | null = null;
    const loadPositions = async () => {
      if (positionsCache) return positionsCache;
      const listUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(companyId)}/positions`;
      const res = await fetchJson(listUrl);
      if (!res.res.ok) return [];
      const list = normalizePositions(res.body)
        .map((pos) => ({
          id: getId(pos),
          name: asString(pos.name).trim() || "Position",
          state: asString(pos.state).trim() || undefined,
          org_type: asString(pos.org_type).trim() || undefined,
        }))
        .filter((pos) => pos.id);
      positionsCache = list;
      return list;
    };

    type LocatedCandidatePosition = {
      positionId: string;
      positionName?: string;
      docs: Record<string, unknown>[];
      status: number;
    };

    const locateCandidatePosition = async (
      candidateId: string
    ): Promise<LocatedCandidatePosition | null> => {
      const positions = await loadPositions();
      const toScan = positions.slice(0, Math.min(positions.length, locateMaxPositions));

      type ScanResult = LocatedCandidatePosition & { ok: boolean; docsCount: number };
      const scanned = await mapWithConcurrency<{
        id: string;
        name: string;
        state?: string;
        org_type?: string;
      }, ScanResult>(toScan, locateConcurrency, async (pos) => {
        const docsUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
          companyId
        )}/position/${encodeURIComponent(pos.id)}/candidate/${encodeURIComponent(
          candidateId
        )}/documents`;
        const res = await fetchJson(docsUrl);
        const docs = res.res.ok ? normalizeBreezyDocuments(res.body) : [];
        return {
          positionId: pos.id,
          positionName: pos.name,
          docs,
          status: res.res.status,
          ok: res.res.ok,
          docsCount: docs.length,
        };
      });

      let best: ScanResult | null = null;
      for (const result of scanned) {
        if (!best) {
          best = result;
          continue;
        }

        if (result.ok && result.docsCount > best.docsCount) {
          best = result;
          continue;
        }

        if (result.ok && result.docsCount >= minDocs && best.docsCount < result.docsCount) {
          best = result;
        }
      }

      if (!best) return null;
      return best.status === 200
        ? { positionId: best.positionId, positionName: best.positionName, docs: best.docs, status: best.status }
        : null;
    };

    const results: Array<{
      id: string;
      name?: string;
      email?: string;
      documentsCount: number;
      meetsMinDocs: boolean;
      details?: Record<string, unknown> | null;
      documents?: Record<string, unknown>[];
      docsStatus?: number;
      positionId?: string;
      positionName?: string;
      located?: boolean;
    }> = [];

    for (const item of candidates) {
      const breezyCandidateId =
        asString((item as Record<string, unknown>)._id).trim() ||
        asString((item as Record<string, unknown>).id).trim();
      if (!breezyCandidateId) continue;

      const docsUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
        companyId
      )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(
        breezyCandidateId
      )}/documents`;
      const initialDocsRes = await fetchJson(docsUrl);
      let docsOk = initialDocsRes.res.ok;
      let docsStatus = initialDocsRes.res.status;
      let baseDocs = docsOk ? normalizeBreezyDocuments(initialDocsRes.body) : [];
      let effectivePositionId = positionId;
      let effectivePositionName: string | undefined;
      let located = false;

      if (locate && (!docsOk || baseDocs.length === 0)) {
        const found = await locateCandidatePosition(breezyCandidateId);
        if (found && found.docs.length > 0) {
          effectivePositionId = found.positionId;
          effectivePositionName = found.positionName;
          located = effectivePositionId !== positionId;
          docsOk = true;
          docsStatus = found.status;
          baseDocs = found.docs;
        }
      }

      let details: Record<string, unknown> | null = null;
      try {
        const detailsUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
          companyId
        )}/position/${encodeURIComponent(effectivePositionId)}/candidate/${encodeURIComponent(
          breezyCandidateId
        )}`;
        const detailsRes = await fetchJson(detailsUrl);
        details = detailsRes.res.ok && isRecord(detailsRes.body) ? detailsRes.body : null;
      } catch {
        details = null;
      }
      if (!details && isRecord(item)) {
        // Fall back to whatever Breezy returned from search/list so we can still import basic profile data
        // even if position-scoped candidate details are unavailable.
        details = item;
      }

      const extraDocs = docsOk ? extractExtraDocuments(details) : [];
      const docs = baseDocs.length > 0 ? baseDocs : extraDocs;
      const documentsCount = docs.length;

      const meetsMinDocs = docsOk && documentsCount >= minDocs;

      const name =
        asString((item as Record<string, unknown>).name).trim() ||
        asString((item as Record<string, unknown>).full_name).trim() ||
        asString((item as Record<string, unknown>).fullName).trim() ||
        undefined;
      const candidateEmail =
        asString((item as Record<string, unknown>).email_address).trim() ||
        asString((item as Record<string, unknown>).email).trim() ||
        undefined;

      results.push({
        id: breezyCandidateId,
        name,
        email: candidateEmail,
        documentsCount,
        meetsMinDocs,
        details,
        documents: docs,
        docsStatus,
        positionId: effectivePositionId,
        positionName: effectivePositionName,
        located,
      });
    }

    return NextResponse.json(
      {
        meta: {
          query,
          companyId,
          positionId,
          minDocs,
          returned: results.length,
        },
        candidates: results,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
