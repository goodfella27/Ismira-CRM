"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  Layers,
  MapPin,
  BriefcaseBusiness,
  FolderKanban,
  PencilLine,
  MoreHorizontal,
  CopyPlus,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";

import DetailsModalShell from "@/components/details-modal-shell";
import { useAppDialogs } from "@/components/app-dialogs";
import { loadBreezyCompanyId, saveBreezyCompanyId } from "@/lib/breezy-storage";
import { extractCompany, extractDepartment } from "@/lib/breezy-position-fields";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  getPriorityLabel,
  normalizePriorityKey,
  type BreezyPriorityType,
} from "@/lib/breezy-priority-types";

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
  hidden?: boolean;
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

type PriorityTypesResponse = {
  priorityTypes?: BreezyPriorityType[];
  warning?: string;
  error?: string;
};

export type BreezyRecordType = "position" | "pool";

type BreezyPositionRecordsBrowserProps = {
  recordType: BreezyRecordType;
  title: string;
  description: string;
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

function parseHiddenFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
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

function extractHeroImageFromSafeHtml(html: string): { heroSrc: string; bodyHtml: string } {
  const raw = html.trim();
  if (!raw) return { heroSrc: "", bodyHtml: "" };
  if (typeof window === "undefined") return { heroSrc: "", bodyHtml: "" };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");
    const firstImg = doc.body.querySelector("img[src]") as HTMLImageElement | null;
    const heroSrc = firstImg?.getAttribute("src")?.trim() ?? "";
    if (firstImg) {
      const parent = firstImg.parentElement;
      firstImg.remove();
      if (parent) {
        const text = parent.textContent?.trim() ?? "";
        const hasChild = parent.querySelector("*");
        if (!text && !hasChild) parent.remove();
      }
    }
    return { heroSrc, bodyHtml: doc.body.innerHTML };
  } catch {
    return { heroSrc: "", bodyHtml: raw };
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

export default function BreezyPositionRecordsBrowser({
  recordType,
  title,
  description,
}: BreezyPositionRecordsBrowserProps) {
  const dialogs = useAppDialogs();
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [syncingPositions, setSyncingPositions] = useState(false);
  const [companies, setCompanies] = useState<BreezyCompany[]>([]);
  const [positions, setPositions] = useState<BreezyPosition[]>([]);
  // Don't read localStorage during the initial render; it causes hydration mismatches.
  const [companyId, setCompanyId] = useState("");
  const [filter, setFilter] = useState("");
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
  const [editing, setEditing] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [visibilityMenuOpen, setVisibilityMenuOpen] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [cardMenuOpenId, setCardMenuOpenId] = useState<string | null>(null);
  const [cardMenuSavingId, setCardMenuSavingId] = useState<string | null>(null);
  const [priorityTypes, setPriorityTypes] = useState<BreezyPriorityType[]>(
    DEFAULT_BREEZY_PRIORITY_TYPES
  );
  const [priorityTypesWarning, setPriorityTypesWarning] = useState<string | null>(null);
  const [priorityTypesModalOpen, setPriorityTypesModalOpen] = useState(false);
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, string>>({});
  const [newPriorityLabel, setNewPriorityLabel] = useState("");
  const [prioritySaving, setPrioritySaving] = useState(false);
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

  const availablePriorityTypes = useMemo(() => priorityTypes, [priorityTypes]);

  const closePositionModal = useCallback(() => {
    setSelectedPositionId(null);
    setSelectedPositionLabel(null);
    setDetails(null);
    setDetailsOverrides({});
    setCanEdit(false);
    setEditing(false);
    setPriorityTypesModalOpen(false);
    setVisibilityMenuOpen(false);
  }, []);

  const setCardHidden = useCallback(
    async (positionId: string, hidden: boolean) => {
      const posId = positionId.trim();
      if (!posId) return;
      const targetCompanyId = companyId.trim();
      if (!targetCompanyId) return;

      setCardMenuSavingId(posId);
      setError(null);
      try {
        const url = `/api/breezy/positions-cache/${encodeURIComponent(
          posId
        )}?companyId=${encodeURIComponent(targetCompanyId)}`;
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides: { hidden } }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (data && typeof data?.error === "string" && data.error) ||
              "Failed to update visibility."
          );
        }

        setPositions((prev) =>
          prev.map((item) =>
            item.id === posId
              ? {
                  ...item,
                  hidden,
                  edited: hidden ? true : item.edited,
                }
              : item
          )
        );
        if (selectedPositionId === posId) {
          setDetailsOverrides((prev) => ({ ...prev, hidden }));
          setDetails((prev) => {
            if (!prev || !isRecord(prev)) return prev;
            const next = { ...(prev as Record<string, unknown>) };
            if (hidden) next.hidden = true;
            else delete next.hidden;
            return next;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update visibility.");
      } finally {
        setCardMenuSavingId((current) => (current === posId ? null : current));
        setCardMenuOpenId((current) => (current === posId ? null : current));
      }
    },
    [companyId, selectedPositionId]
  );

  const duplicateCardPosition = useCallback(
    async (positionId: string) => {
      const posId = positionId.trim();
      if (!posId) return;
      const targetCompanyId = companyId.trim();
      if (!targetCompanyId) return;

      setCardMenuSavingId(posId);
      setError(null);
      try {
        const url = `/api/breezy/positions-cache/${encodeURIComponent(
          posId
        )}/duplicate?companyId=${encodeURIComponent(targetCompanyId)}`;
        const res = await fetch(url, { method: "POST" });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (data && typeof data?.error === "string" && data.error) ||
              "Failed to duplicate record."
          );
        }

        const next =
          data && typeof data === "object"
            ? (data as { position?: BreezyPosition }).position
            : null;
        if (next && next.id) {
          setPositions((prev) => {
            const merged = [next, ...prev.filter((item) => item.id !== next.id)];
            merged.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            return merged;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to duplicate record.");
      } finally {
        setCardMenuSavingId((current) => (current === posId ? null : current));
        setCardMenuOpenId((current) => (current === posId ? null : current));
      }
    },
    [companyId]
  );

  const deleteCardPosition = useCallback(
    async (positionId: string) => {
      const posId = positionId.trim();
      if (!posId) return;
      const targetCompanyId = companyId.trim();
      if (!targetCompanyId) return;
      const confirmed = await dialogs.confirm({
        title: "Delete cached record?",
        message: "You can restore Breezy items later by syncing again.",
        confirmText: "Delete",
        cancelText: "Cancel",
        tone: "danger",
      });
      if (!confirmed) {
        setCardMenuOpenId(null);
        return;
      }

      setCardMenuSavingId(posId);
      setError(null);
      try {
        const url = `/api/breezy/positions-cache/${encodeURIComponent(
          posId
        )}?companyId=${encodeURIComponent(targetCompanyId)}`;
        const res = await fetch(url, { method: "DELETE" });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (data && typeof data?.error === "string" && data.error) ||
              "Failed to delete record."
          );
        }

        setPositions((prev) => prev.filter((item) => item.id !== posId));
        if (selectedPositionId === posId) closePositionModal();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete record.");
      } finally {
        setCardMenuSavingId((current) => (current === posId ? null : current));
        setCardMenuOpenId((current) => (current === posId ? null : current));
      }
    },
    [companyId, selectedPositionId, closePositionModal, dialogs]
  );

  const modalDescription = useMemo(() => {
    const raw = getFirstStringField(details, [
      "description",
      "description_html",
      "description_text",
      "job_description",
      "content",
    ]);
    if (!raw.trim()) return { heroSrc: "", bodyHtml: "", bodyText: "" };
    if (!containsHtml(raw)) return { heroSrc: "", bodyHtml: "", bodyText: raw.trim() };
    const safeHtml = sanitizeHtml(raw);
    const extracted = extractHeroImageFromSafeHtml(safeHtml);
    return { heroSrc: extracted.heroSrc, bodyHtml: extracted.bodyHtml, bodyText: "" };
  }, [details]);

  const isHidden = useMemo(() => {
    const override = (detailsOverrides as Record<string, unknown>)?.hidden;
    if (parseHiddenFlag(override)) return true;
    if (override === false) return false;
    const detailValue =
      details && isRecord(details) ? (details as Record<string, unknown>).hidden : undefined;
    return parseHiddenFlag(detailValue);
  }, [details, detailsOverrides]);

  const filteredPositions = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const typeFiltered = positions.filter((pos) => {
      const kind = normalizePositionType(pos.org_type);
      return kind === recordType;
    });

    if (!query) return typeFiltered;
    return typeFiltered.filter((pos) => {
      const haystack =
        `${pos.name ?? ""} ${pos.company ?? ""} ${pos.department ?? ""} ${pos.state ?? ""} ${pos.org_type ?? ""} ${pos.friendly_id ?? ""} ${pos.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [positions, filter, recordType]);

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

  const loadPositionDetails = useCallback(async (positionId: string, label?: string) => {
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
  }, [companyId]);

  const openPositionEditor = useCallback(async (positionId: string, label?: string) => {
    await loadPositionDetails(positionId, label);
    setEditing(true);
  }, [loadPositionDetails]);

  const positionCards = useMemo(() => {
    return filteredPositions.map((pos, index) => {
      const id = pos.id;
      const name = pos.name || pos.friendly_id || id || "Position";
      const active = Boolean(id && selectedPositionId === id);
      const orgType = normalizePositionType(pos.org_type);
      const company = asString(pos.company).trim();
      const companyLogoUrl = companyLogoByName[company.toLowerCase()] ?? "";
      const department = asString(pos.department).trim();
      const priority = asString(pos.priority).trim().toLowerCase();
      const priorityLabel = getPriorityLabel(priority, availablePriorityTypes);
      const hidden = Boolean(pos.hidden) && orgType !== "pool";
      const stateNormalized = asString(pos.state).trim().toLowerCase();
      const statusBorderAccent = hidden
        ? "border-l-rose-500"
        : stateNormalized === "published"
          ? "border-l-emerald-500"
          : "border-l-slate-200";
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
            "group relative flex w-full items-start justify-between gap-4 rounded-3xl border border-l-[6px] bg-white p-5 text-left shadow-sm transition hover:shadow-md",
            id ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/25" : "",
            active
              ? "border-emerald-200 ring-2 ring-emerald-500/20"
              : "border-slate-200 hover:border-emerald-200",
            statusBorderAccent,
          ].join(" ")}
          onClick={() => (id ? void loadPositionDetails(id, name) : undefined)}
          onKeyDown={(event) => {
            if (!id) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            void loadPositionDetails(id, name);
          }}
        >
          <div className="flex w-full min-w-0 items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
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

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div
                      title={name}
                      className={[
                        "min-w-0 break-words text-[18px] font-extrabold leading-snug text-slate-900",
                        "[display:-webkit-box] [-webkit-box-orient:vertical] overflow-hidden",
                        "[-webkit-line-clamp:2]",
                      ].join(" ")}
                    >
                      {name}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                  {priorityLabel ? (
                    <span
                      className={[
                        "inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
                        "bg-gradient-to-r from-[#ffbf5f] to-[#ff9d2e] text-white shadow-orange-200/40",
                      ].join(" ")}
                      title="Type"
                    >
                      {priorityLabel}
                    </span>
                  ) : null}

                  {department ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-gradient-to-r from-sky-100 to-cyan-100 px-2.5 py-1.5 text-sky-950 shadow-sm shadow-sky-200/40">
                      <Layers className="h-3.5 w-3.5 text-sky-600" />
                      <span className="max-w-[260px] truncate whitespace-nowrap">{department}</span>
                    </span>
                  ) : null}

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
                      <span className="max-w-[220px] truncate whitespace-nowrap">{company}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

	            <div className="shrink-0">
	              <div className="flex min-h-[40px] items-center justify-end gap-2">
	                {hidden ? (
	                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900 shadow-sm shadow-amber-200/40">
	                    Not active
	                  </span>
	                ) : null}
	                {pos.edited ? (
	                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 shadow-sm">
	                    Edited
	                  </span>
	                ) : null}

	                {id ? (
	                  <div className="relative">
	                    <button
	                      type="button"
	                      aria-label="Actions"
	                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
	                      onClick={(event) => {
	                        event.stopPropagation();
	                        setCardMenuOpenId((current) => (current === id ? null : id));
	                      }}
	                      disabled={cardMenuSavingId === id}
	                      title="Actions"
	                    >
	                      <MoreHorizontal className="h-5 w-5" />
	                    </button>

	                    {cardMenuOpenId === id ? (
	                      <div
	                        className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
	                        onClick={(event) => event.stopPropagation()}
	                      >
	                        <button
	                          type="button"
	                          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
	                          onClick={() => {
	                            setCardMenuOpenId(null);
	                            void openPositionEditor(id, name);
	                          }}
	                        >
	                          <PencilLine className="h-4 w-4" />
	                          Edit
	                        </button>
	                        <button
	                          type="button"
	                          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
	                          onClick={() => void duplicateCardPosition(id)}
	                          disabled={cardMenuSavingId === id}
	                        >
	                          <CopyPlus className="h-4 w-4" />
	                          Duplicate
	                        </button>
	                        {orgType !== "pool" ? (
	                          <button
	                            type="button"
	                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
	                            onClick={() => void setCardHidden(id, !hidden)}
	                            disabled={cardMenuSavingId === id}
	                          >
	                            {hidden ? (
	                              <Eye className="h-4 w-4" />
	                            ) : (
	                              <EyeOff className="h-4 w-4" />
	                            )}
	                            {hidden ? "Unhide" : "Hide"}
	                          </button>
	                        ) : null}
	                        <button
	                          type="button"
	                          className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
	                          onClick={() => void deleteCardPosition(id)}
	                          disabled={cardMenuSavingId === id}
	                        >
	                          <Trash2 className="h-4 w-4" />
	                          Delete
	                        </button>
	                      </div>
	                    ) : null}
	                  </div>
	                ) : null}
	              </div>
	            </div>
	          </div>
	        </div>
	      );
    });
  }, [
    availablePriorityTypes,
    companyLogoByName,
    filteredPositions,
    loadPositionDetails,
	    openPositionEditor,
	    selectedPositionId,
      cardMenuOpenId,
      cardMenuSavingId,
      setCardHidden,
      duplicateCardPosition,
      deleteCardPosition,
	  ]);

  const loadPriorityTypes = async () => {
    try {
      const res = await fetch("/api/breezy/priority-types", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as PriorityTypesResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load priority types.");
      }
      const next = Array.isArray(data?.priorityTypes)
        ? data.priorityTypes
        : DEFAULT_BREEZY_PRIORITY_TYPES;
      setPriorityTypes(next);
      setPriorityDrafts(
        Object.fromEntries(next.map((item) => [normalizePriorityKey(item.key), item.label]))
      );
      setPriorityTypesWarning(typeof data?.warning === "string" ? data.warning : null);
    } catch (err) {
      setPriorityTypes(DEFAULT_BREEZY_PRIORITY_TYPES);
      setPriorityDrafts(
        Object.fromEntries(
          DEFAULT_BREEZY_PRIORITY_TYPES.map((item) => [normalizePriorityKey(item.key), item.label])
        )
      );
      setPriorityTypesWarning(err instanceof Error ? err.message : "Failed to load priority types.");
    }
  };

  const createPriorityType = async () => {
    const label = newPriorityLabel.trim();
    if (!label) return;
    setPrioritySaving(true);
    setError(null);
    try {
      const res = await fetch("/api/breezy/priority-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = (await res.json().catch(() => null)) as PriorityTypesResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create priority type.");
      }
      setNewPriorityLabel("");
      await loadPriorityTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create priority type.");
    } finally {
      setPrioritySaving(false);
    }
  };

  const updatePriorityType = async (key: string) => {
    const normalized = normalizePriorityKey(key);
    const label = (priorityDrafts[normalized] ?? "").trim();
    if (!normalized || !label) return;
    setPrioritySaving(true);
    setError(null);
    try {
      const res = await fetch("/api/breezy/priority-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: normalized, label }),
      });
      const data = (await res.json().catch(() => null)) as PriorityTypesResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update priority type.");
      }
      await loadPriorityTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update priority type.");
    } finally {
      setPrioritySaving(false);
    }
  };

  const deletePriorityType = async (key: string) => {
    const normalized = normalizePriorityKey(key);
    if (!normalized) return;
    setPrioritySaving(true);
    setError(null);
    try {
      const res = await fetch("/api/breezy/priority-types", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: normalized }),
      });
      const data = (await res.json().catch(() => null)) as PriorityTypesResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete priority type.");
      }
      if (normalizePriorityKey(editForm.priority) === normalized) {
        setEditForm((prev) => ({ ...prev, priority: "" }));
      }
      await loadPriorityTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete priority type.");
    } finally {
      setPrioritySaving(false);
    }
  };

  const setHiddenOverride = async (hidden: boolean) => {
    const posId = (selectedPositionId ?? "").trim();
    if (!posId) return;
    const targetCompanyId = companyId.trim();
    if (!targetCompanyId) return;

    setVisibilitySaving(true);
    setError(null);
    try {
      const url = `/api/breezy/positions-cache/${encodeURIComponent(
        posId
      )}?companyId=${encodeURIComponent(targetCompanyId)}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: { hidden } }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to update visibility."
        );
      }
      setDetailsOverrides((prev) => ({ ...prev, hidden }));
      setDetails((prev) => {
        if (!prev || !isRecord(prev)) return prev;
        const next = { ...(prev as Record<string, unknown>) };
        if (hidden) next.hidden = true;
        else delete next.hidden;
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update visibility.");
    } finally {
      setVisibilitySaving(false);
      setVisibilityMenuOpen(false);
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
    void loadPriorityTypes();
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
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {description}
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
              {recordType === "pool" ? "Filter pools" : "Filter positions"}
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
              {recordType === "pool"
                ? "Pools are separated from live job openings so the data model stays cleaner as this grows."
                : "Tip: pick a Position ID to set as `BREEZY_POSITION_ID`."}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              View
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm">
                {recordType === "pool" ? (
                  <FolderKanban className="h-4 w-4" />
                ) : (
                  <BriefcaseBusiness className="h-4 w-4" />
                )}
                <span>{recordType === "pool" ? "Pools" : "Positions"}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                  {filteredPositions.length}
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {recordType === "pool"
                ? "Dedicated pool view, separate from active job openings."
                : "Dedicated positions view, separate from candidate pools."}
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
              {recordType === "pool" ? "pools" : "positions"}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {loadingPositions ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                Loading positions…
              </div>
            ) : filteredPositions.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                No {recordType === "pool" ? "pools" : "positions"} found.
              </div>
            ) : (
              positionCards
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
        <DetailsModalShell
          open
          labelledBy="breezy-position-modal-title"
          onClose={closePositionModal}
          hero={
            <div className="h-40 w-full bg-gradient-to-br from-[#ffc45c] via-[#58d0d8] to-[#3ea4e6] sm:h-56">
              {modalDescription.heroSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={modalDescription.heroSrc}
                  alt=""
                  className="h-full w-full object-cover object-top"
                  loading="eager"
                  decoding="async"
                />
              ) : null}
            </div>
          }
          heroActions={
            <>
              {!editing && canEdit ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur hover:bg-white disabled:opacity-60"
                  onClick={() => setEditing(true)}
                  disabled={detailsLoading || !details}
                  title="Edit fields"
                >
                  Edit
                </button>
              ) : null}
              {!editing && canEdit ? (
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Menu"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/85 text-slate-800 shadow-sm backdrop-blur hover:bg-white disabled:opacity-60"
                    onClick={(event) => {
                      event.stopPropagation();
                      setVisibilityMenuOpen((prev) => !prev);
                    }}
                    disabled={detailsLoading || visibilitySaving}
                    title="Actions"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>

                  {visibilityMenuOpen ? (
                    <div className="absolute right-0 top-12 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                        onClick={() => void setHiddenOverride(!isHidden)}
                        disabled={visibilitySaving}
                      >
                        {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        {isHidden ? "Unhide" : "Hide"}
                      </button>
                      <div className="px-4 pb-3 text-[11px] leading-4 text-slate-500">
                        Hidden jobs are removed from the public jobs page.
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                aria-label="Close"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm hover:bg-black focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-transparent"
                onClick={closePositionModal}
                disabled={savingEdits}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ×
                </span>
              </button>
            </>
          }
          stickyHeader={
            <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 px-6 pb-5 pt-6 backdrop-blur">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="mb-3">
                    {(() => {
                      const company = details ? extractCompany(details) : "";
                      const logoSrc = company
                        ? companyLogoByName[company.toLowerCase()] ?? ""
                        : "";
                      return company ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-2 pr-2">
                            {logoSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={logoSrc}
                                alt={company}
                                className="h-8 w-8 flex-none rounded-full bg-white object-cover shadow-sm ring-1 ring-slate-200"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : null}
                            <span className="max-w-[340px] whitespace-nowrap text-sm font-semibold text-slate-800 truncate">
                              {company}
                            </span>
                          </span>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div
                    id="breezy-position-modal-title"
                    className="mt-2 text-xl font-extrabold leading-tight text-slate-900 break-words sm:text-2xl"
                  >
                    {detailsLoading
                      ? "Loading…"
                      : getFirstStringField(details, ["name", "title"]) ||
                        selectedPositionLabel ||
                        selectedPositionId}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      {recordType === "pool" ? "Pool" : "Position"}
                    </span>
                    {isHidden ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 shadow-sm shadow-amber-200/40">
                        Not active
                      </span>
                    ) : null}
                    {(() => {
                      const department = details ? extractDepartment(details) : "";
                      const location = details ? formatPositionLocation(details) : "";
                      const state = getFirstStringField(details, ["state", "status"]);
                      const metaBadges = [
                        department ? { key: "department", label: department } : null,
                        location ? { key: "location", label: location } : null,
                        state ? { key: "state", label: state } : null,
                      ].filter(Boolean) as Array<{ key: string; label: string }>;

                      return metaBadges.length > 0 ? (
                        <>
                          {metaBadges.map((badge) => (
                            <span
                              key={badge.key}
                              className={[
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm",
                                badge.key === "department"
                                  ? "border-amber-200 bg-gradient-to-r from-amber-100 to-[#ffc45c]/70 text-amber-950 shadow-amber-200/40"
                                  : badge.key === "location"
                                    ? "border-cyan-200 bg-gradient-to-r from-cyan-100 to-sky-100 text-cyan-950 shadow-cyan-200/40"
                                    : "border-slate-200 bg-slate-100 text-slate-700 shadow-slate-200/40",
                              ].join(" ")}
                            >
                              {badge.key === "department" ? (
                                <Layers className="h-3.5 w-3.5 text-amber-600" />
                              ) : badge.key === "location" ? (
                                <MapPin className="h-3.5 w-3.5 text-cyan-600" />
                              ) : (
                                <BriefcaseBusiness className="h-3.5 w-3.5 text-slate-500" />
                              )}
                              <span className="min-w-0 max-w-[320px] whitespace-nowrap truncate">
                                {badge.label}
                              </span>
                            </span>
                          ))}
                        </>
                      ) : null;
                    })()}
                  </div>

                  {!editing && !detailsLoading && details && !canEdit ? (
                    <div className="mt-3 text-[11px] text-slate-500">
                      Editing is disabled:{" "}
                      {isPositionsTableMissing
                        ? "apply `supabase/breezy_positions.sql` in Supabase to enable caching/overrides."
                        : "your user must be `Admin` in `company_members`."}
                    </div>
                  ) : null}
                </div>

                {!editing && canEdit ? (
                  <button
                    type="button"
                    className="inline-flex h-16 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2f7de1] to-[#64c8ff] px-10 text-base font-semibold text-white shadow-xl shadow-sky-200/70 ring-1 ring-white/20 hover:from-[#256fd2] hover:to-[#55bbff] focus:outline-none focus:ring-2 focus:ring-sky-300/60 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-70 sm:justify-self-end"
                    onClick={() => setEditing(true)}
                    disabled={detailsLoading || !details}
                  >
                    <PencilLine className="h-5 w-5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                ) : null}
              </div>
            </div>
          }
          footer={
            <>
              {editing ? (
                <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-60"
                      onClick={() => void resetEdits()}
                      disabled={savingEdits}
                    >
                      Reset edits
                    </button>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        onClick={() => setEditing(false)}
                        disabled={savingEdits}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-950 bg-slate-950 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                        onClick={() => void saveEdits()}
                        disabled={savingEdits || detailsLoading}
                      >
                        {savingEdits ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {priorityTypesModalOpen ? (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
                  onClick={() => setPriorityTypesModalOpen(false)}
                >
                  <div
                    className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Priority types</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Edit labels, add new types, or remove old ones.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        onClick={() => setPriorityTypesModalOpen(false)}
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {availablePriorityTypes.map((type) => {
                        const key = normalizePriorityKey(type.key);
                        return (
                          <div
                            key={key}
                            className="grid gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                          >
                            <input
                              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                              value={priorityDrafts[key] ?? type.label}
                              disabled={prioritySaving}
                              onChange={(event) =>
                                setPriorityDrafts((prev) => ({
                                  ...prev,
                                  [key]: event.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                              onClick={() => void updatePriorityType(key)}
                              disabled={prioritySaving || !(priorityDrafts[key] ?? type.label).trim()}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                              onClick={() => void deletePriorityType(key)}
                              disabled={prioritySaving}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        );
                      })}

                      <div className="grid gap-2 rounded-2xl border border-dashed border-slate-300 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                          placeholder="New type label"
                          value={newPriorityLabel}
                          disabled={prioritySaving}
                          onChange={(event) => setNewPriorityLabel(event.target.value)}
                        />
                        <button
                          type="button"
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-950 bg-slate-950 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                          onClick={() => void createPriorityType()}
                          disabled={prioritySaving || !newPriorityLabel.trim()}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add type
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          }
        >
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
                                <div className="flex items-center gap-2">
                                  <select
                                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                                    value={editForm.priority}
                                    disabled={savingEdits || prioritySaving}
                                    onChange={(event) =>
                                      setEditForm((prev) => ({
                                        ...prev,
                                        priority: event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">None</option>
                                    {editForm.priority &&
                                    !availablePriorityTypes.some(
                                      (type) =>
                                        normalizePriorityKey(type.key) ===
                                        normalizePriorityKey(editForm.priority)
                                    ) ? (
                                      <option value={normalizePriorityKey(editForm.priority)}>
                                        {getPriorityLabel(editForm.priority, availablePriorityTypes)}
                                      </option>
                                    ) : null}
                                    {availablePriorityTypes.map((type) => (
                                      <option key={type.key} value={normalizePriorityKey(type.key)}>
                                        {type.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="h-11 shrink-0 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                                    onClick={() => setPriorityTypesModalOpen(true)}
                                    disabled={savingEdits || prioritySaving || !canEdit}
                                  >
                                    Manage
                                  </button>
                                </div>
                                {priorityTypesWarning ? (
                                  <div className="text-[11px] text-amber-700">{priorityTypesWarning}</div>
                                ) : null}
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
                          </div>
                        </div>
                      );
                    }

                    return (
                      <>
                        {description ? (
                          <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Description
                            </div>
                            <div className="mt-2">
                              {modalDescription.bodyHtml ? (
                                <RichText content={modalDescription.bodyHtml} />
                              ) : (
                                <div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                                  {modalDescription.bodyText || description}
                                </div>
                              )}
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

                </div>
              ) : (
                <div className="text-sm text-slate-500">No details returned.</div>
              )}

        </DetailsModalShell>
      ) : null}
    </div>
  );
}
