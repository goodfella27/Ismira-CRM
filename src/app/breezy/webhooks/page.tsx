"use client";

import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { NativeSelect as UiSelect } from "@/components/ui/select";
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
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Webhooks
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse Breezy webhook endpoints (API-only; not stored in the database).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <UiButton variant="secondary" size="md"
            type="button"
            className="inline-flex items-center gap-2 transition disabled:opacity-60"
            onClick={() => void loadCompanies()}
            disabled={loadingCompanies}
          >
            <RefreshCw
              className={loadingCompanies ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            Refresh companies
          </UiButton>
        </div>
      </div>

      <div className="mt-8 rounded-panel border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Company
            </div>
            <div className="mt-2 flex gap-2">
              {companies.length > 0 ? (
                <UiSelect
                  className="h-11 w-full"
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
                </UiSelect>
              ) : (
                <UiInput
                  className="h-11 w-full"
                  value={companyId}
                  onChange={(event) => setCompanyId(event.target.value)}
                  placeholder="Paste Breezy Company ID…"
                />
              )}
              <UiButton variant="secondary" size="lg"
                type="button"
                className="inline-flex h-11 shrink-0 items-center justify-center transition disabled:opacity-60"
                onClick={() => void loadList()}
                disabled={loadingList || !companyId.trim()}
                title="Reload webhooks"
              >
                <RefreshCw
                  className={loadingList ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
              </UiButton>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Filter webhooks
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-panel border border-border bg-card px-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <UiInput
                className="h-11 w-full"
                placeholder="Search by url or id…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-panel border border-border">
          <div className="grid grid-cols-12 bg-muted px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div className="col-span-7">URL</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Events</div>
            <div className="col-span-1 text-right">Copy</div>
          </div>

          {loadingList ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading webhooks…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
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
                      id ? "cursor-pointer hover:bg-muted" : "",
                      active ? "bg-success-muted" : "",
                    ].join(" ")}
                    onClick={() => (id ? void loadDetails(id) : undefined)}
                  >
                    <div className="col-span-7">
                      <div className="font-semibold text-foreground">{url}</div>
                      {id ? (
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{id}</div>
                      ) : null}
                    </div>
                    <div className="col-span-2 text-xs text-foreground">
                      {paused ? "Paused" : "Active"}
                    </div>
                    <div className="col-span-2 text-xs text-foreground">
                      {typeof events === "number" ? events : "—"}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <UiButton variant="secondary" size="sm"
                        type="button"
                        className="inline-flex items-center gap-2 transition"
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
                      </UiButton>
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
          <div className="absolute inset-0 bg-overlay backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-4xl overflow-hidden rounded-panel border border-border bg-card shadow-overlay"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-3 border-b border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Webhook endpoint
                </div>
                <div
                  id="breezy-webhook-modal-title"
                  className="mt-1 text-sm font-semibold text-foreground"
                >
                  {detailsLoading ? "Loading…" : asString(details?.url).trim() || selectedId}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="inline-flex items-center gap-2 transition disabled:opacity-60"
                  onClick={() => void loadDetails(selectedId)}
                  disabled={detailsLoading}
                >
                  <RefreshCw className={detailsLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                  Refresh
                </UiButton>
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="inline-flex items-center gap-2 transition disabled:opacity-60"
                  onClick={() => (details ? void copyJson(details) : undefined)}
                  disabled={!details || detailsLoading}
                >
                  Copy JSON
                </UiButton>
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="inline-flex items-center gap-2 transition disabled:opacity-60"
                  onClick={() =>
                    details
                      ? downloadJson(`breezy-webhook-${getId(details) || selectedId}.json`, details)
                      : undefined
                  }
                  disabled={!details || detailsLoading}
                >
                  Download
                </UiButton>
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="inline-flex items-center gap-2 transition"
                  onClick={() => setShowRaw((v) => !v)}
                >
                  {showRaw ? "Hide raw" : "Show raw"}
                </UiButton>
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="inline-flex items-center gap-2 transition"
                  onClick={() => {
                    setSelectedId(null);
                    setDetails(null);
                    setShowRaw(false);
                  }}
                >
                  Close
                </UiButton>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-auto px-5 py-5">
              {detailsLoading ? (
                <div className="text-sm text-muted-foreground">Fetching Breezy data…</div>
              ) : details ? (
                showRaw ? (
                  <div className="rounded-panel border border-border bg-primary p-4">
                    <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                      {JSON.stringify(details, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-panel border border-border bg-muted/60 p-4 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          URL
                        </div>
                        <div className="mt-1 font-semibold text-foreground">
                          {asString(details.url).trim() || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          ID
                        </div>
                        <div className="mt-1 font-mono text-xs text-foreground">
                          {getId(details) || selectedId}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground">
                      Use “Show raw” to inspect the subscribed events payload.
                    </div>
                  </div>
                )
              ) : (
                <div className="text-sm text-muted-foreground">No details returned.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
