"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Copy, Check } from "lucide-react";

import { loadBreezyCompanyId, saveBreezyCompanyId } from "@/lib/breezy-storage";

type BreezyCompany = {
  _id?: string;
  id?: string;
  name?: string;
};

type BreezyWebhookEndpoint = Record<string, unknown> & {
  _id?: string;
  id?: string;
  url?: string;
  paused?: boolean;
  events?: unknown[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getId(value: { _id?: string; id?: string } | null | undefined) {
  return asString(value?._id).trim() || asString(value?.id).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCompanies(payload: unknown): BreezyCompany[] {
  if (Array.isArray(payload)) return payload as BreezyCompany[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as BreezyCompany[];
    if (Array.isArray(obj.results)) return obj.results as BreezyCompany[];
    if (Array.isArray(obj.companies)) return obj.companies as BreezyCompany[];
  }
  return [];
}

function normalizeEndpoints(payload: unknown): BreezyWebhookEndpoint[] {
  if (Array.isArray(payload)) return payload as BreezyWebhookEndpoint[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as BreezyWebhookEndpoint[];
    if (Array.isArray(obj.results)) return obj.results as BreezyWebhookEndpoint[];
    if (Array.isArray(obj.webhook_endpoints))
      return obj.webhook_endpoints as BreezyWebhookEndpoint[];
    if (Array.isArray(obj.webhookEndpoints))
      return obj.webhookEndpoints as BreezyWebhookEndpoint[];
  }
  return [];
}

export default function BreezyWebhooksPage() {
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [companies, setCompanies] = useState<BreezyCompany[]>([]);
  const [endpoints, setEndpoints] = useState<BreezyWebhookEndpoint[]>([]);
  // Don't read localStorage during the initial render; it causes hydration mismatches.
  const [companyId, setCompanyId] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<BreezyWebhookEndpoint | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    setCompanyId(loadBreezyCompanyId());
  }, []);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return endpoints;
    return endpoints.filter((ep) => {
      const id = getId(ep);
      const url = asString(ep.url);
      const haystack = `${url} ${id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [endpoints, filter]);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    setError(null);
    try {
      const res = await fetch("/api/breezy/companies", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load Breezy companies."
        );
      }
      const list = normalizeCompanies(data);
      setCompanies(list);
      const stored = loadBreezyCompanyId();
      const preferred = (companyId || stored).trim();
      const hasPreferred =
        preferred && list.some((item) => getId(item) === preferred);
      const first = list.find((item) => getId(item));
      const next = hasPreferred ? preferred : first ? getId(first) : "";
      if (next && next !== companyId) setCompanyId(next);
    } catch (err) {
      setCompanies([]);
      setEndpoints([]);
      setError(err instanceof Error ? err.message : "Failed to load companies.");
    } finally {
      setLoadingCompanies(false);
    }
  };

  const loadList = async (nextCompanyId?: string) => {
    const target = (nextCompanyId ?? companyId).trim();
    if (!target) return;
    setLoadingList(true);
    setError(null);
    try {
      const url = `/api/breezy/webhook-endpoints?companyId=${encodeURIComponent(target)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load Breezy webhooks."
        );
      }
      setEndpoints(normalizeEndpoints(data));
    } catch (err) {
      setEndpoints([]);
      setError(err instanceof Error ? err.message : "Failed to load webhooks.");
    } finally {
      setLoadingList(false);
    }
  };

  const loadDetails = async (endpointId: string) => {
    const id = endpointId.trim();
    const target = companyId.trim();
    if (!id || !target) return;

    setSelectedId(id);
    setDetailsLoading(true);
    setError(null);
    setDetails(null);
    setShowRaw(false);

    try {
      const url = `/api/breezy/webhook-endpoints/${encodeURIComponent(
        id
      )}?companyId=${encodeURIComponent(target)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load webhook details."
        );
      }
      setDetails(
        isRecord(data)
          ? (data as BreezyWebhookEndpoint)
          : ({ data } as BreezyWebhookEndpoint)
      );
    } catch (err) {
      setDetails(null);
      setError(err instanceof Error ? err.message : "Failed to load webhook.");
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    void loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyId.trim()) return;
    saveBreezyCompanyId(companyId);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    void loadList(companyId);
    setSelectedId(null);
    setDetails(null);
    setShowRaw(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
        setDetails(null);
        setShowRaw(false);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedId]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  const downloadJson = (name: string, payload: unknown) => {
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const copyJson = async (payload: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      // ignore
    }
  };

  return (
    <div className="mx-auto w-full">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Webhooks
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Browse Breezy webhook endpoints (API-only; not stored in the database).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            onClick={() => void loadCompanies()}
            disabled={loadingCompanies}
          >
            <RefreshCw
              className={loadingCompanies ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Refresh companies
          </button>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Company
            </div>
            <div className="mt-2 flex gap-2">
              {companies.length > 0 ? (
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                >
                  <option value="">Select company…</option>
                  {companies.map((company) => {
                    const id = getId(company);
                    const label = company.name || id || "Company";
                    if (!id) return null;
                    return (
                      <option key={id} value={id}>
                        {label} ({id})
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                  placeholder="Paste Breezy Company ID…"
                />
              )}
              <button
                type="button"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                onClick={() => void loadList()}
                disabled={loadingList || !companyId.trim()}
                title="Reload webhooks"
              >
                <RefreshCw
                  className={loadingList ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filter webhooks
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="h-11 w-full border-none bg-transparent text-sm text-slate-800 outline-none"
                placeholder="Search by url or id…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <div className="col-span-7">URL</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Events</div>
            <div className="col-span-1 text-right">Copy</div>
          </div>

          {loadingList ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Loading webhooks…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No webhooks found.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filtered.map((ep, index) => {
                const id = getId(ep);
                const url = asString(ep.url).trim() || "—";
                const paused =
                  typeof ep.paused === "boolean"
                    ? ep.paused
                    : typeof (ep as Record<string, unknown>).is_paused === "boolean"
                    ? ((ep as Record<string, unknown>).is_paused as boolean)
                    : false;
                const events = Array.isArray(ep.events) ? ep.events.length : null;
                const active = Boolean(id && selectedId === id);
                return (
                  <div
                    key={id || `${url}-${index}`}
                    className={[
                      "grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm transition",
                      id ? "cursor-pointer hover:bg-slate-50" : "",
                      active ? "bg-emerald-50/70" : "",
                    ].join(" ")}
                    onClick={() => (id ? void loadDetails(id) : undefined)}
                  >
                    <div className="col-span-7">
                      <div className="font-semibold text-slate-900">{url}</div>
                      {id ? (
                        <div className="mt-1 font-mono text-xs text-slate-500">{id}</div>
                      ) : null}
                    </div>
                    <div className="col-span-2 text-xs text-slate-700">
                      {paused ? "Paused" : "Active"}
                    </div>
                    <div className="col-span-2 text-xs text-slate-700">
                      {typeof events === "number" ? events : "—"}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (id) void copy(id);
                        }}
                        disabled={!id}
                        title="Copy webhook id"
                      >
                        {copied === id ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="breezy-webhook-modal-title"
          onClick={() => {
            setSelectedId(null);
            setDetails(null);
            setShowRaw(false);
          }}
        >
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_-50px_rgba(15,23,42,0.6)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Webhook endpoint
                </div>
                <div
                  id="breezy-webhook-modal-title"
                  className="mt-1 text-sm font-semibold text-slate-900"
                >
                  {detailsLoading ? "Loading…" : asString(details?.url).trim() || selectedId}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => void loadDetails(selectedId)}
                  disabled={detailsLoading}
                >
                  <RefreshCw className={detailsLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                  Refresh
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => (details ? void copyJson(details) : undefined)}
                  disabled={!details || detailsLoading}
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() =>
                    details
                      ? downloadJson(`breezy-webhook-${getId(details) || selectedId}.json`, details)
                      : undefined
                  }
                  disabled={!details || detailsLoading}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setShowRaw((v) => !v)}
                >
                  {showRaw ? "Hide raw" : "Show raw"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => {
                    setSelectedId(null);
                    setDetails(null);
                    setShowRaw(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-auto px-5 py-5">
              {detailsLoading ? (
                <div className="text-sm text-slate-500">Fetching Breezy data…</div>
              ) : details ? (
                showRaw ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4">
                    <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-xs text-slate-100">
                      {JSON.stringify(details, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          URL
                        </div>
                        <div className="mt-1 font-semibold text-slate-900">
                          {asString(details.url).trim() || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          ID
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-800">
                          {getId(details) || selectedId}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-slate-500">
                      Use “Show raw” to inspect the subscribed events payload.
                    </div>
                  </div>
                )
              ) : (
                <div className="text-sm text-slate-500">No details returned.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
