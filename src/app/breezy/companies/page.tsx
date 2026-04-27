"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Check, RefreshCw, Search } from "lucide-react";

import JobCompaniesAdmin from "@/components/job-companies-admin";
import { loadBreezyCompanyId, saveBreezyCompanyId } from "@/lib/breezy-storage";

type BreezyCompany = Record<string, unknown> & {
  _id?: string;
  id?: string;
  name?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getId(value: { _id?: string; id?: string } | null | undefined) {
  return asString(value?._id).trim() || asString(value?.id).trim();
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

export default function BreezyCompaniesPage() {
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<BreezyCompany[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<BreezyCompany | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [storedCompanyId, setStoredCompanyId] = useState(() =>
    loadBreezyCompanyId()
  );

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter((c) => {
      const id = getId(c);
      const name = asString(c.name);
      const haystack = `${name} ${id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [companies, filter]);

  const load = async () => {
    setLoading(true);
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
      setCompanies(normalizeCompanies(data));
    } catch (err) {
      setCompanies([]);
      setError(err instanceof Error ? err.message : "Failed to load companies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
        setSelected(null);
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
            Companies
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Browse Breezy companies and pick one as the default for other Breezy
            pages.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filter companies
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="h-11 w-full border-none bg-transparent text-sm text-slate-800 outline-none"
                placeholder="Search by name or id…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Current default company id:{" "}
              <span className="font-mono">{storedCompanyId || "—"}</span>
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <div className="col-span-7">Company</div>
            <div className="col-span-4">ID</div>
            <div className="col-span-1 text-right">Copy</div>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Loading companies…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No companies found.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filtered.map((c, index) => {
                const id = getId(c);
                const name = asString(c.name).trim() || "(Unnamed company)";
                const active = Boolean(id && selectedId === id);
                return (
                  <div
                    key={id || `${name}-${index}`}
                    className={[
                      "grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm transition",
                      id ? "cursor-pointer hover:bg-slate-50" : "",
                      active ? "bg-emerald-50/70" : "",
                    ].join(" ")}
                    onClick={() => {
                      if (!id) return;
                      setSelectedId(id);
                      setSelected(c);
                      setShowRaw(false);
                    }}
                  >
                    <div className="col-span-7">
                      <div className="font-semibold text-slate-900">{name}</div>
                    </div>
                    <div className="col-span-4 font-mono text-xs text-slate-700">
                      {id || "—"}
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
                        title="Copy company id"
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

      <JobCompaniesAdmin />

      {selectedId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="breezy-company-modal-title"
          onClick={() => {
            setSelectedId(null);
            setSelected(null);
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
                  Company
                </div>
                <div
                  id="breezy-company-modal-title"
                  className="mt-1 text-sm font-semibold text-slate-900"
                >
                  {asString(selected?.name).trim() || selectedId}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
                  onClick={() => {
                    saveBreezyCompanyId(selectedId);
                    setStoredCompanyId(selectedId);
                    setSelectedId(null);
                    setSelected(null);
                    setShowRaw(false);
                  }}
                  title="Use this company as default for other Breezy pages"
                >
                  Use as default
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => (selected ? void copyJson(selected) : undefined)}
                  disabled={!selected}
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() =>
                    selected
                      ? downloadJson(`breezy-company-${selectedId}.json`, selected)
                      : undefined
                  }
                  disabled={!selected}
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
                    setSelected(null);
                    setShowRaw(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-auto px-5 py-5">
              {!selected ? (
                <div className="text-sm text-slate-500">No details returned.</div>
              ) : showRaw ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4">
                  <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-xs text-slate-100">
                    {JSON.stringify(selected, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Name
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {asString(selected.name).trim() || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        ID
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-800">
                        {selectedId}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 text-xs text-slate-500">
                    Use “Show raw” to inspect all available fields.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
