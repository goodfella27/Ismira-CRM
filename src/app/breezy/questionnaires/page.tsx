"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Check, RefreshCw, Search } from "lucide-react";

import { loadBreezyCompanyId, saveBreezyCompanyId } from "@/lib/breezy-storage";

type BreezyCompany = {
  _id?: string;
  id?: string;
  name?: string;
};

type BreezyQuestionnaire = Record<string, unknown> & {
  _id?: string;
  id?: string;
  name?: string;
  title?: string;
  questions?: unknown[];
  sections?: unknown[];
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

function normalizeQuestionnaires(payload: unknown): BreezyQuestionnaire[] {
  if (Array.isArray(payload)) return payload as BreezyQuestionnaire[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as BreezyQuestionnaire[];
    if (Array.isArray(obj.results)) return obj.results as BreezyQuestionnaire[];
    if (Array.isArray(obj.questionnaires))
      return obj.questionnaires as BreezyQuestionnaire[];
  }
  return [];
}

type FlatQuestion = {
  id: string;
  text: string;
  type: string;
  options: string[];
  required: boolean;
  section: string;
  raw: Record<string, unknown>;
};

function getFlatQuestions(input: BreezyQuestionnaire | null): FlatQuestion[] {
  if (!input) return [];

  const extractText = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    return "";
  };

  const extractOptions = (q: Record<string, unknown>): string[] => {
    const raw =
      (Array.isArray(q.options) && q.options) ||
      (Array.isArray(q.choices) && q.choices) ||
      (Array.isArray(q.values) && q.values) ||
      (Array.isArray(q.items) && q.items) ||
      (Array.isArray(q.answers) && q.answers) ||
      null;
    if (!raw) return [];

    const values = raw
      .map((item) => {
        if (isRecord(item)) {
          return (
            extractText(item.label) ||
            extractText(item.text) ||
            extractText(item.name) ||
            extractText(item.value)
          );
        }
        return extractText(item);
      })
      .filter(Boolean);

    return Array.from(new Set(values));
  };

  const inferType = (q: Record<string, unknown>): string => {
    if (isRecord(q.type)) {
      const name = extractText(q.type.name);
      if (name) return name;
      const id = extractText(q.type.id);
      if (id) return id;
    }

    const direct =
      extractText(q.type) ||
      extractText(q.kind) ||
      extractText(q.field_type) ||
      extractText(q.fieldType) ||
      extractText(q.input_type) ||
      extractText(q.inputType) ||
      (isRecord(q.field) ? extractText(q.field.type) || extractText(q.field.kind) : "") ||
      (isRecord(q.input) ? extractText(q.input.type) || extractText(q.input.kind) : "") ||
      (isRecord(q.config) ? extractText(q.config.type) || extractText(q.config.kind) : "");

    const normalized = direct.toLowerCase();
    if (normalized) return direct;

    const options = extractOptions(q);
    const multiple =
      typeof q.multiple === "boolean"
        ? q.multiple
        : typeof q.allow_multiple === "boolean"
        ? q.allow_multiple
        : typeof q.allowMultiple === "boolean"
        ? q.allowMultiple
        : false;

    if (options.length > 0) {
      return multiple ? "checkboxes" : "select";
    }

    const accept = extractText(q.accept) || (isRecord(q.file) ? extractText(q.file.accept) : "");
    const fileTypes = isRecord(q.file) && Array.isArray(q.file.types) ? q.file.types : null;
    if (accept || (fileTypes && fileTypes.length > 0)) return "file";

    const multiline =
      typeof q.multiline === "boolean"
        ? q.multiline
        : typeof q.textarea === "boolean"
        ? q.textarea
        : false;
    if (multiline) return "textarea";

    const yesNo =
      extractText(q.boolean) ||
      extractText(q.yesno) ||
      extractText(q.yes_no) ||
      extractText(q.true_false);
    if (yesNo) return "checkbox";

    const format = extractText(q.format) || extractText(q.data_type) || extractText(q.dataType);
    if (format) return format;

    return "text";
  };

  const toQuestion = (q: unknown, section: string): FlatQuestion | null => {
    if (!isRecord(q)) return null;
    const id =
      (typeof q._id === "string" ? q._id : "") ||
      (typeof q.id === "string" ? q.id : "");
    const text =
      (typeof q.text === "string" ? q.text : "") ||
      (typeof q.label === "string" ? q.label : "") ||
      (typeof q.question === "string" ? q.question : "");
    const type = inferType(q);
    const required =
      typeof q.required === "boolean"
        ? q.required
        : typeof q.is_required === "boolean"
        ? q.is_required
        : false;
    if (!id && !text) return null;
    return {
      id,
      text,
      type,
      options: extractOptions(q),
      required,
      section,
      raw: q,
    };
  };

  const out: FlatQuestion[] = [];

  if (Array.isArray(input.sections)) {
    for (const sectionNode of input.sections) {
      if (!isRecord(sectionNode)) continue;
      const sectionName =
        (typeof sectionNode.name === "string" ? sectionNode.name : "") ||
        (typeof sectionNode.title === "string" ? sectionNode.title : "") ||
        "Section";
      const questions = Array.isArray(sectionNode.questions) ? sectionNode.questions : [];
      for (const q of questions) {
        const mapped = toQuestion(q, sectionName);
        if (mapped) out.push(mapped);
      }
    }
  }

  if (out.length === 0 && Array.isArray(input.questions)) {
    for (const q of input.questions) {
      const mapped = toQuestion(q, "Questions");
      if (mapped) out.push(mapped);
    }
  }

  return out;
}

export default function BreezyQuestionnairesPage() {
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [companies, setCompanies] = useState<BreezyCompany[]>([]);
  const [questionnaires, setQuestionnaires] = useState<BreezyQuestionnaire[]>([]);
  // Don't read localStorage during the initial render; it causes hydration mismatches.
  const [companyId, setCompanyId] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<BreezyQuestionnaire | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    setCompanyId(loadBreezyCompanyId());
  }, []);

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

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return questionnaires;
    return questionnaires.filter((q) => {
      const id = getId(q);
      const name = asString(q.name).trim() || asString(q.title).trim();
      const haystack = `${name} ${id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [questionnaires, filter]);

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
      setQuestionnaires([]);
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
      const url = `/api/breezy/questionnaires?companyId=${encodeURIComponent(target)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load Breezy questionnaires."
        );
      }
      setQuestionnaires(normalizeQuestionnaires(data));
    } catch (err) {
      setQuestionnaires([]);
      setError(
        err instanceof Error ? err.message : "Failed to load questionnaires."
      );
    } finally {
      setLoadingList(false);
    }
  };

  const loadDetails = async (questionnaireId: string) => {
    const id = questionnaireId.trim();
    const target = companyId.trim();
    if (!id || !target) return;

    setSelectedId(id);
    setDetailsLoading(true);
    setError(null);
    setDetails(null);
    setShowRaw(false);

    try {
      const url = `/api/breezy/questionnaires/${encodeURIComponent(
        id
      )}?companyId=${encodeURIComponent(target)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load questionnaire details."
        );
      }
      setDetails(
        isRecord(data)
          ? (data as BreezyQuestionnaire)
          : ({ data } as BreezyQuestionnaire)
      );
    } catch (err) {
      setDetails(null);
      setError(
        err instanceof Error ? err.message : "Failed to load questionnaire."
      );
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

  return (
    <div className="mx-auto w-full">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Questionnaires
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Browse Breezy questionnaires (API-only; not stored in the database).
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
                title="Reload questionnaires"
              >
                <RefreshCw
                  className={loadingList ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filter questionnaires
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="h-11 w-full border-none bg-transparent text-sm text-slate-800 outline-none"
                placeholder="Search by name, id…"
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
            <div className="col-span-6">Questionnaire</div>
            <div className="col-span-3">Questions</div>
            <div className="col-span-2">ID</div>
            <div className="col-span-1 text-right">Copy</div>
          </div>

          {loadingList ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Loading questionnaires…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No questionnaires found.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filtered.map((q, index) => {
                const id = getId(q);
                const name =
                  asString(q.name).trim() ||
                  asString(q.title).trim() ||
                  "(Untitled questionnaire)";
                const count = getFlatQuestions(q).length;
                const active = Boolean(id && selectedId === id);

                return (
                  <div
                    key={id || `${name}-${index}`}
                    className={[
                      "grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm transition",
                      id ? "cursor-pointer hover:bg-slate-50" : "",
                      active ? "bg-emerald-50/70" : "",
                    ].join(" ")}
                    onClick={() => (id ? void loadDetails(id) : undefined)}
                  >
                    <div className="col-span-6">
                      <div className="font-semibold text-slate-900">{name}</div>
                    </div>
                    <div className="col-span-3 text-xs text-slate-600">
                      {count ? `${count} question${count === 1 ? "" : "s"}` : "—"}
                    </div>
                    <div className="col-span-2 font-mono text-xs text-slate-700">
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
                        title="Copy questionnaire id"
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
          aria-labelledby="breezy-questionnaire-modal-title"
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
                  Questionnaire
                </div>
                <div
                  id="breezy-questionnaire-modal-title"
                  className="mt-1 text-sm font-semibold text-slate-900"
                >
                  {detailsLoading
                    ? "Loading…"
                    : asString(details?.name).trim() ||
                      asString(details?.title).trim() ||
                      selectedId}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => void loadDetails(selectedId)}
                  disabled={detailsLoading}
                >
                  <RefreshCw
                    className={
                      detailsLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
                    }
                  />
                  Refresh
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() =>
                    details ? void copyJson(details) : undefined
                  }
                  disabled={!details || detailsLoading}
                  title="Copy JSON to clipboard"
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() =>
                    details
                      ? downloadJson(
                          `breezy-questionnaire-${getId(details) || selectedId}.json`,
                          details
                        )
                      : undefined
                  }
                  disabled={!details || detailsLoading}
                  title="Download JSON"
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
                <div className="grid gap-4">
                  {(() => {
                    const questions = getFlatQuestions(details);
                    return (
                      <>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Name
                              </div>
                              <div className="mt-1 font-semibold text-slate-900">
                                {asString(details.name).trim() ||
                                  asString(details.title).trim() ||
                                  "—"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                ID
                              </div>
                              <div className="mt-1 font-mono text-xs text-slate-800">
                                {getId(details) || "—"}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 text-xs text-slate-600">
                            {questions.length
                              ? `${questions.length} question${questions.length === 1 ? "" : "s"}`
                              : "No questions detected in the payload."}
                          </div>
                        </div>

                        {questions.length ? (
                          <div className="overflow-hidden rounded-2xl border border-slate-200">
                            <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              <div className="col-span-5">Question</div>
                              <div className="col-span-3">Type</div>
                              <div className="col-span-2">Options</div>
                              <div className="col-span-1">Section</div>
                              <div className="col-span-1 text-right">Req</div>
                            </div>
                            <div className="divide-y divide-slate-200">
                              {questions.map((q, index) => (
                                <div
                                  key={`${q.id || q.text}-${index}`}
                                  className="grid grid-cols-12 items-start gap-2 px-4 py-3 text-sm"
                                >
                                  <div className="col-span-5 text-slate-900">
                                    <div className="font-semibold">
                                      {q.text || "—"}
                                    </div>
                                    {q.id ? (
                                      <div className="mt-1 font-mono text-xs text-slate-500">
                                        {q.id}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="col-span-3 text-xs text-slate-700">
                                    {q.type || "—"}
                                  </div>
                                  <div className="col-span-2 text-xs text-slate-700">
                                    {q.options.length > 0
                                      ? q.options.slice(0, 3).join(", ") +
                                        (q.options.length > 3
                                          ? ` (+${q.options.length - 3})`
                                          : "")
                                      : "—"}
                                  </div>
                                  <div className="col-span-1 text-xs text-slate-700">
                                    {q.section || "—"}
                                  </div>
                                  <div className="col-span-1 text-right text-xs text-slate-700">
                                    {q.required ? "Yes" : "No"}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}

                  {showRaw ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4">
                      <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-xs text-slate-100">
                        {JSON.stringify(details, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
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
