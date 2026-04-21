"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  Layers,
  MapPin,
  BriefcaseBusiness,
  FolderKanban,
} from "lucide-react";

import { loadBreezyCompanyId, saveBreezyCompanyId } from "@/lib/breezy-storage";
import { extractCompany, extractDepartment } from "@/lib/breezy-position-fields";

type BreezyCompany = {
  _id?: string;
  id?: string;
  name?: string;
};

type BreezyPosition = {
  id: string;
  name: string;
  state?: string;
  friendly_id?: string;
  org_type?: string;
  company?: string;
  department?: string;
  priority?: string;
  edited?: boolean;
  synced_at?: string | null;
  details_synced_at?: string | null;
};

type BreezyPositionDetails = Record<string, unknown>;

type CachedPositionsResponse = {
  positions: BreezyPosition[];
  warning?: string;
};

type CachedPositionDetailsResponse = {
  details: BreezyPositionDetails;
  base?: unknown;
  overrides?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  warning?: string;
};

type JobCompanyLogoResponse = {
  companies?: Array<{
    name?: string;
    logoUrl?: string | null;
  }>;
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

function normalizePositions(payload: unknown): BreezyPosition[] {
  if (Array.isArray(payload)) return payload as BreezyPosition[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.positions)) return obj.positions as BreezyPosition[];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function getFirstStringField(
  payload: BreezyPositionDetails | null,
  keys: string[]
) {
  if (!payload) return "";
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function formatLocationValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatLocationValue(item))
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(items)).join(", ");
  }
  if (isRecord(value)) {
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (name) return name;
    const label = typeof value.label === "string" ? value.label.trim() : "";
    if (label) return label;
    const val = typeof value.value === "string" ? value.value.trim() : "";
    if (val) return val;
    const city = typeof value.city === "string" ? value.city.trim() : "";
    const country = typeof value.country === "string" ? value.country.trim() : "";
    const region = typeof value.region === "string" ? value.region.trim() : "";
    const parts = [city, region, country].filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
  }
  return "";
}

function formatPositionLocation(details: BreezyPositionDetails | null): string {
  if (!details) return "";

  const explicit = getFirstStringField(details, [
    "location_name",
    "locationName",
    "location_label",
    "locationLabel",
  ]);
  if (explicit) return explicit;

  const raw =
    details.locations ??
    details.location ??
    details.office_location ??
    details.officeLocation ??
    null;

  const location = formatLocationValue(raw);

  const remoteLabel = getFirstStringField(details, [
    "remote",
    "remote_type",
    "remoteType",
    "remote_label",
    "remoteLabel",
  ]);
  const isRemote =
    typeof details.remote === "boolean"
      ? details.remote
      : typeof details.is_remote === "boolean"
      ? details.is_remote
      : typeof details.isRemote === "boolean"
      ? details.isRemote
      : false;

  const remote = remoteLabel || (isRemote ? "Remote" : "");
  if (remote && location) return `${remote} ${location}`.trim();
  return location || remote;
}

function normalizePositionType(value: string | undefined) {
  return (value || "position").trim().toLowerCase() === "pool"
    ? "pool"
    : "position";
}

function buildPositionPreview(position: BreezyPosition) {
  const company = asString(position.company).trim();
  const department = asString(position.department).trim();
  const state = asString(position.state).trim();
  const segments = [
    company ? `${company} actively recruiting` : "",
    department ? `for ${department}` : "",
    state ? `(${state})` : "",
  ].filter(Boolean);
  const sentence = segments.join(" ").trim();
  if (sentence) return `${sentence}.`;
  if (position.friendly_id) return position.friendly_id;
  return "Browse cached Breezy details and open the full record for more information.";
}

export default function BreezyPositionsPage() {
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [syncingPositions, setSyncingPositions] = useState(false);
  const [companies, setCompanies] = useState<BreezyCompany[]>([]);
  const [positions, setPositions] = useState<BreezyPosition[]>([]);
  // Don't read localStorage during the initial render; it causes hydration mismatches.
  const [companyId, setCompanyId] = useState("");
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "position" | "pool">(
    "all"
  );
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(
    null
  );
  const [selectedPositionLabel, setSelectedPositionLabel] = useState<string | null>(
    null
  );
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<BreezyPositionDetails | null>(null);
  const [detailsOverrides, setDetailsOverrides] = useState<Record<string, unknown>>(
    {}
  );
  const [canEdit, setCanEdit] = useState(false);
  const [showRawDetails, setShowRawDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [companyLogoByName, setCompanyLogoByName] = useState<Record<string, string>>(
    {}
  );
  const [editForm, setEditForm] = useState({
    name: "",
    company: "",
    department: "",
    priority: "",
    location_name: "",
    summary: "",
    description: "",
    responsibilities: "",
    requirements: "",
  });

  const isPositionsTableMissing = useMemo(() => {
    const message = (warning ?? "").toLowerCase();
    return message.includes("breezy_positions") && message.includes("not set up");
  }, [warning]);

  const filteredPositions = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const typeFiltered =
      typeFilter === "all"
        ? positions
        : positions.filter((pos) => {
            const kind = normalizePositionType(pos.org_type);
            return kind === typeFilter;
          });

    if (!query) return typeFiltered;
    return typeFiltered.filter((pos) => {
      const haystack =
        `${pos.name ?? ""} ${pos.company ?? ""} ${pos.department ?? ""} ${pos.state ?? ""} ${pos.org_type ?? ""} ${pos.friendly_id ?? ""} ${pos.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [positions, filter, typeFilter]);

  const typeCounts = useMemo(() => {
    return positions.reduce(
      (acc, pos) => {
        const kind = normalizePositionType(pos.org_type);
        acc[kind] += 1;
        acc.all += 1;
        return acc;
      },
      { all: 0, position: 0, pool: 0 }
    );
  }, [positions]);

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
      setPositions([]);
      setError(err instanceof Error ? err.message : "Failed to load companies.");
    } finally {
      setLoadingCompanies(false);
    }
  };

  const loadPositions = async (nextCompanyId?: string) => {
    const target = (nextCompanyId ?? companyId).trim();
    if (!target) return;
    setLoadingPositions(true);
    setError(null);
    setWarning(null);
    try {
      const url = `/api/breezy/positions-cache?companyId=${encodeURIComponent(
        target
      )}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load Breezy positions."
        );
      }
      const parsed = isRecord(data) ? (data as CachedPositionsResponse) : null;
      const list = parsed ? normalizePositions(parsed) : [];
      setPositions(list);
      if (parsed?.warning) setWarning(parsed.warning);
    } catch (err) {
      setPositions([]);
      setError(err instanceof Error ? err.message : "Failed to load positions.");
    } finally {
      setLoadingPositions(false);
    }
  };

  const syncPositions = async () => {
    const target = companyId.trim();
    if (!target) return;
    setSyncingPositions(true);
    setError(null);
    setWarning(null);
    try {
      const url = `/api/breezy/positions-cache?companyId=${encodeURIComponent(
        target
      )}`;
      const res = await fetch(url, { method: "POST", cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to sync positions."
        );
      }
      await loadPositions(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync positions.");
    } finally {
      setSyncingPositions(false);
    }
  };

  const loadPositionDetails = async (positionId: string, label?: string) => {
    const posId = positionId.trim();
    if (!posId) return;

    const targetCompanyId = companyId.trim();
    if (!targetCompanyId) return;

    setSelectedPositionId(posId);
    setSelectedPositionLabel((label ?? "").trim() || null);
    setDetailsLoading(true);
    setError(null);
    setWarning(null);
    setDetails(null);
    setDetailsOverrides({});
    setCanEdit(false);
    setShowRawDetails(false);
    setEditing(false);

    try {
      const url = `/api/breezy/positions-cache/${encodeURIComponent(
        posId
      )}?companyId=${encodeURIComponent(targetCompanyId)}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load Breezy position details."
        );
      }
      const parsed = isRecord(data) ? (data as CachedPositionDetailsResponse) : null;
      const nextDetails = parsed && isRecord(parsed.details) ? parsed.details : null;
      setDetails(nextDetails ?? { data });
      setDetailsOverrides(
        parsed && isRecord(parsed.overrides) ? (parsed.overrides as Record<string, unknown>) : {}
      );
      if (parsed?.warning) setWarning(parsed.warning);
      setCanEdit(Boolean(parsed?.meta && (parsed.meta as Record<string, unknown>)?.canEdit));

      const derived = nextDetails ?? (isRecord(data) ? (data as BreezyPositionDetails) : null);
      if (derived) {
        const overrides =
          parsed && isRecord(parsed.overrides) ? (parsed.overrides as Record<string, unknown>) : {};

        const pick = (key: string) =>
          typeof overrides[key] === "string" ? (overrides[key] as string) : "";

        setEditForm({
          name: pick("name"),
          company: pick("company"),
          department: pick("department"),
          priority: pick("priority"),
          location_name: pick("location_name"),
          summary: pick("summary"),
          description: pick("description"),
          responsibilities: pick("responsibilities"),
          requirements: pick("requirements"),
        });
      }
    } catch (err) {
      setDetails(null);
      setSelectedPositionLabel((label ?? "").trim() || null);
      setError(
        err instanceof Error ? err.message : "Failed to load position details."
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  const refreshPositionFromBreezy = async (positionId: string) => {
    const posId = positionId.trim();
    if (!posId) return;
    const targetCompanyId = companyId.trim();
    if (!targetCompanyId) return;

    setDetailsLoading(true);
    setError(null);
    try {
      const url = `/api/breezy/positions-cache/${encodeURIComponent(
        posId
      )}?companyId=${encodeURIComponent(targetCompanyId)}&refresh=1`;
      const res = await fetch(url, { method: "POST", cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to refresh from Breezy."
        );
      }
      await loadPositionDetails(posId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh position.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const saveEdits = async () => {
    const posId = (selectedPositionId ?? "").trim();
    if (!posId) return;
    const targetCompanyId = companyId.trim();
    if (!targetCompanyId) return;

    setSavingEdits(true);
    setError(null);
    try {
      const url = `/api/breezy/positions-cache/${encodeURIComponent(
        posId
      )}?companyId=${encodeURIComponent(targetCompanyId)}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: editForm }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to save edits."
        );
      }
      await loadPositionDetails(posId);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save edits.");
    } finally {
      setSavingEdits(false);
    }
  };

  const resetEdits = async () => {
    const posId = (selectedPositionId ?? "").trim();
    if (!posId) return;
    const targetCompanyId = companyId.trim();
    if (!targetCompanyId) return;

    setSavingEdits(true);
    setError(null);
    try {
      const url = `/api/breezy/positions-cache/${encodeURIComponent(
        posId
      )}?companyId=${encodeURIComponent(targetCompanyId)}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to reset edits."
        );
      }
      await loadPositionDetails(posId);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset edits.");
    } finally {
      setSavingEdits(false);
    }
  };

  useEffect(() => {
    setCompanyId(loadBreezyCompanyId());
  }, []);

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
    void loadPositions(companyId);
    setSelectedPositionId(null);
    setSelectedPositionLabel(null);
    setDetails(null);
    setDetailsOverrides({});
    setCanEdit(false);
    setShowRawDetails(false);
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    let ignore = false;

    const loadCompanyLogos = async () => {
      try {
        const res = await fetch("/api/company/job-companies", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as JobCompanyLogoResponse | null;
        if (!res.ok || !data?.companies || ignore) return;

        const next = data.companies.reduce<Record<string, string>>((acc, company) => {
          const name = asString(company?.name).trim().toLowerCase();
          const logoUrl = asString(company?.logoUrl).trim();
          if (!name || !logoUrl) return acc;
          acc[name] = logoUrl;
          return acc;
        }, {});

        if (!ignore) setCompanyLogoByName(next);
      } catch {
        if (!ignore) setCompanyLogoByName({});
      }
    };

    void loadCompanyLogos();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedPositionId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPositionId(null);
        setSelectedPositionLabel(null);
        setDetails(null);
        setDetailsOverrides({});
        setCanEdit(false);
        setShowRawDetails(false);
        setEditing(false);
      }
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedPositionId]);

  return (
    <div className="mx-auto w-full">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Positions
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Connect to Breezy and browse your companies and positions.
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
        <div className="grid gap-4 md:grid-cols-3">
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
                onClick={() => void loadPositions()}
                disabled={loadingPositions || !companyId.trim()}
                title="Reload cached positions"
              >
                <RefreshCw
                  className={loadingPositions ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
              </button>
              <button
                type="button"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:opacity-60"
                onClick={() => void syncPositions()}
                disabled={syncingPositions || loadingPositions || !companyId.trim()}
                title="Sync from Breezy into the database"
              >
                <RefreshCw
                  className={syncingPositions ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
                Sync
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Loads from the database cache. Use Sync to pull fresh data from Breezy.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filter positions
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="h-11 w-full border-none bg-transparent text-sm text-slate-800 outline-none"
                placeholder="Search by name, state, id…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Tip: pick a Position ID to set as `BREEZY_POSITION_ID`.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Type
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                {
                  key: "all" as const,
                  label: "All",
                  count: typeCounts.all,
                  icon: BriefcaseBusiness,
                },
                {
                  key: "position" as const,
                  label: "Positions",
                  count: typeCounts.position,
                  icon: BriefcaseBusiness,
                },
                {
                  key: "pool" as const,
                  label: "Pools",
                  count: typeCounts.pool,
                  icon: FolderKanban,
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = typeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    className={[
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition",
                      active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                    onClick={() => setTypeFilter(tab.key)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        active ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600",
                      ].join(" ")}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Separate Breezy job openings from candidate pools without mixing them in one list.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {warning ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warning}
          </div>
        ) : null}

        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">
                {filteredPositions.length.toLocaleString()}
              </span>{" "}
              {typeFilter === "pool"
                ? "pools"
                : typeFilter === "position"
                ? "positions"
                : "records"}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {loadingPositions ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Loading positions…
              </div>
            ) : filteredPositions.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                No {typeFilter === "all" ? "positions" : typeFilter} found.
              </div>
            ) : (
              filteredPositions.map((pos, index) => {
                const id = pos.id;
                const name = pos.name || pos.friendly_id || id || "Position";
                const active = Boolean(id && selectedPositionId === id);
                const orgType = normalizePositionType(pos.org_type);
                const company = asString(pos.company).trim();
                const companyLogoUrl = companyLogoByName[company.toLowerCase()] ?? "";
                const department = asString(pos.department).trim();
                const priority = asString(pos.priority).trim().toLowerCase();
                const priorityLabel =
                  priority === "hot" ? "Hot" : priority === "urgent" ? "Urgent" : "";
                const preview = buildPositionPreview(pos);
                const avatarSeed = (company || name).trim() || "P";
                const avatar = avatarSeed.slice(0, 1).toUpperCase();
                return (
                  <div
                    key={id || `${name}-${index}`}
                    role="button"
                    tabIndex={id ? 0 : -1}
                    aria-pressed={active}
                    className={[
                      "group flex w-full items-start justify-between gap-4 rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:shadow-md",
                      id ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/25" : "",
                      active
                        ? "border-emerald-200 ring-2 ring-emerald-500/20"
                        : "border-slate-200 hover:border-emerald-200",
                    ].join(" ")}
                    onClick={() => (id ? void loadPositionDetails(id, name) : undefined)}
                    onKeyDown={(event) => {
                      if (!id) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      void loadPositionDetails(id, name);
                    }}
                      >
                        <div className="flex min-w-0 items-start gap-4">
                      <div className="mt-0.5 grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-2xl font-bold text-slate-600 ring-1 ring-slate-200">
                        {companyLogoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={companyLogoUrl}
                            alt={company || name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          avatar
                        )}
                      </div>

                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  {priorityLabel ? (
                                    <span
                                      className={[
                                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
                                        priorityLabel === "Hot"
                                          ? "bg-gradient-to-r from-[#ffbf5f] to-[#ff9d2e] text-white shadow-orange-200/40"
                                          : "bg-gradient-to-r from-[#58d0d8] to-[#3ea4e6] text-white shadow-sky-200/50",
                                      ].join(" ")}
                                    >
                                      {priorityLabel}
                                    </span>
                                  ) : null}
                                  <div className="min-w-0 flex-1 break-words text-[18px] font-extrabold leading-snug text-slate-900">
                                    {name}
                                  </div>
                                </div>
                              </div>
                              {pos.edited ? (
                                <div className="flex shrink-0 justify-end">
                                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 shadow-sm">
                                    Edited
                                  </span>
                                </div>
                              ) : null}
                            </div>

                        <div className="mt-1 text-xs leading-5 text-slate-600 [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden">
                          {preview}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                          <span
                            className={[
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 shadow-sm",
                              orgType === "pool"
                                ? "border-sky-200 bg-gradient-to-r from-cyan-100 to-sky-100 text-sky-950 shadow-sky-200/40"
                                : "border-slate-200 bg-slate-100 text-slate-800 shadow-slate-200/40",
                            ].join(" ")}
                            title={orgType === "pool" ? "Candidate pool" : "Job opening"}
                          >
                            {orgType === "pool" ? (
                              <FolderKanban className="h-3.5 w-3.5 text-indigo-600" />
                            ) : (
                              <BriefcaseBusiness className="h-3.5 w-3.5 text-slate-600" />
                            )}
                            <span>{orgType === "pool" ? "Pool" : "Position"}</span>
                          </span>

                          {department ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-gradient-to-r from-sky-100 to-cyan-100 px-2.5 py-1.5 text-sky-950 shadow-sm shadow-sky-200/40">
                              <Layers className="h-3.5 w-3.5 text-sky-600" />
                              <span className="max-w-[260px] truncate whitespace-nowrap">
                                {department}
                              </span>
                            </span>
                          ) : null}

                          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-gradient-to-r from-cyan-100 to-sky-100 px-2.5 py-1.5 text-cyan-950 shadow-sm shadow-cyan-200/40">
                            <MapPin className="h-3.5 w-3.5 text-cyan-600" />
                            <span className="max-w-[320px] truncate whitespace-nowrap">
                              {asString(pos.state).trim() || "Published"}
                            </span>
                          </span>

                          {company ? (
                            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 shadow-sm shadow-slate-200/40">
                              <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-[9px] font-bold uppercase text-slate-600 ring-1 ring-slate-200">
                                {companyLogoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={companyLogoUrl}
                                    alt={company}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  avatar
                                )}
                              </span>
                              <span className="max-w-[220px] truncate whitespace-nowrap">
                                {company}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Required env vars
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>
            Auth: `BREEZY_API_TOKEN` (recommended) OR `BREEZY_EMAIL` + `BREEZY_PASSWORD`
          </li>
          <li>Target: `BREEZY_COMPANY_ID` (for sending candidates)</li>
          <li>Target: `BREEZY_POSITION_ID` (for sending candidates)</li>
        </ul>
      </div>

      {selectedPositionId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="breezy-position-modal-title"
          onClick={() => {
            setSelectedPositionId(null);
            setSelectedPositionLabel(null);
            setDetails(null);
            setDetailsOverrides({});
            setCanEdit(false);
            setShowRawDetails(false);
            setEditing(false);
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
                  Position Details
                </div>
                <div
                  id="breezy-position-modal-title"
                  className="mt-1 text-sm font-semibold text-slate-900"
                >
                  {detailsLoading
                    ? "Loading…"
                    : selectedPositionLabel || selectedPositionId}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => void refreshPositionFromBreezy(selectedPositionId)}
                  disabled={detailsLoading || savingEdits}
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
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setShowRawDetails((v) => !v)}
                  disabled={savingEdits}
                >
                  {showRawDetails ? "Hide raw" : "Show raw"}
                </button>
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
                      onClick={() => void saveEdits()}
                      disabled={savingEdits || detailsLoading}
                    >
                      {savingEdits ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                      onClick={() => setEditing(false)}
                      disabled={savingEdits}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    onClick={() => setEditing(true)}
                    disabled={detailsLoading || !details || !canEdit}
                    title={!canEdit ? "Admin only" : "Edit fields"}
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => {
                    setSelectedPositionId(null);
                    setSelectedPositionLabel(null);
                    setDetails(null);
                    setDetailsOverrides({});
                    setShowRawDetails(false);
                    setEditing(false);
                  }}
                  disabled={savingEdits}
                >
                  Close
                </button>
                {!editing && !detailsLoading && details && !canEdit ? (
                  <div className="w-full text-[11px] text-slate-500">
                    Editing is disabled:{" "}
                    {isPositionsTableMissing
                      ? "apply `supabase/breezy_positions.sql` in Supabase to enable caching/overrides."
                      : "your user must be `Admin` in `company_members`."}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="max-h-[75vh] overflow-auto px-5 py-5">
              {detailsLoading ? (
                <div className="text-sm text-slate-500">Loading position…</div>
              ) : details ? (
                <div className="grid gap-4">
                  {(() => {
                    const title = getFirstStringField(details, ["name", "title"]);
                    const state = getFirstStringField(details, ["state", "status"]);
                    const company = extractCompany(details);
                    const department = extractDepartment(details);
                    const location = formatPositionLocation(details);
                    const summary = getFirstStringField(details, [
                      "summary",
                      "short_description",
                      "description_summary",
                    ]);
                    const description = getFirstStringField(details, [
                      "description",
                      "description_html",
                      "description_text",
                      "job_description",
                      "content",
                    ]);
                    const requirements = getFirstStringField(details, [
                      "requirements",
                      "requirements_html",
                      "requirements_text",
                    ]);
                    const responsibilities = getFirstStringField(details, [
                      "responsibilities",
                      "responsibilities_html",
                      "responsibilities_text",
                    ]);

                    if (editing) {
                      const editedKeys = Object.keys(detailsOverrides ?? {}).filter(Boolean);
                      return (
                        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Edit fields
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              Leave empty to use the Breezy value. Edited keys:{" "}
                              {editedKeys.length > 0 ? editedKeys.join(", ") : "—"}
                            </div>
                          </div>

                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Title
                              </div>
                              <input
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                value={editForm.name}
                                disabled={savingEdits}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, name: event.target.value }))
                                }
                                placeholder={title || "—"}
                              />
                            </div>

                            <div className="grid gap-3 sm:grid-cols-4">
                              <div className="grid gap-1">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Company
                                </div>
                                <input
                                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                  value={editForm.company}
                                  disabled={savingEdits}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      company: event.target.value,
                                    }))
                                  }
                                  placeholder={company || "—"}
                                />
                              </div>
                              <div className="grid gap-1">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Department
                                </div>
                                <input
                                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                  value={editForm.department}
                                  disabled={savingEdits}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      department: event.target.value,
                                    }))
                                  }
                                  placeholder={department || "—"}
                                />
                              </div>

                              <div className="grid gap-1">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Priority
                                </div>
                                <select
                                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                  value={editForm.priority}
                                  disabled={savingEdits}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      priority: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">None</option>
                                  <option value="hot">Hot</option>
                                  <option value="urgent">Urgent</option>
                                </select>
                              </div>

                              <div className="grid gap-1">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Location
                                </div>
                                <input
                                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                  value={editForm.location_name}
                                  disabled={savingEdits}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      location_name: event.target.value,
                                    }))
                                  }
                                  placeholder={location || "—"}
                                />
                              </div>
                            </div>

                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Summary
                              </div>
                              <textarea
                                className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                value={editForm.summary}
                                disabled={savingEdits}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, summary: event.target.value }))
                                }
                                placeholder={summary || ""}
                              />
                            </div>

                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Description
                              </div>
                              <textarea
                                className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                value={editForm.description}
                                disabled={savingEdits}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    description: event.target.value,
                                  }))
                                }
                                placeholder={description || ""}
                              />
                            </div>

                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Responsibilities
                              </div>
                              <textarea
                                className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                value={editForm.responsibilities}
                                disabled={savingEdits}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    responsibilities: event.target.value,
                                  }))
                                }
                                placeholder={responsibilities || ""}
                              />
                            </div>

                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Requirements
                              </div>
                              <textarea
                                className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                value={editForm.requirements}
                                disabled={savingEdits}
                                onChange={(event) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    requirements: event.target.value,
                                  }))
                                }
                                placeholder={requirements || ""}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-slate-500">
                              State: <span className="font-semibold text-slate-700">{state || "—"}</span>
                            </div>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-60"
                              onClick={() => void resetEdits()}
                              disabled={savingEdits}
                            >
                              Reset edits
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
                          <div className="grid gap-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Title
                            </div>
                            <div className="font-semibold text-slate-900">
                              {title || "—"}
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-4">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                State
                              </div>
                              <div className="mt-1 text-slate-800">{state || "—"}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Company
                              </div>
                              <div className="mt-1 text-slate-800">{company || "—"}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Department
                              </div>
                              <div className="mt-1 text-slate-800">
                                {department || "—"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Location
                              </div>
                              <div className="mt-1 text-slate-800">
                                {location || "—"}
                              </div>
                            </div>
                          </div>
                          {summary ? (
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Summary
                              </div>
                              <div className="mt-1">
                                <RichText content={summary} />
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {description ? (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Description
                            </div>
                            <div className="mt-2">
                              <RichText content={description} />
                            </div>
                          </div>
                        ) : null}

                        {responsibilities ? (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Responsibilities
                            </div>
                            <div className="mt-2">
                              <RichText content={responsibilities} />
                            </div>
                          </div>
                        ) : null}

                        {requirements ? (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Requirements
                            </div>
                            <div className="mt-2">
                              <RichText content={requirements} />
                            </div>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}

                  {showRawDetails ? (
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
