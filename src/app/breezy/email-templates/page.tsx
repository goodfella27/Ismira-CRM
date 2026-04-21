"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Check, RefreshCw, Search } from "lucide-react";

import { loadBreezyCompanyId, saveBreezyCompanyId } from "@/lib/breezy-storage";

type BreezyCompany = {
  _id?: string;
  id?: string;
  name?: string;
};

type BreezyTemplate = Record<string, unknown> & {
  _id?: string;
  id?: string;
  name?: string;
  subject?: string;
  body?: string;
  content?: string;
};

type BreezyTemplateFolder = {
  id: string;
  name: string;
  sort_order?: number;
};

type CachedTemplatesResponse = {
  folders?: BreezyTemplateFolder[];
  templates?: Array<
    BreezyTemplate & {
      folder_id?: string | null;
      synced_at?: string | null;
      updated_at?: string | null;
    }
  >;
  warning?: string;
};

type CachedTemplateDetailsResponse = {
  template?: BreezyTemplate;
  folder_id?: string | null;
  meta?: { canEdit?: boolean };
  warning?: string;
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

function normalizeTemplates(payload: unknown): BreezyTemplate[] {
  if (Array.isArray(payload)) return payload as BreezyTemplate[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as BreezyTemplate[];
    if (Array.isArray(obj.results)) return obj.results as BreezyTemplate[];
    if (Array.isArray(obj.templates)) return obj.templates as BreezyTemplate[];
  }
  return [];
}

function containsHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function sanitizeHtml(input: string) {
  if (!input.trim()) return "";
  if (typeof window === "undefined") return "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(input, "text/html");

    const blockedTags = new Set([
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "link",
      "meta",
      "base",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "option",
    ]);

    const removeNodes = Array.from(
      doc.querySelectorAll(Array.from(blockedTags).join(","))
    );
    removeNodes.forEach((node) => node.remove());

    const elements = Array.from(doc.body.querySelectorAll("*"));
    elements.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        if (name.startsWith("on") || name === "style") {
          el.removeAttribute(attr.name);
          return;
        }

        if (name === "href" || name === "src") {
          const trimmed = value.trim();
          const lower = trimmed.toLowerCase();
          const allowed =
            lower.startsWith("https://") ||
            lower.startsWith("http://") ||
            lower.startsWith("mailto:") ||
            lower.startsWith("tel:") ||
            (name === "src" && lower.startsWith("data:image/"));
          if (!allowed || lower.startsWith("javascript:")) {
            el.removeAttribute(attr.name);
          }
        }

        const allowedAttrs = new Set([
          "href",
          "src",
          "alt",
          "title",
          "target",
          "rel",
          "width",
          "height",
        ]);
        if (!allowedAttrs.has(name)) {
          el.removeAttribute(attr.name);
        }
      });

      if (el.tagName.toLowerCase() === "a") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }

      if (el.tagName.toLowerCase() === "img") {
        if (!el.getAttribute("alt")) el.setAttribute("alt", "");
        el.setAttribute("loading", "lazy");
        el.setAttribute("decoding", "async");
        el.setAttribute("referrerpolicy", "no-referrer");
      }
    });

    return doc.body.innerHTML;
  } catch {
    return "";
  }
}

function RichText({ content }: { content: string }) {
  const raw = content ?? "";
  const shouldRenderHtml = containsHtml(raw);
  const safeHtml = shouldRenderHtml ? sanitizeHtml(raw) : "";
  const safeText = !shouldRenderHtml ? raw.trim() : "";

  if (shouldRenderHtml) {
    return (
      <div
        className={[
          "text-sm text-slate-800",
          "[&_p]:mt-2 [&_p]:leading-6",
          "[&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold",
          "[&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold",
          "[&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold",
          "[&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-semibold",
          "[&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
          "[&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
          "[&_li]:leading-6",
          "[&_strong]:font-semibold",
          "[&_a]:font-semibold [&_a]:text-emerald-700 [&_a:hover]:underline",
          "[&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-2xl [&_img]:border [&_img]:border-slate-200",
          "[&_figure]:my-3",
          "[&_br]:leading-6",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: safeHtml || "" }}
      />
    );
  }

  return (
    <div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
      {safeText || "—"}
    </div>
  );
}

function pickBody(template: BreezyTemplate) {
  return (
    asString(template.body).trim() ||
    asString(template.content).trim() ||
    asString((template as Record<string, unknown>).html).trim() ||
    ""
  );
}

export default function BreezyEmailTemplatesPage() {
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [companies, setCompanies] = useState<BreezyCompany[]>([]);
  const [templates, setTemplates] = useState<BreezyTemplate[]>([]);
  const [folders, setFolders] = useState<BreezyTemplateFolder[]>([]);
  // Don't read localStorage during the initial render; it causes hydration mismatches.
  const [companyId, setCompanyId] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [templatesWarning, setTemplatesWarning] = useState<string | null>(null);
  const [detailsWarning, setDetailsWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<BreezyTemplate | null>(null);
  const [detailsFolderId, setDetailsFolderId] = useState<string | null>(null);
  const [detailsCanEdit, setDetailsCanEdit] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

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

  const filteredTemplates = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const folderMap = new Map(
      folders.map((folder) => [folder.id, asString(folder.name).trim()])
    );

    const folderFiltered = templates.filter((tpl) => {
      if (selectedFolderId === "all") return true;
      const folderId =
        asString((tpl as Record<string, unknown>).folder_id).trim() || "";
      if (selectedFolderId === "unsorted") return !folderId;
      return folderId === selectedFolderId;
    });

    if (!query) return folderFiltered;
    return folderFiltered.filter((tpl) => {
      const id = getId(tpl);
      const name = asString(tpl.name);
      const subject = asString(tpl.subject);
      const folderId = asString((tpl as Record<string, unknown>).folder_id).trim();
      const folderName = folderId ? asString(folderMap.get(folderId) ?? "") : "";
      const haystack = `${name} ${subject} ${folderName} ${id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [templates, filter, folders, selectedFolderId]);

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unsorted = 0;
    templates.forEach((tpl) => {
      const folderId = asString((tpl as Record<string, unknown>).folder_id).trim();
      if (!folderId) {
        unsorted += 1;
        return;
      }
      counts.set(folderId, (counts.get(folderId) ?? 0) + 1);
    });
    return { counts, unsorted, all: templates.length };
  }, [templates]);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    setError(null);
    setTemplatesWarning(null);
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
      setTemplates([]);
      setFolders([]);
      setError(err instanceof Error ? err.message : "Failed to load companies.");
    } finally {
      setLoadingCompanies(false);
    }
  };

  const loadTemplates = async (nextCompanyId?: string) => {
    const target = (nextCompanyId ?? companyId).trim();
    if (!target) return;
    setLoadingTemplates(true);
    setError(null);
    setTemplatesWarning(null);
    try {
      const url = `/api/breezy/templates-cache?companyId=${encodeURIComponent(
        target
      )}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load Breezy templates."
        );
      }
      const parsed = isRecord(data) ? (data as CachedTemplatesResponse) : null;
      const nextTemplates = parsed
        ? normalizeTemplates((parsed.templates as unknown) ?? data)
        : normalizeTemplates(data);
      const nextFolders =
        parsed && Array.isArray(parsed.folders)
          ? (parsed.folders as BreezyTemplateFolder[])
          : [];

      setTemplates(nextTemplates);
      setFolders(nextFolders);
      if (parsed?.warning) setTemplatesWarning(parsed.warning);

      if (selectedFolderId !== "all" && selectedFolderId !== "unsorted") {
        const stillExists = nextFolders.some((f) => f.id === selectedFolderId);
        if (!stillExists) setSelectedFolderId("all");
      }
    } catch (err) {
      setTemplates([]);
      setFolders([]);
      setError(err instanceof Error ? err.message : "Failed to load templates.");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const syncTemplates = async () => {
    const target = companyId.trim();
    if (!target) return;
    setSyncing(true);
    setError(null);
    setTemplatesWarning(null);
    try {
      const url = `/api/breezy/templates-cache?companyId=${encodeURIComponent(
        target
      )}`;
      const res = await fetch(url, { method: "POST", cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to sync templates."
        );
      }
      await loadTemplates(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync templates.");
    } finally {
      setSyncing(false);
    }
  };

  const createFolder = async () => {
    const target = companyId.trim();
    const name = newFolderName.trim();
    if (!target || !name) return;

    setCreatingFolder(true);
    setError(null);
    try {
      const url = `/api/breezy/template-folders?companyId=${encodeURIComponent(
        target
      )}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to create folder."
        );
      }
      setFolderModalOpen(false);
      setNewFolderName("");
      await loadTemplates(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder.");
    } finally {
      setCreatingFolder(false);
    }
  };

  const loadTemplateDetails = async (templateId: string) => {
    const id = templateId.trim();
    const target = companyId.trim();
    if (!id || !target) return;

    setSelectedTemplateId(id);
    setDetailsLoading(true);
    setError(null);
    setDetailsWarning(null);
    setDetails(null);
    setDetailsFolderId(null);
    setDetailsCanEdit(false);
    setShowRaw(false);

    try {
      const url = `/api/breezy/templates-cache/${encodeURIComponent(
        id
      )}?companyId=${encodeURIComponent(target)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load template details."
        );
      }
      const parsed = isRecord(data) ? (data as CachedTemplateDetailsResponse) : null;
      const template =
        parsed?.template ??
        (isRecord(data) ? (data as BreezyTemplate) : ({ data } as BreezyTemplate));
      setDetails(template);
      setDetailsFolderId(asString(parsed?.folder_id).trim() || null);
      setDetailsCanEdit(Boolean(parsed?.meta?.canEdit));
      if (parsed?.warning) setDetailsWarning(parsed.warning);
    } catch (err) {
      setDetails(null);
      setError(err instanceof Error ? err.message : "Failed to load template.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const saveTemplateFolder = async (folderId: string | null) => {
    const templateId = (selectedTemplateId ?? "").trim();
    const target = companyId.trim();
    if (!templateId || !target) return;

    setSavingFolder(true);
    setError(null);
    try {
      const url = `/api/breezy/templates-cache/${encodeURIComponent(
        templateId
      )}?companyId=${encodeURIComponent(target)}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to update folder."
        );
      }

      setDetailsFolderId(folderId);
      setTemplates((prev) =>
        prev.map((tpl) => {
          const id = getId(tpl);
          if (id !== templateId) return tpl;
          return { ...(tpl as Record<string, unknown>), folder_id: folderId } as BreezyTemplate;
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update folder.");
    } finally {
      setSavingFolder(false);
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
    void loadTemplates(companyId);
    setSelectedTemplateId(null);
    setDetails(null);
    setDetailsFolderId(null);
    setDetailsCanEdit(false);
    setDetailsWarning(null);
    setShowRaw(false);
    setSelectedFolderId("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!selectedTemplateId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedTemplateId(null);
        setDetails(null);
        setDetailsFolderId(null);
        setDetailsCanEdit(false);
        setDetailsWarning(null);
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
  }, [selectedTemplateId]);

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
            Email templates
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Sync Breezy email templates into the database and organize them into folders.
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
                onClick={() => void loadTemplates()}
                disabled={loadingTemplates || syncing || !companyId.trim()}
                title="Reload templates"
              >
                <RefreshCw
                  className={loadingTemplates ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
              </button>
              <button
                type="button"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                onClick={() => void syncTemplates()}
                disabled={syncing || loadingTemplates || !companyId.trim()}
                title="Sync from Breezy into the database"
              >
                <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                <span className="ml-2 hidden sm:inline">Sync</span>
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filter templates
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="h-11 w-full border-none bg-transparent text-sm text-slate-800 outline-none"
                placeholder="Search by name, subject, id…"
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

        {templatesWarning ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {templatesWarning}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Folders
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                onClick={() => setFolderModalOpen(true)}
                disabled={!companyId.trim()}
                title="Create folder"
              >
                + Folder
              </button>
            </div>

            <div className="divide-y divide-slate-200">
              <button
                type="button"
                className={[
                  "flex w-full items-center justify-between px-4 py-3 text-left text-sm transition",
                  selectedFolderId === "all" ? "bg-emerald-50/70" : "hover:bg-slate-50",
                ].join(" ")}
                onClick={() => setSelectedFolderId("all")}
              >
                <span className="font-semibold text-slate-900">All templates</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {folderCounts.all}
                </span>
              </button>

              {folders.map((folder) => {
                const active = selectedFolderId === folder.id;
                const count = folderCounts.counts.get(folder.id) ?? 0;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    className={[
                      "flex w-full items-center justify-between px-4 py-3 text-left text-sm transition",
                      active ? "bg-emerald-50/70" : "hover:bg-slate-50",
                    ].join(" ")}
                    onClick={() => setSelectedFolderId(folder.id)}
                    title={folder.name}
                  >
                    <span className="truncate font-semibold text-slate-900">
                      {folder.name}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {count}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                className={[
                  "flex w-full items-center justify-between px-4 py-3 text-left text-sm transition",
                  selectedFolderId === "unsorted"
                    ? "bg-emerald-50/70"
                    : "hover:bg-slate-50",
                ].join(" ")}
                onClick={() => setSelectedFolderId("unsorted")}
              >
                <span className="font-semibold text-slate-900">Unsorted</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {folderCounts.unsorted}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-12 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <div className="col-span-4">Template</div>
            <div className="col-span-2">Folder</div>
            <div className="col-span-4">Subject / Preview</div>
            <div className="col-span-1">ID</div>
            <div className="col-span-1 text-right">Copy</div>
          </div>

          {loadingTemplates ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Loading templates…
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No templates found.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredTemplates
                .slice()
                .sort((a, b) => {
                  const folderOrder = new Map(
                    folders.map((folder) => [folder.id, folder.sort_order ?? 0])
                  );
                  const aFolder = asString((a as Record<string, unknown>).folder_id).trim();
                  const bFolder = asString((b as Record<string, unknown>).folder_id).trim();
                  const aRank = aFolder ? folderOrder.get(aFolder) ?? 9999 : 9998;
                  const bRank = bFolder ? folderOrder.get(bFolder) ?? 9999 : 9998;
                  if (aRank !== bRank) return aRank - bRank;
                  const aName = asString(a.name).trim();
                  const bName = asString(b.name).trim();
                  return aName.localeCompare(bName);
                })
                .map((tpl, index) => {
                const id = getId(tpl);
                const name = asString(tpl.name).trim() || "(Untitled template)";
                const subject = asString(tpl.subject).trim();
                const body = pickBody(tpl);
                const preview = body ? body.replace(/\s+/g, " ").slice(0, 90) : "";
                const active = Boolean(id && selectedTemplateId === id);
                const folderId = asString((tpl as Record<string, unknown>).folder_id).trim();
                const folderName = folderId ? folders.find((f) => f.id === folderId)?.name : null;

                return (
                  <div
                    key={id || `${name}-${index}`}
                    className={[
                      "grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm transition",
                      id ? "cursor-pointer hover:bg-slate-50" : "",
                      active ? "bg-emerald-50/70" : "",
                    ].join(" ")}
                    onClick={() => (id ? void loadTemplateDetails(id) : undefined)}
                  >
                    <div className="col-span-4">
                      <div className="font-semibold text-slate-900">{name}</div>
                    </div>
                    <div className="col-span-2 truncate text-xs font-semibold text-slate-700">
                      {folderName?.trim() || "—"}
                    </div>
                    <div className="col-span-4 text-xs text-slate-600">
                      {subject || preview || "—"}
                    </div>
                    <div className="col-span-1 font-mono text-xs text-slate-700">
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
                        title="Copy template id"
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
      </div>

      {selectedTemplateId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="breezy-template-modal-title"
          onClick={() => {
            setSelectedTemplateId(null);
            setDetails(null);
            setDetailsFolderId(null);
            setDetailsCanEdit(false);
            setDetailsWarning(null);
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
                  Template
                </div>
                <div
                  id="breezy-template-modal-title"
                  className="mt-1 text-sm font-semibold text-slate-900"
                >
                  {detailsLoading
                    ? "Loading…"
                    : asString(details?.name).trim() ||
                      asString(details?.subject).trim() ||
                      selectedTemplateId}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => void loadTemplateDetails(selectedTemplateId)}
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
                  onClick={() => (details ? void copyJson(details) : undefined)}
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
                          `breezy-template-${getId(details) || selectedTemplateId}.json`,
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
                    setSelectedTemplateId(null);
                    setDetails(null);
                    setDetailsFolderId(null);
                    setDetailsCanEdit(false);
                    setDetailsWarning(null);
                    setShowRaw(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {detailsWarning || templatesWarning ? (
              <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
                {detailsWarning || templatesWarning}
              </div>
            ) : null}

            <div className="border-b border-slate-200 bg-white px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Folder
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                      value={detailsFolderId ?? ""}
                      onChange={(event) => {
                        const next = event.target.value || null;
                        void saveTemplateFolder(next);
                      }}
                      disabled={!detailsCanEdit || savingFolder}
                    >
                      <option value="">Unsorted</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                      onClick={() => setFolderModalOpen(true)}
                      disabled={!detailsCanEdit || !companyId.trim()}
                      title="Create folder"
                    >
                      + Folder
                    </button>
                  </div>
                  {!detailsCanEdit ? (
                    <div className="mt-2 text-xs text-slate-500">
                      Folder changes require an Admin role.
                    </div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Template ID
                  </div>
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700">
                    {selectedTemplateId}
                  </div>
                </div>
              </div>
            </div>

            <div className="max-h-[75vh] overflow-auto px-5 py-5">
              {detailsLoading ? (
                <div className="text-sm text-slate-500">Fetching Breezy data…</div>
              ) : details ? (
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Name
                        </div>
                        <div className="mt-1 font-semibold text-slate-900">
                          {asString(details.name).trim() || "—"}
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
                    {asString(details.subject).trim() ? (
                      <div className="mt-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Subject
                        </div>
                        <div className="mt-1 text-slate-800">
                          {asString(details.subject).trim()}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {pickBody(details) ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Body
                      </div>
                      <div className="mt-2">
                        <RichText content={pickBody(details)} />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                      No body content found in this template.
                    </div>
                  )}

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

      {folderModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="breezy-folder-modal-title"
          onClick={() => {
            if (creatingFolder) return;
            setFolderModalOpen(false);
            setNewFolderName("");
          }}
        >
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_-50px_rgba(15,23,42,0.6)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 bg-white px-5 py-4">
              <div
                id="breezy-folder-modal-title"
                className="text-sm font-semibold text-slate-900"
              >
                Create folder
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Folders are stored in LinAs CRM (not synced back to Breezy).
              </div>
            </div>
            <div className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Folder name
              </div>
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="e.g. Interview invitations"
                disabled={creatingFolder}
              />

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => {
                    if (creatingFolder) return;
                    setFolderModalOpen(false);
                    setNewFolderName("");
                  }}
                  disabled={creatingFolder}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  onClick={() => void createFolder()}
                  disabled={creatingFolder || !newFolderName.trim() || !companyId.trim()}
                >
                  {creatingFolder ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
