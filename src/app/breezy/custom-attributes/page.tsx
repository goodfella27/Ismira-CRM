"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Copy, Check } from "lucide-react";

import { loadBreezyCompanyId, saveBreezyCompanyId } from "@/lib/breezy-storage";

type BreezyCompany = {
  _id?: string;
  id?: string;
  name?: string;
};

type BreezyAttribute = Record<string, unknown> & {
  _id?: string;
  id?: string;
  name?: string;
  label?: string;
  type?: unknown;
  options?: unknown[];
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

function normalizeAttributes(payload: unknown): BreezyAttribute[] {
  if (Array.isArray(payload)) return payload as BreezyAttribute[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as BreezyAttribute[];
    if (Array.isArray(obj.results)) return obj.results as BreezyAttribute[];
    if (Array.isArray(obj.attributes)) return obj.attributes as BreezyAttribute[];
  }
  return [];
}

function formatAttributeType(attr: BreezyAttribute) {
  const t = attr.type;
  if (typeof t === "string") return t;
  if (isRecord(t)) {
    return asString(t.name).trim() || asString(t.type).trim() || asString(t.id).trim();
  }
  return "";
}

function extractOptions(attr: BreezyAttribute): string[] {
  const raw = Array.isArray(attr.options)
    ? attr.options
    : Array.isArray((attr as Record<string, unknown>).choices)
    ? ((attr as Record<string, unknown>).choices as unknown[])
    : null;

  if (!raw) return [];
  const values = raw
    .map((item) => {
      if (isRecord(item)) {
        return (
          asString(item.label).trim() ||
          asString(item.text).trim() ||
          asString(item.name).trim() ||
          asString(item.value).trim()
        );
      }
      return asString(item).trim();
    })
    .filter(Boolean);
  return Array.from(new Set(values));
}

export default function BreezyCustomAttributesPage() {
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingCandidate, setLoadingCandidate] = useState(false);
  const [loadingPosition, setLoadingPosition] = useState(false);
  const [companies, setCompanies] = useState<BreezyCompany[]>([]);
  const [candidateAttributes, setCandidateAttributes] = useState<BreezyAttribute[]>([]);
  const [positionAttributes, setPositionAttributes] = useState<BreezyAttribute[]>([]);
  // Don't read localStorage during the initial render; it causes hydration mismatches.
  const [companyId, setCompanyId] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<BreezyAttribute | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string>("Attribute");
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    setCompanyId(loadBreezyCompanyId());
  }, []);

  const allAttributes = useMemo(() => {
    return [
      ...candidateAttributes.map((attr) => ({ scope: "Candidate", attr })),
      ...positionAttributes.map((attr) => ({ scope: "Position", attr })),
    ];
  }, [candidateAttributes, positionAttributes]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return allAttributes;
    return allAttributes.filter(({ scope, attr }) => {
      const id = getId(attr);
      const name = asString(attr.label).trim() || asString(attr.name).trim();
      const type = formatAttributeType(attr);
      const haystack = `${scope} ${name} ${type} ${id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [allAttributes, filter]);

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
      setCandidateAttributes([]);
      setPositionAttributes([]);
      setError(err instanceof Error ? err.message : "Failed to load companies.");
    } finally {
      setLoadingCompanies(false);
    }
  };

  const loadCandidateAttributes = async (nextCompanyId?: string) => {
    const target = (nextCompanyId ?? companyId).trim();
    if (!target) return;
    setLoadingCandidate(true);
    setError(null);
    try {
      const url = `/api/breezy/custom-attributes/candidate?companyId=${encodeURIComponent(
        target
      )}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load candidate custom attributes."
        );
      }
      setCandidateAttributes(normalizeAttributes(data));
    } catch (err) {
      setCandidateAttributes([]);
      setError(
        err instanceof Error ? err.message : "Failed to load candidate attributes."
      );
    } finally {
      setLoadingCandidate(false);
    }
  };

  const loadPositionAttributes = async (nextCompanyId?: string) => {
    const target = (nextCompanyId ?? companyId).trim();
    if (!target) return;
    setLoadingPosition(true);
    setError(null);
    try {
      const url = `/api/breezy/custom-attributes/position?companyId=${encodeURIComponent(
        target
      )}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load position custom attributes."
        );
      }
      setPositionAttributes(normalizeAttributes(data));
    } catch (err) {
      setPositionAttributes([]);
      setError(
        err instanceof Error ? err.message : "Failed to load position attributes."
      );
    } finally {
      setLoadingPosition(false);
    }
  };

  const loadAll = async (nextCompanyId?: string) => {
    const target = (nextCompanyId ?? companyId).trim();
    if (!target) return;
    await Promise.all([loadCandidateAttributes(target), loadPositionAttributes(target)]);
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
    void loadAll(companyId);
    setSelected(null);
    setShowRaw(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
  }, [selected]);

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
            Custom fields
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Browse Breezy custom attributes (candidate + position). Useful as form schema.
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
                onClick={() => void loadAll()}
                disabled={(loadingCandidate && loadingPosition) || !companyId.trim()}
                title="Reload attributes"
              >
                <RefreshCw
                  className={
                    loadingCandidate || loadingPosition
                      ? "h-4 w-4 animate-spin"
                      : "h-4 w-4"
                  }
                />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Candidate attributes: {candidateAttributes.length} · Position attributes:{" "}
              {positionAttributes.length}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filter fields
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="h-11 w-full border-none bg-transparent text-sm text-slate-800 outline-none"
                placeholder="Search by scope, label, type, id…"
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
            <div className="col-span-2">Scope</div>
            <div className="col-span-5">Field</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Options</div>
            <div className="col-span-1 text-right">Copy</div>
          </div>

          {loadingCandidate || loadingPosition ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Loading fields…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No fields found.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filtered.map(({ scope, attr }, index) => {
                const id = getId(attr);
                const label = asString(attr.label).trim() || asString(attr.name).trim() || "Field";
                const type = formatAttributeType(attr) || "—";
                const options = extractOptions(attr);
                return (
                  <div
                    key={`${scope}-${id || label}-${index}`}
                    className={[
                      "grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm transition",
                      id ? "cursor-pointer hover:bg-slate-50" : "",
                    ].join(" ")}
                    onClick={() => {
                      setSelected(attr);
                      setSelectedTitle(`${scope} field`);
                      setShowRaw(false);
                    }}
                  >
                    <div className="col-span-2 text-xs font-semibold text-slate-700">
                      {scope}
                    </div>
                    <div className="col-span-5">
                      <div className="font-semibold text-slate-900">{label}</div>
                      {id ? (
                        <div className="mt-1 font-mono text-xs text-slate-500">
                          {id}
                        </div>
                      ) : null}
                    </div>
                    <div className="col-span-2 text-xs text-slate-700">{type}</div>
                    <div className="col-span-2 text-xs text-slate-700">
                      {options.length ? `${options.length}` : "—"}
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
                        title="Copy field id"
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

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="breezy-attr-modal-title"
          onClick={() => {
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
                  {selectedTitle}
                </div>
                <div
                  id="breezy-attr-modal-title"
                  className="mt-1 text-sm font-semibold text-slate-900"
                >
                  {asString(selected.label).trim() || asString(selected.name).trim() || getId(selected) || "Field"}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => void copyJson(selected)}
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() =>
                    downloadJson(`breezy-custom-attribute-${getId(selected) || "field"}.json`, selected)
                  }
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
                    setSelected(null);
                    setShowRaw(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-auto px-5 py-5">
              {showRaw ? (
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
                        Label
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {asString(selected.label).trim() || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Type
                      </div>
                      <div className="mt-1 text-slate-800">
                        {formatAttributeType(selected) || "—"}
                      </div>
                    </div>
                  </div>
                  {extractOptions(selected).length ? (
                    <div className="mt-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Options
                      </div>
                      <div className="mt-2 text-sm text-slate-800">
                        {extractOptions(selected).join(", ")}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 text-xs text-slate-500">
                    Use “Show raw” to inspect all available fields and validation metadata.
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
