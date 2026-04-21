"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
  loadBreezyCompanyId,
  loadBreezyPositionId,
  saveBreezyCompanyId,
  saveBreezyPositionId,
} from "@/lib/breezy-storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type BreezyCandidateWithDocs = {
  id: string;
  summary: Record<string, unknown>;
  details: Record<string, unknown> | null;
  documents: unknown[];
};

type ImportedCandidateRow = {
  id: string;
  name: string;
  email?: string;
  pipeline_id?: string | null;
  stage_id?: string | null;
  attachmentCount: number;
  noteCount: number;
};

type PipelineRow = { id: string; name: string | null };

type CandidatesMeta = {
  minDocs?: number;
  scanned: number;
  candidatesTotal: number;
  withDocuments: number;
  with2PlusDocuments?: number;
  documentsTotal: number;
  displayed: number;
  note?: string;
};

type CachedPositionsResponse = {
  positions: Array<{ id: string; name: string; state?: string; org_type?: string }>;
  warning?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
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

export default function BreezyCandidatesPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BreezyCandidateWithDocs[]>([]);
  const [meta, setMeta] = useState<CandidatesMeta | null>(null);
  const [importedCandidates, setImportedCandidates] = useState<ImportedCandidateRow[]>([]);
  const [importedMeta, setImportedMeta] = useState<{
    returned: number;
    withDocuments: number;
    with2PlusDocuments: number;
    withNotes: number;
  } | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [breezyCompanyId, setBreezyCompanyId] = useState("");
  const [positions, setPositions] = useState<CachedPositionsResponse["positions"]>([]);
  const [positionsWarning, setPositionsWarning] = useState<string | null>(null);
  const [positionId, setPositionId] = useState("");
  const [minDocs, setMinDocs] = useState(2);
  const [scan, setScan] = useState(120);
  const [positionDocCounts, setPositionDocCounts] = useState<Record<string, number>>({});
  const [positionCountsMeta, setPositionCountsMeta] = useState<{
    loading: boolean;
    done: number;
    total: number;
    error?: string;
  } | null>(null);
  const countsAbortRef = useRef<AbortController | null>(null);
  const didMountRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      name?: string;
      email?: string;
      documentsCount: number;
      meetsMinDocs: boolean;
      details?: Record<string, unknown> | null;
      documents?: unknown[];
      docsStatus?: number;
      positionId?: string;
      positionName?: string;
      located?: boolean;
    }>
  >([]);

  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string }>>([]);
  const [pipelineId, setPipelineId] = useState("breezy");

  const loadPositions = useCallback(async (nextCompanyId: string): Promise<string> => {
    const id = nextCompanyId.trim();
    if (!id) {
      setPositions([]);
      setPositionsWarning(null);
      setPositionDocCounts({});
      setPositionCountsMeta(null);
      return "";
    }

    const res = await fetch(`/api/breezy/positions-cache?companyId=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as CachedPositionsResponse | null;
    if (!res.ok) {
      const message = (data as unknown as { error?: unknown } | null)?.error;
      throw new Error(typeof message === "string" ? message : "Failed to load positions.");
    }
    const list = Array.isArray(data?.positions) ? data!.positions : [];
    const filtered = list
      .filter((pos) => (asString(pos.state).trim() ? asString(pos.state).trim() === "published" : true))
      .filter((pos) => asString(pos.org_type).trim().toLowerCase() !== "pool");
    setPositions(filtered);
    setPositionsWarning(typeof data?.warning === "string" ? data.warning : null);

    const saved = loadBreezyPositionId();
    const savedValid = saved && filtered.some((pos) => pos.id === saved);
    const fallback = filtered[0]?.id ?? "";
    const nextPosition = (savedValid ? saved : fallback).trim();
    setPositionId(nextPosition);
    if (nextPosition) saveBreezyPositionId(nextPosition);
    return nextPosition;
  }, []);

  const load = useCallback(async (opts?: { companyId?: string; positionId?: string }) => {
    setError(null);
    setLoading(true);
    try {
      const company = (opts?.companyId ?? breezyCompanyId).trim();
      const position = (opts?.positionId ?? positionId).trim();
      if (!company || !position) {
        throw new Error("Select a Breezy company and position first.");
      }

      // Always load DB-imported candidates for this position (fast and reliable).
      try {
        const importedRes = await fetch(
          `/api/breezy/imported-candidates?companyId=${encodeURIComponent(
            company
          )}&positionId=${encodeURIComponent(position)}&limit=50`,
          { cache: "no-store" }
        );
        const importedData = await importedRes.json().catch(() => null);
        if (importedRes.ok && Array.isArray(importedData?.candidates)) {
          setImportedCandidates(importedData.candidates as ImportedCandidateRow[]);
          setImportedMeta(
            importedData?.meta && typeof importedData.meta === "object"
              ? {
                  returned: Number(importedData.meta.returned) || 0,
                  withDocuments: Number(importedData.meta.withDocuments) || 0,
                  with2PlusDocuments: Number(importedData.meta.with2PlusDocuments) || 0,
                  withNotes: Number(importedData.meta.withNotes) || 0,
                }
              : null
          );
        } else {
          setImportedCandidates([]);
          setImportedMeta(null);
        }
      } catch {
        setImportedCandidates([]);
        setImportedMeta(null);
      }

      const res = await fetch(
        `/api/breezy/candidates-with-attachments?limit=10&scan=${encodeURIComponent(
          String(scan)
        )}&minDocs=${encodeURIComponent(String(minDocs))}&companyId=${encodeURIComponent(
          company
        )}&positionId=${encodeURIComponent(position)}`,
        {
          cache: "no-store",
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const status = typeof data?.status === "number" ? ` (status ${data.status})` : "";
        const details =
          typeof data?.details === "string"
            ? `: ${data.details}`
            : data?.details
            ? `: ${JSON.stringify(data.details)}`
            : "";
        throw new Error(
          `${data?.error ?? "Failed to load candidates."}${status}${details}`
        );
      }
      const list = Array.isArray(data?.candidates) ? (data.candidates as BreezyCandidateWithDocs[]) : [];
      setItems(list);
      setMeta(
        data?.meta && typeof data.meta === "object"
          ? {
              minDocs: Number(data.meta.minDocs) || minDocs,
              scanned: Number(data.meta.scanned) || 0,
              candidatesTotal: Number(data.meta.candidatesTotal) || 0,
              withDocuments: Number(data.meta.withDocuments) || 0,
              with2PlusDocuments: Number(data.meta.with2PlusDocuments) || 0,
              documentsTotal: Number(data.meta.documentsTotal) || 0,
              displayed: Number(data.meta.displayed) || list.length,
              note: typeof data.meta.note === "string" ? data.meta.note : undefined,
            }
          : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates.");
      setItems([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [breezyCompanyId, minDocs, positionId, scan]);

  useEffect(() => {
    const savedCompanyId = loadBreezyCompanyId();
    const savedPositionId = loadBreezyPositionId();
    if (savedCompanyId) setBreezyCompanyId(savedCompanyId);
    if (savedPositionId) setPositionId(savedPositionId);

    if (!savedCompanyId) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const resolvedPositionId = await loadPositions(savedCompanyId);
        if (!resolvedPositionId) {
          setLoading(false);
          return;
        }
        await load({ companyId: savedCompanyId, positionId: resolvedPositionId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load candidates.");
        setItems([]);
        setLoading(false);
      }
    })();
  }, [load, loadPositions]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const { data, error: pipelinesError } = await supabase
          .from("pipelines")
          .select("id,name")
          .order("created_at", { ascending: true });
        if (pipelinesError) throw new Error(pipelinesError.message);
        const rows = (Array.isArray(data) ? (data as PipelineRow[]) : []).filter(
          (row) => typeof row.id === "string" && row.id.trim()
        );
        const list = rows.map((row) => ({
          id: row.id,
          name: row.name?.trim() || row.id,
        }));
        if (mounted) setPipelines(list);
        if (mounted && !list.some((p) => p.id === pipelineId) && list[0]?.id) {
          setPipelineId(list[0].id);
        }
      } catch {
        if (mounted) setPipelines([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [pipelineId, supabase]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!breezyCompanyId.trim() || !positionId.trim()) return;
    void load({ companyId: breezyCompanyId, positionId });
  }, [breezyCompanyId, load, minDocs, positionId, scan]);

  const countsCacheKey = useCallback(
    (companyId: string) => `breezy_position_doc_counts:${companyId}:minDocs:${minDocs}`,
    [minDocs]
  );

  const hydrateCountsFromCache = useCallback(
    (companyId: string, posIds: string[]) => {
      try {
        const raw = localStorage.getItem(countsCacheKey(companyId));
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        const countsSource =
          isRecord(parsed) && isRecord(parsed.counts) ? (parsed.counts as Record<string, unknown>) : parsed;
        const out: Record<string, number> = {};
        if (isRecord(countsSource)) {
          for (const id of posIds) {
            const value = countsSource[id];
            if (typeof value === "number" && Number.isFinite(value)) out[id] = value;
          }
        }
        return out;
      } catch {
        return {};
      }
    },
    [countsCacheKey]
  );

  const persistCountsToCache = useCallback(
    (companyId: string, next: Record<string, number>) => {
      try {
        localStorage.setItem(countsCacheKey(companyId), JSON.stringify({ updatedAt: Date.now(), counts: next }));
      } catch {
        // ignore
      }
    },
    [countsCacheKey]
  );

  const refreshPositionCounts = useCallback(
    async (companyId: string, posIds: string[]) => {
      const company = companyId.trim();
      if (!company || posIds.length === 0) return;

      countsAbortRef.current?.abort();
      const abort = new AbortController();
      countsAbortRef.current = abort;

      setPositionCountsMeta({ loading: true, done: 0, total: posIds.length });

      const cached = hydrateCountsFromCache(company, posIds);
      if (Object.keys(cached).length > 0) {
        setPositionDocCounts(cached);
      } else {
        setPositionDocCounts({});
      }

      let done = 0;
      const nextCounts: Record<string, number> = { ...cached };

      try {
        await mapWithConcurrency(posIds, 2, async (posId) => {
          if (abort.signal.aborted) return;
          try {
            const res = await fetch(
              `/api/breezy/candidates-with-attachments?limit=0&includeDetails=0&scan=${encodeURIComponent(
                String(Math.min(120, scan))
              )}&minDocs=${encodeURIComponent(String(minDocs))}&companyId=${encodeURIComponent(
                company
              )}&positionId=${encodeURIComponent(posId)}`,
              { cache: "no-store", signal: abort.signal }
            );
            const data = await res.json().catch(() => null);
            const count = res.ok ? Number(data?.meta?.withDocuments) || 0 : 0;
            if (!abort.signal.aborted) {
              nextCounts[posId] = count;
              setPositionDocCounts((prev) => ({ ...prev, [posId]: count }));
              persistCountsToCache(company, nextCounts);
            }
          } finally {
            done += 1;
            if (!abort.signal.aborted) {
              setPositionCountsMeta((prev) =>
                prev ? { ...prev, done } : { loading: true, done, total: posIds.length }
              );
            }
          }
        });

        if (!abort.signal.aborted) {
          setPositionCountsMeta((prev) => (prev ? { ...prev, loading: false } : null));
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          setPositionCountsMeta({
            loading: false,
            done,
            total: posIds.length,
            error: err instanceof Error ? err.message : "Failed to count candidates.",
          });
        }
      }
    },
    [hydrateCountsFromCache, minDocs, persistCountsToCache, scan]
  );

  useEffect(() => {
    const company = breezyCompanyId.trim();
    if (!company || positions.length === 0) {
      setPositionCountsMeta(null);
      setPositionDocCounts({});
      return;
    }
    const ids = positions.map((p) => p.id).filter(Boolean);
    setPositionDocCounts(hydrateCountsFromCache(company, ids));
    setPositionCountsMeta(null);
  }, [breezyCompanyId, hydrateCountsFromCache, minDocs, positions]);

  const handleAdd = useCallback(async (item: (typeof cards)[number]) => {
    const id = asString(item?.id).trim();
    if (!id) return;
    setAddingId(id);
    setError(null);
    try {
      const res = await fetch("/api/breezy/candidates-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: id,
          pipelineId,
          companyId: breezyCompanyId,
          positionId,
          details: item?.details ?? null,
          documents: item?.documents ?? null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const status = typeof data?.status === "number" ? ` (status ${data.status})` : "";
        const details =
          typeof data?.details === "string"
            ? `: ${data.details}`
            : data?.details
            ? `: ${JSON.stringify(data.details)}`
            : "";
        throw new Error(`${data?.error ?? "Failed to add to pipeline."}${status}${details}`);
      }
      const internalId = asString(data?.candidate?.id).trim();
      setAdded((prev) => ({ ...prev, [id]: internalId || "added" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to pipeline.");
    } finally {
      setAddingId(null);
    }
  }, [breezyCompanyId, pipelineId, positionId]);

  const handleSearch = useCallback(async () => {
    setSearchError(null);
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const company = breezyCompanyId.trim();
      const position = positionId.trim();
      const query = searchQuery.trim();
      if (!company || !position) throw new Error("Select a Breezy company and position first.");
      if (!query) throw new Error("Enter an email to search.");

      const res = await fetch(
        `/api/breezy/candidate-search?q=${encodeURIComponent(query)}&companyId=${encodeURIComponent(
          company
        )}&positionId=${encodeURIComponent(position)}&minDocs=${encodeURIComponent(
          String(minDocs)
        )}&limit=10`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Search failed.");

      const list = Array.isArray(data?.candidates) ? data.candidates : [];
      setSearchResults(
        list
          .map((row) => {
            if (!isRecord(row)) return null;
            const id = asString(row.id).trim();
            if (!id) return null;
            return {
              id,
              name: asString(row.name).trim() || undefined,
              email: asString(row.email).trim() || undefined,
              documentsCount: Number(row.documentsCount) || 0,
              meetsMinDocs: Boolean((row as Record<string, unknown>).meetsMinDocs ?? (row as Record<string, unknown>).canImport),
              details: isRecord(row.details) ? (row.details as Record<string, unknown>) : null,
              documents: Array.isArray(row.documents) ? row.documents : undefined,
              docsStatus: typeof row.docsStatus === "number" ? row.docsStatus : undefined,
              positionId: asString(row.positionId).trim() || undefined,
              positionName: asString(row.positionName).trim() || undefined,
              located: Boolean(row.located),
          };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
      );
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearchLoading(false);
    }
  }, [breezyCompanyId, minDocs, positionId, searchQuery]);

  const handleImportFromSearch = useCallback(
    async (candidate: (typeof searchResults)[number]) => {
      const id = asString(candidate?.id).trim();
      if (!id) return;
      setAddingId(id);
      setError(null);
      try {
        const res = await fetch("/api/breezy/candidates-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateId: id,
            pipelineId,
            companyId: breezyCompanyId,
            positionId: candidate?.positionId ?? positionId,
            details: candidate?.details ?? null,
            documents: candidate?.documents ?? null,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const status = typeof data?.status === "number" ? ` (status ${data.status})` : "";
          const details =
            typeof data?.details === "string"
              ? `: ${data.details}`
              : data?.details
              ? `: ${JSON.stringify(data.details)}`
              : "";
          throw new Error(`${data?.error ?? "Failed to add to pipeline."}${status}${details}`);
        }
        const internalId = asString(data?.candidate?.id).trim();
        setAdded((prev) => ({ ...prev, [id]: internalId || "added" }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add to pipeline.");
      } finally {
        setAddingId(null);
      }
    },
    [breezyCompanyId, pipelineId, positionId]
  );

  const cards = useMemo(() => {
    return items.map((item) => {
      const details = item.details ?? {};
      const name = pickFirstString(
        (details as Record<string, unknown>).name,
        (details as Record<string, unknown>).full_name,
        (details as Record<string, unknown>).fullName,
        (item.summary as Record<string, unknown>).name,
        item.id
      );
      const email = pickFirstString(
        (details as Record<string, unknown>).email_address,
        (details as Record<string, unknown>).email,
        (item.summary as Record<string, unknown>).email,
        (item.summary as Record<string, unknown>).email_address
      );
      const docsCount = Array.isArray(item.documents) ? item.documents.length : 0;
      return { ...item, __name: name || item.id, __email: email, __docsCount: docsCount };
    });
  }, [items]);

  return (
    <div className="min-h-screen bg-slate-50 px-2 py-10 text-slate-900 sm:px-4 lg:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">
              Breezy
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
              Candidates with attachments
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Shows 10 Breezy candidates for the selected position that have at least{" "}
              <span className="font-semibold text-slate-900">{minDocs}</span> documents, and lets you add them to the internal pipeline.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-60"
            onClick={async () => {
              setSyncing(true);
              try {
                await load({ companyId: breezyCompanyId, positionId });
              } finally {
                setSyncing(false);
              }
            }}
            disabled={loading || syncing}
          >
            <RefreshCw className={loading || syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Breezy companyId
                </div>
                <input
                  value={breezyCompanyId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setBreezyCompanyId(value);
                    if (value.trim()) saveBreezyCompanyId(value);
                  }}
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none"
                  placeholder="e.g. 5f0..."
                />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Min docs
                    </div>
                    <select
                      className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none"
                      value={String(minDocs)}
                      onChange={(event) =>
                        setMinDocs(Math.max(1, Math.min(10, Number(event.target.value) || 2)))
                      }
                    >
                      <option value="1">1+</option>
                      <option value="2">2+</option>
                      <option value="3">3+</option>
                      <option value="4">4+</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Scan
                    </div>
                    <input
                      value={String(scan)}
                      onChange={(event) =>
                        setScan(Math.max(10, Math.min(300, Number(event.target.value) || 120)))
                      }
                      className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Import pipeline
                  </div>
                  <select
                    className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none"
                    value={pipelineId}
                    onChange={(event) => setPipelineId(event.target.value)}
                  >
                    {pipelines.length === 0 ? (
                      <option value={pipelineId}>{pipelineId}</option>
                    ) : (
                      pipelines.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Position
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none"
                    value={positionId}
                    onChange={(event) => {
                      const next = event.target.value;
                      setPositionId(next);
                      saveBreezyPositionId(next);
                      if (next.trim() && breezyCompanyId.trim()) {
                        void load({ companyId: breezyCompanyId, positionId: next });
                      }
                    }}
                  >
                    <option value="">Select a position</option>
                    {positions.map((pos) => (
                      <option key={pos.id} value={pos.id}>
                        {pos.name}
                        {Object.prototype.hasOwnProperty.call(positionDocCounts, pos.id)
                          ? ` (${positionDocCounts[pos.id] ?? 0})`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    disabled={!breezyCompanyId.trim()}
                    onClick={async () => {
                      setSyncing(true);
                      try {
                        const resolved = await loadPositions(breezyCompanyId);
                        if (resolved) {
                          await load({ companyId: breezyCompanyId, positionId: resolved });
                        }
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to load positions.");
                      } finally {
                        setSyncing(false);
                      }
                    }}
                  >
                    Load positions
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-60"
                    disabled={
                      !breezyCompanyId.trim() ||
                      positions.length === 0 ||
                      Boolean(positionCountsMeta?.loading)
                    }
                    onClick={() =>
                      void refreshPositionCounts(
                        breezyCompanyId,
                        positions.map((p) => p.id).filter(Boolean)
                      )
                    }
                  >
                    {positionCountsMeta?.loading ? "Counting..." : `Count docs≥${minDocs}`}
                  </button>
                </div>
                {positionsWarning ? (
                  <div className="mt-2 text-xs text-amber-600">{positionsWarning}</div>
                ) : null}
                {positions.length > 0 && Object.keys(positionDocCounts).length === 0 && !positionCountsMeta ? (
                  <div className="mt-2 text-xs text-slate-500">
                    Tip: click{" "}
                    <span className="font-semibold text-slate-900">Count docs≥{minDocs}</span>{" "}
                    to show Breezy (scanned) counts next to each position.
                  </div>
                ) : null}
                {positionCountsMeta ? (
                  <div className="mt-2 text-xs text-slate-600">
                    Breezy counts (docs≥{minDocs}):{" "}
                    <span className="font-semibold text-slate-900">{positionCountsMeta.done}</span>{" "}
                    / <span className="font-semibold text-slate-900">{positionCountsMeta.total}</span>
                    {positionCountsMeta.loading ? " (loading…)" : ""}
                    {positionCountsMeta.error ? (
                      <span className="ml-2 text-rose-600">{positionCountsMeta.error}</span>
                    ) : null}
                  </div>
                ) : null}
                {meta ? (
                  <div className="mt-2 text-xs text-slate-600">
                    Breezy (selected position):{" "}
                    <span className="font-semibold text-slate-900">{meta.withDocuments}</span>{" "}
                    candidates with docs≥{meta.minDocs ?? minDocs} (docs:{" "}
                    <span className="font-semibold text-slate-900">{meta.documentsTotal}</span>, scanned{" "}
                    <span className="font-semibold text-slate-900">{meta.scanned}</span> /{" "}
                    <span className="font-semibold text-slate-900">{meta.candidatesTotal}</span>)
                  </div>
                ) : null}
                {importedMeta ? (
                  <div className="mt-1 text-xs text-slate-600">
                    In DB:{" "}
                    <span className="font-semibold text-slate-900">
                      {importedMeta.withDocuments}
                    </span>{" "}
                    candidates with documents (2+ docs:{" "}
                    <span className="font-semibold text-slate-900">
                      {importedMeta.with2PlusDocuments}
                    </span>
                    , notes:{" "}
                    <span className="font-semibold text-slate-900">
                      {importedMeta.withNotes}
                    </span>
                    )
                  </div>
                ) : null}
                {meta?.note ? (
                  <div className="mt-1 text-[11px] text-slate-500">{meta.note}</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search candidate (Breezy)
            </div>
            <div className="mt-1 text-sm text-slate-700">
              Search by email for the selected position and import to the pipeline.
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none"
                placeholder="email@example.com"
              />
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-60"
                onClick={() => void handleSearch()}
                disabled={
                  searchLoading ||
                  !searchQuery.trim() ||
                  !breezyCompanyId.trim() ||
                  !positionId.trim()
                }
              >
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </div>
            {searchError ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {searchError}
              </div>
            ) : null}
            {searchResults.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {searchResults.map((cand) => {
                  const isAdding = addingId === cand.id;
                  const internalId = added[cand.id] ?? "";
                  const disabled = isAdding || !!internalId;
                  return (
                    <div
                      key={`search-${cand.id}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4"
                    >
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {cand.name || cand.email || cand.id}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {cand.email ? cand.email : cand.id} · docs:{" "}
                        <span className="font-semibold">{cand.documentsCount}</span>
                        {!cand.meetsMinDocs ? (
                          <span className="ml-2 text-amber-700">(below docs≥{minDocs})</span>
                        ) : null}
                        {typeof cand.docsStatus === "number" && cand.docsStatus === 404 ? (
                          <span className="ml-2 text-rose-700">
                            (not in selected position)
                          </span>
                        ) : null}
                      </div>
                      {cand.located && cand.positionId ? (
                        <div className="mt-1 text-xs text-slate-500">
                          Found in:{" "}
                          <span className="font-mono text-slate-700">
                            {cand.positionName ? cand.positionName : cand.positionId}
                          </span>
                        </div>
                      ) : null}
                      {internalId ? (
                        <div className="mt-2 text-xs text-emerald-600">
                          Added to pipeline as: <span className="font-mono">{internalId}</span>
                        </div>
                      ) : null}
                      <div className="mt-3 flex items-center justify-end">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
                          onClick={() => void handleImportFromSearch(cand)}
                          disabled={disabled}
                        >
                          {internalId ? "Added" : isAdding ? "Adding..." : "Add to pipeline"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {importedCandidates.length > 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Imported candidates (DB)
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    Candidates already in the platform for this position.
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {importedCandidates.map((cand) => (
                  <div
                    key={`db-${cand.id}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4"
                  >
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {cand.name || cand.id}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {cand.email ? cand.email : cand.id} · docs:{" "}
                      <span className="font-semibold">{cand.attachmentCount}</span> · notes:{" "}
                      <span className="font-semibold">{cand.noteCount}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      Pipeline: <span className="font-mono">{cand.pipeline_id ?? "—"}</span>
                      {cand.stage_id ? (
                        <>
                          {" "}
                          · Stage: <span className="font-mono">{cand.stage_id}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
              Loading candidates…
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
              No candidates with docs≥{minDocs} found (try increasing `scan`).
            </div>
          ) : (
            cards.map((item) => {
              const isAdding = addingId === item.id;
              const internalId = added[item.id] ?? "";
              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {item.__name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.__email ? item.__email : item.id} · {item.__docsCount}{" "}
                        {item.__docsCount === 1 ? "document" : "documents"}
                      </div>
                      {internalId ? (
                        <div className="mt-2 text-xs text-emerald-600">
                          Added to pipeline as: <span className="font-mono">{internalId}</span>
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-full bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
                      onClick={() => void handleAdd(item)}
                      disabled={isAdding || !!internalId}
                    >
                      {internalId ? "Added" : isAdding ? "Adding..." : "Add to pipeline"}
                    </button>
                  </div>

                  <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                      View all datapoints (JSON)
                    </summary>
                    <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-700">
                      {JSON.stringify(
                        { id: item.id, summary: item.summary, details: item.details, documents: item.documents },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
