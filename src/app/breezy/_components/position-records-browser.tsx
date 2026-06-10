"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignJustify,
  Building2,
  RefreshCw,
  Search,
  ChevronDown,
  Check,
  Coins,
  Compass,
  FileText,
  GraduationCap,
  HeartPulse,
  House,
  Layers,
  MapPin,
  FolderKanban,
  PencilLine,
  MoreHorizontal,
  Eye,
  EyeOff,
  Plane,
  Plus,
  Shield,
  TrendingUp,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";

import DetailsModalShell from "@/components/details-modal-shell";
import WysiwygEditor from "@/components/wysiwyg-editor";
import { loadBreezyCompanyId, saveBreezyCompanyId } from "@/lib/breezy-storage";
import { extractCompany, extractDepartment } from "@/lib/breezy-position-fields";
import { AVAILABLE_BENEFIT_TAGS, BENEFIT_TAG_LABELS, type BenefitTag } from "@/lib/job-benefits";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  getPriorityLabel,
  humanizePriorityKey,
  normalizePriorityKey,
  type BreezyPriorityType,
} from "@/lib/breezy-priority-types";

const PRIORITY_BADGE_STYLES = [
  "bg-gradient-to-r from-[#ff9d2e] to-[#ffbf5f] text-white shadow-orange-200/40",
  "bg-gradient-to-r from-[#58d0d8] to-[#3ea4e6] text-white shadow-sky-200/50",
  "bg-gradient-to-r from-[#8b5cf6] to-[#c084fc] text-white shadow-violet-200/40",
  "bg-gradient-to-r from-[#22c55e] to-[#14b8a6] text-white shadow-emerald-200/40",
];

function getPriorityBadgeClass(key: string, types: BreezyPriorityType[]) {
  const normalized = normalizePriorityKey(key);
  if (!normalized) return "";
  const index = types.findIndex((item) => normalizePriorityKey(item.key) === normalized);
  return PRIORITY_BADGE_STYLES[(index >= 0 ? index : 0) % PRIORITY_BADGE_STYLES.length];
}

function ModalCloseButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="Close"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-60"
      onClick={onClick}
      disabled={disabled}
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

type BreezyCompany = {
  _id?: string;
  id?: string;
  name?: string;
};

type BreezyPosition = {
  id: string;
  view_id?: string;
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
  total?: number;
  nextOffset?: number | null;
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
    id?: string;
    name?: string;
    logoUrl?: string | null;
    benefitTags?: string[];
  }>;
};

type JobCompanyPickerOption = {
  id?: string;
  name: string;
  logoUrl: string;
  count: number;
  benefitTags: BenefitTag[];
};

const DEFAULT_PROCESSABLE_COUNTRIES = [
  { code: "LT", name: "Lithuania" },
  { code: "LV", name: "Latvia" },
  { code: "EE", name: "Estonia" },
  { code: "PL", name: "Poland" },
  { code: "MD", name: "Moldova" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "AM", name: "Armenia" },
  { code: "GE", name: "Georgia" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "UA", name: "Ukraine" },
  { code: "RU", name: "Russia" },
  { code: "BY", name: "Belarus" },
] as const;

const DEFAULT_PROCESSABLE_COUNTRY_CODES = DEFAULT_PROCESSABLE_COUNTRIES.map((country) => country.code);

type CompanyCountsResponse = {
  companies?: Array<{ name?: string; count?: number }>;
  warning?: string;
  error?: string;
};

type PriorityCountsResponse = {
  priorities?: Array<{ key?: string; count?: number }>;
  warning?: string;
  error?: string;
};

type JobDepartmentOption = {
  key: string;
  label: string;
  count: number;
  isHidden: boolean;
};

type JobDepartmentsResponse = {
  departments?: JobDepartmentOption[];
  error?: string;
};

type PriorityTypesResponse = {
  priorityTypes?: BreezyPriorityType[];
  warning?: string;
  error?: string;
};

export type BreezyRecordType = "position" | "pool";

type BreezyPositionRecordsBrowserProps = {
  recordType: BreezyRecordType;
  title?: string;
  description?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toFlagEmoji(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return normalized
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

function getBenefitIcon(tag: BenefitTag) {
  switch (tag) {
    case "accommodation":
      return House;
    case "meals":
      return UtensilsCrossed;
    case "travel_tickets":
      return Plane;
    case "visa_support":
      return Shield;
    case "medical_exam":
      return HeartPulse;
    case "certification":
      return GraduationCap;
    case "bonus_tips":
      return Coins;
    case "contract_length":
      return FileText;
    case "growth":
      return TrendingUp;
    case "travel_opportunity":
      return Compass;
  }
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

function normalizeStringList(payload: unknown) {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of payload) {
    const value = typeof item === "string" ? item.trim().replace(/\s+/g, " ") : "";
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    list.push(value);
  }
  return list;
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

function extractApiErrorMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) return fallback;
  const direct = asString(payload.error).trim() || asString(payload.message).trim();
  if (direct && direct !== "Breezy request failed") return direct;
  const details = payload.details;
  if (typeof details === "string" && details.trim()) return details.trim();
  if (isRecord(details)) {
    const detailMessage =
      asString(details.message).trim() ||
      asString(details.error).trim() ||
      asString(details.description).trim();
    if (detailMessage) return detailMessage;
  }
  return direct || fallback;
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

function sanitizeOverrideValue(key: string, value: unknown) {
  if (typeof value !== "string") return value;
  if (!value.trim()) return value;
  if (!["description", "responsibilities", "requirements"].includes(key)) return value;
  return containsHtml(value) ? sanitizeHtml(value) : value;
}

function sanitizeOverrides(overrides: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...overrides };
  for (const [key, value] of Object.entries(next)) {
    next[key] = sanitizeOverrideValue(key, value);
  }
  return next;
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

export default function BreezyPositionRecordsBrowser({
  recordType,
  title,
  description,
}: BreezyPositionRecordsBrowserProps) {
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [companies, setCompanies] = useState<BreezyCompany[]>([]);
  const [positions, setPositions] = useState<BreezyPosition[]>([]);
  // Don't read localStorage during the initial render; it causes hydration mismatches.
  const [companyId, setCompanyId] = useState("");
  const [filter, setFilter] = useState("");
  const [serverFilter, setServerFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [positionsTotal, setPositionsTotal] = useState<number | null>(null);
  const [positionsNextOffset, setPositionsNextOffset] = useState<number | null>(null);
  const [loadingMorePositions, setLoadingMorePositions] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [loadMoreInView, setLoadMoreInView] = useState(false);
  const positionsQueryKeyRef = useRef<string>("");
  const [jobCompanies, setJobCompanies] = useState<
    Array<{ id?: string; name: string; logoUrl: string; benefitTags: BenefitTag[] }>
  >([]);
  const [jobCompanyFilter, setJobCompanyFilter] = useState("");
  const [openingTypeFilter, setOpeningTypeFilter] = useState("");
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [companyCounts, setCompanyCounts] = useState<Array<{ name: string; count: number }>>([]);
  const [companyCountsLoading, setCompanyCountsLoading] = useState(false);
  const [priorityCounts, setPriorityCounts] = useState<Array<{ key: string; count: number }>>([]);
  const [priorityCountsLoading, setPriorityCountsLoading] = useState(false);
  const [priorityCountsRefreshKey, setPriorityCountsRefreshKey] = useState(0);
  const collapsedCompaniesRowRef = useRef<HTMLDivElement | null>(null);
  const [collapsedCompaniesLimit, setCollapsedCompaniesLimit] = useState(8);
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
  const [detailsCompanyNames, setDetailsCompanyNames] = useState<string[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [createOpeningOpen, setCreateOpeningOpen] = useState(false);
  const [createOpeningSaving, setCreateOpeningSaving] = useState(false);
  const [createOpeningError, setCreateOpeningError] = useState<string | null>(null);
  const [createOpeningUploadingHero, setCreateOpeningUploadingHero] = useState(false);
  const [createCompanyPickerOpen, setCreateCompanyPickerOpen] = useState(false);
  const [createCompanyQuery, setCreateCompanyQuery] = useState("");
  const [createDepartmentPickerOpen, setCreateDepartmentPickerOpen] = useState(false);
  const [createDepartmentQuery, setCreateDepartmentQuery] = useState("");
  const [createPriorityPickerOpen, setCreatePriorityPickerOpen] = useState(false);
  const [createPriorityQuery, setCreatePriorityQuery] = useState("");
  const [createOpeningDraft, setCreateOpeningDraft] = useState(() => ({
    name: "",
    company: "",
    department: "",
    priority: "",
    location_name: "",
    benefit_tags: [] as BenefitTag[],
    processable_country_codes: DEFAULT_PROCESSABLE_COUNTRY_CODES,
    summary: "",
    description: "",
    responsibilities: "",
    requirements: "",
    hidden: false,
    hero_image_url: "",
  }));
  const [savingEdits, setSavingEdits] = useState(false);
  const [visibilityMenuOpen, setVisibilityMenuOpen] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [cardMenuOpenId, setCardMenuOpenId] = useState<string | null>(null);
  const [cardMenuAnchor, setCardMenuAnchor] = useState<{
    top: number;
    bottom: number;
    right: number;
  } | null>(null);
  const cardMenuRef = useRef<HTMLDivElement | null>(null);
  const cardMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [cardActionSavingId, setCardActionSavingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<null | { positionId: string; label: string }>(
    null
  );
  const [inlineEditField, setInlineEditField] = useState<
    null | "title" | "company" | "department"
  >(null);
  const [priorityTypes, setPriorityTypes] = useState<BreezyPriorityType[]>(
    DEFAULT_BREEZY_PRIORITY_TYPES
  );
  const [priorityTypesWarning, setPriorityTypesWarning] = useState<string | null>(null);
  const [priorityTypesModalOpen, setPriorityTypesModalOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [openingTypePickerOpen, setOpeningTypePickerOpen] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [managedDepartments, setManagedDepartments] = useState<JobDepartmentOption[]>([]);
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, string>>({});
  const [newPriorityLabel, setNewPriorityLabel] = useState("");
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [companyLogoByName, setCompanyLogoByName] = useState<Record<string, string>>(
    {}
  );
  const [editForm, setEditForm] = useState({
    name: "",
    company: "",
    companies: [] as string[],
    department: "",
    priority: "",
    location_name: "",
    summary: "",
    description: "",
    responsibilities: "",
    requirements: "",
  });

  const startEditing = useCallback(() => {
    if (!details) return;

    const merged = details;
    const name = getFirstStringField(merged, ["name", "title"]);
    const company = extractCompany(merged);
    const companies = detailsCompanyNames.length > 0 ? detailsCompanyNames : company ? [company] : [];
    const department = extractDepartment(merged);
    const priority = getFirstStringField(merged, ["priority"]);
    const locationName =
      getFirstStringField(merged, ["location_name", "locationName", "location_label"]) ||
      formatPositionLocation(merged);
    const summary = getFirstStringField(merged, [
      "summary",
      "short_description",
      "description_summary",
    ]);
    const description = getFirstStringField(merged, [
      "description",
      "description_html",
      "description_text",
      "job_description",
      "content",
    ]);
    const requirements = getFirstStringField(merged, [
      "requirements",
      "requirements_html",
      "requirements_text",
    ]);
    const responsibilities = getFirstStringField(merged, [
      "responsibilities",
      "responsibilities_html",
      "responsibilities_text",
    ]);

    setEditForm({
      name: name || selectedPositionLabel || selectedPositionId || "",
      company: companies[0] ?? company ?? "",
      companies,
      department: department || "",
      priority: normalizePriorityKey(priority || ""),
      location_name: locationName || "",
      summary: summary || "",
      description: description || "",
      responsibilities: responsibilities || "",
      requirements: requirements || "",
    });

    setInlineEditField(null);
    setEditing(true);
  }, [details, detailsCompanyNames, selectedPositionId, selectedPositionLabel]);

  const companyPickerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of jobCompanies) {
      const label = asString(item.name).trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (!seen.has(key)) seen.set(key, label);
    }
    for (const pos of positions) {
      const label = asString(pos.company).trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (!seen.has(key)) seen.set(key, label);
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [jobCompanies, positions]);

  const departmentPickerCompany = useMemo(() => {
    const fromEdit = (editForm.companies[0] ?? editForm.company).trim();
    if (fromEdit) return fromEdit;
    const fromDetails = details ? extractCompany(details) : "";
    return asString(fromDetails).trim();
  }, [details, editForm.company, editForm.companies]);

  const departmentPickerOptions = useMemo(() => {
    const targetCompany = departmentPickerCompany.trim().toLowerCase();
    const seen = new Map<string, string>();
    for (const item of managedDepartments) {
      if (item.isHidden) continue;
      const label = asString(item.label).trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (!seen.has(key)) seen.set(key, label);
    }
    for (const pos of positions) {
      const company = asString(pos.company).trim();
      if (targetCompany && company.toLowerCase() !== targetCompany) continue;
      const label = asString(pos.department).trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (!seen.has(key)) seen.set(key, label);
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [departmentPickerCompany, managedDepartments, positions]);

  const createDepartmentOptions = useMemo(() => {
    const targetCompany = createOpeningDraft.company.trim().toLowerCase();
    const seen = new Map<string, string>();
    for (const item of managedDepartments) {
      if (item.isHidden) continue;
      const label = asString(item.label).trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (!seen.has(key)) seen.set(key, label);
    }
    for (const pos of positions) {
      const company = asString(pos.company).trim();
      if (targetCompany && company.toLowerCase() !== targetCompany) continue;
      const label = asString(pos.department).trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (!seen.has(key)) seen.set(key, label);
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [createOpeningDraft.company, managedDepartments, positions]);

  const createDepartmentPickerOptions = useMemo(() => {
    const query = createDepartmentQuery.trim().toLowerCase();
    const list = query
      ? createDepartmentOptions.filter((label) => label.toLowerCase().includes(query))
      : createDepartmentOptions;
    const normalized = new Set(list.map((label) => label.trim().toLowerCase()).filter(Boolean));
    const custom =
      query && !normalized.has(query) ? [createDepartmentQuery.trim().replace(/\s+/g, " ")] : [];
    return [...custom, ...list];
  }, [createDepartmentOptions, createDepartmentQuery]);

  const companyFilterOptions = useMemo<JobCompanyPickerOption[]>(() => {
    const counts = new Map(companyCounts.map((item) => [item.name.toLowerCase(), item.count]));
    const companiesByKey = new Map(
      jobCompanies.map((item) => [item.name.trim().toLowerCase(), item])
    );

    const byCount = (name: string) => counts.get(name.toLowerCase()) ?? 0;
    const uniqueNames = new Map<string, string>();

    for (const item of companyCounts) {
      const name = asString(item.name).trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!uniqueNames.has(key)) uniqueNames.set(key, name);
    }

    for (const item of jobCompanies) {
      const name = asString(item.name).trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!uniqueNames.has(key)) uniqueNames.set(key, name);
    }

    for (const pos of positions) {
      const name = asString(pos.company).trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!uniqueNames.has(key)) uniqueNames.set(key, name);
    }

    const list = Array.from(uniqueNames.values()).map((name) => {
      const key = name.toLowerCase();
      const company = companiesByKey.get(key);
      const logoUrl = company?.logoUrl || companyLogoByName[key] || "";
      return {
        id: company?.id,
        name,
        logoUrl,
        count: byCount(name),
        benefitTags: company?.benefitTags ?? [],
      };
    });

    list.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return list;
  }, [companyCounts, companyLogoByName, jobCompanies, positions]);

  const selectedCreateCompany = useMemo(() => {
    const selected = createOpeningDraft.company.trim().toLowerCase();
    if (!selected) return null;
    return (
      companyFilterOptions.find((item) => item.name.trim().toLowerCase() === selected) ?? null
    );
  }, [companyFilterOptions, createOpeningDraft.company]);

  const createCompanyPickerOptions = useMemo(() => {
    const query = createCompanyQuery.trim().toLowerCase();
    if (!query) return companyFilterOptions;
    return companyFilterOptions.filter((item) => item.name.toLowerCase().includes(query));
  }, [companyFilterOptions, createCompanyQuery]);

  const collapsedCompanyOptions = useMemo(() => {
    const selected = jobCompanyFilter.trim().toLowerCase();
    if (!selected) return companyFilterOptions;
    const idx = companyFilterOptions.findIndex((opt) => opt.name.trim().toLowerCase() === selected);
    if (idx <= 0) return companyFilterOptions;
    const copy = [...companyFilterOptions];
    const [picked] = copy.splice(idx, 1);
    copy.unshift(picked);
    return copy;
  }, [companyFilterOptions, jobCompanyFilter]);

  const filteredPickerOptions = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    const source = companyPickerOpen ? companyPickerOptions : departmentPickerOptions;
    if (!query) return source;
    return source.filter((label) => label.toLowerCase().includes(query));
  }, [companyPickerOpen, companyPickerOptions, departmentPickerOptions, pickerQuery]);

  const isPositionsTableMissing = useMemo(() => {
    const message = (warning ?? "").toLowerCase();
    return message.includes("breezy_positions") && message.includes("not set up");
  }, [warning]);

  const availablePriorityTypes = useMemo(() => priorityTypes, [priorityTypes]);

  const openingTypeFilterOptions = useMemo(() => {
    const counts = new Map(
      priorityCounts
        .map((item) => [normalizePriorityKey(item.key), item.count] as const)
        .filter(([key, count]) => key && count > 0)
    );
    const labels = new Map(
      availablePriorityTypes.map((item) => [
        normalizePriorityKey(item.key),
        item.label.trim(),
      ])
    );

    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        label: labels.get(key) || humanizePriorityKey(key),
        count,
      }))
      .sort((a, b) => {
        const aIndex = availablePriorityTypes.findIndex(
          (item) => normalizePriorityKey(item.key) === a.key
        );
        const bIndex = availablePriorityTypes.findIndex(
          (item) => normalizePriorityKey(item.key) === b.key
        );
        if (aIndex >= 0 || bIndex >= 0) {
          if (aIndex < 0) return 1;
          if (bIndex < 0) return -1;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }
        if (b.count !== a.count) return b.count - a.count;
        return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
      });
  }, [availablePriorityTypes, priorityCounts]);

  const selectedCreatePriorityLabel = useMemo(() => {
    const key = normalizePriorityKey(createOpeningDraft.priority);
    return getPriorityLabel(key, availablePriorityTypes) || "None";
  }, [availablePriorityTypes, createOpeningDraft.priority]);

  const createPriorityPickerOptions = useMemo(() => {
    const query = createPriorityQuery.trim().toLowerCase();
    const options = [{ key: "", label: "None" }, ...availablePriorityTypes];
    if (!query) return options;
    return options.filter((item) => item.label.toLowerCase().includes(query));
  }, [availablePriorityTypes, createPriorityQuery]);

	  const closePositionModal = useCallback(() => {
	    setSelectedPositionId(null);
	    setSelectedPositionLabel(null);
	    setDetails(null);
	    setDetailsOverrides({});
    setDetailsCompanyNames([]);
    setCanEdit(false);
    setEditing(false);
    setInlineEditField(null);
    setPriorityTypesModalOpen(false);
    setStatusPickerOpen(false);
    setOpeningTypePickerOpen(false);
    setCompanyPickerOpen(false);
    setDepartmentPickerOpen(false);
	    setPickerQuery("");
	    setVisibilityMenuOpen(false);
	    setCardMenuOpenId(null);
	    setCardMenuAnchor(null);
	    cardMenuButtonRef.current = null;
	    setDeleteConfirm(null);
	  }, []);

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

  useEffect(() => {
    if (!cardMenuOpenId) return;

	    const onPointerDown = (event: MouseEvent | TouchEvent) => {
	      const target = event.target as Node | null;
	      const root = cardMenuRef.current;
	      const button = cardMenuButtonRef.current;
	      if (!target || !root) {
	        setCardMenuOpenId(null);
	        return;
	      }
	      if (button && button.contains(target)) return;
	      if (root.contains(target)) return;
	      setCardMenuOpenId(null);
	    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCardMenuOpenId(null);
    };

	    const close = () => {
	      setCardMenuOpenId(null);
	      setCardMenuAnchor(null);
	      cardMenuButtonRef.current = null;
	    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [cardMenuOpenId]);

  useEffect(() => {
    if (!deleteConfirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeleteConfirm(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteConfirm]);

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
    const companyFilter = jobCompanyFilter.trim().toLowerCase();
    const priorityFilter = normalizePriorityKey(openingTypeFilter);
    const typeFiltered = positions.filter((pos) => {
      const kind = normalizePositionType(pos.org_type);
      return kind === recordType;
    });

    const companyFiltered = companyFilter
      ? typeFiltered.filter((pos) => asString(pos.company).trim().toLowerCase() === companyFilter)
      : typeFiltered;

    const priorityFiltered = priorityFilter
      ? companyFiltered.filter((pos) => normalizePriorityKey(pos.priority ?? "") === priorityFilter)
      : companyFiltered;

    if (!query) return priorityFiltered;
    return priorityFiltered.filter((pos) => {
      const haystack =
        `${pos.name ?? ""} ${pos.company ?? ""} ${pos.department ?? ""} ${pos.state ?? ""} ${pos.org_type ?? ""} ${pos.friendly_id ?? ""} ${pos.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [positions, filter, jobCompanyFilter, openingTypeFilter, recordType]);

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
    const search = serverFilter.trim();
    const priority = normalizePriorityKey(openingTypeFilter);
    const queryKey = `${target}::${jobCompanyFilter.trim().toLowerCase()}::${priority}::${search.toLowerCase()}`;
    positionsQueryKeyRef.current = queryKey;
    setLoadingPositions(true);
    setLoadingMorePositions(false);
    setError(null);
    setWarning(null);
    setPositionsTotal(null);
    setPositionsNextOffset(null);
    try {
      const jobCompanyQuery = jobCompanyFilter.trim()
        ? `&jobCompany=${encodeURIComponent(jobCompanyFilter.trim())}`
        : "";
      const searchQuery = search
        ? `&search=${encodeURIComponent(search)}`
        : "";
      const priorityQuery = priority
        ? `&priority=${encodeURIComponent(priority)}`
        : "";
      const url = `/api/breezy/positions-cache?companyId=${encodeURIComponent(
        target
      )}&limit=20&offset=0${jobCompanyQuery}${priorityQuery}${searchQuery}`;
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
      setPositionsTotal(typeof parsed?.total === "number" ? parsed.total : null);
      setPositionsNextOffset(
        typeof parsed?.nextOffset === "number" ? parsed.nextOffset : null
      );
    } catch (err) {
      setPositions([]);
      setError(err instanceof Error ? err.message : "Failed to load positions.");
    } finally {
      setLoadingPositions(false);
    }
  };

  const loadMorePositions = useCallback(async () => {
    const target = companyId.trim();
    if (!target) return;
    if (loadingPositions || loadingMorePositions) return;
    if (positionsNextOffset === null) return;

    const search = serverFilter.trim();
    const priority = normalizePriorityKey(openingTypeFilter);
    const queryKey = `${target}::${jobCompanyFilter.trim().toLowerCase()}::${priority}::${search.toLowerCase()}`;
    const keyAtStart = positionsQueryKeyRef.current || queryKey;
    if (keyAtStart !== queryKey) return;

    setLoadingMorePositions(true);
    setError(null);
    try {
      const jobCompanyQuery = jobCompanyFilter.trim()
        ? `&jobCompany=${encodeURIComponent(jobCompanyFilter.trim())}`
        : "";
      const searchQuery = search
        ? `&search=${encodeURIComponent(search)}`
        : "";
      const priorityQuery = priority
        ? `&priority=${encodeURIComponent(priority)}`
        : "";
      const url = `/api/breezy/positions-cache?companyId=${encodeURIComponent(
        target
      )}&limit=20&offset=${encodeURIComponent(String(positionsNextOffset))}${jobCompanyQuery}${priorityQuery}${searchQuery}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 416) {
        // Offset is past the end (typically because filters changed). Treat as end-of-list.
        if (positionsQueryKeyRef.current === keyAtStart) setPositionsNextOffset(null);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load more positions."
        );
      }
      const parsed = isRecord(data) ? (data as CachedPositionsResponse) : null;
      const list = parsed ? normalizePositions(parsed) : [];
      if (positionsQueryKeyRef.current !== keyAtStart) return;
      setPositions((prev) => {
        const seen = new Set(prev.map((p) => p.view_id || p.id));
        const merged = [...prev];
        for (const item of list) {
          const itemKey = item?.view_id || item?.id;
          if (!item?.id || !itemKey || seen.has(itemKey)) continue;
          merged.push(item);
          seen.add(itemKey);
        }
        return merged;
      });
      if (parsed?.warning) setWarning(parsed.warning);
      setPositionsTotal(typeof parsed?.total === "number" ? parsed.total : positionsTotal);
      setPositionsNextOffset(
        typeof parsed?.nextOffset === "number" ? parsed.nextOffset : null
      );
    } catch (err) {
      if (positionsQueryKeyRef.current === keyAtStart) {
        setError(err instanceof Error ? err.message : "Failed to load more positions.");
        setPositionsNextOffset(null);
      }
    } finally {
      setLoadingMorePositions(false);
    }
  }, [
    companyId,
    jobCompanyFilter,
    openingTypeFilter,
    serverFilter,
    loadingMorePositions,
    loadingPositions,
    positionsNextOffset,
    positionsTotal,
  ]);

  const createOpening = async () => {
    const target = companyId.trim();
    if (!target) return;
    const name = createOpeningDraft.name.trim();
    if (!name) {
      setCreateOpeningError("Please enter a job title.");
      return;
    }
    const companyLabel = createOpeningDraft.company.trim();
    if (!companyLabel) {
      setCreateOpeningError("Please select a company.");
      return;
    }
    const descriptionText =
      createOpeningDraft.description.trim() ||
      createOpeningDraft.summary.trim() ||
      name;

    setCreateOpeningSaving(true);
    setCreateOpeningError(null);

    try {
      const res = await fetch("/api/breezy/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: target,
          name,
          description: descriptionText,
          type: "contract",
          job_company: companyLabel,
          job_companies: [companyLabel],
          department: createOpeningDraft.department.trim() || undefined,
          location_name: createOpeningDraft.location_name.trim() || undefined,
          org_type: recordType,
          hidden: createOpeningDraft.hidden,
          benefit_tags: createOpeningDraft.benefit_tags,
          processable_country_codes: createOpeningDraft.processable_country_codes,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Failed to create opening."));
      }

      const createdId =
        (data && typeof (data as { id?: unknown }).id === "string" && (data as { id: string }).id) ||
        (data && typeof (data as { _id?: unknown })._id === "string" && (data as { _id: string })._id) ||
        "";
      if (!createdId) {
        throw new Error("Created opening is missing an id.");
      }

      const overrides: Record<string, unknown> = {
        name: createOpeningDraft.name,
        company: createOpeningDraft.company,
        department: createOpeningDraft.department,
        priority: createOpeningDraft.priority,
        location_name: createOpeningDraft.location_name,
        summary: createOpeningDraft.summary,
        description: createOpeningDraft.description,
        responsibilities: createOpeningDraft.responsibilities,
        requirements: createOpeningDraft.requirements,
        benefit_tags: createOpeningDraft.benefit_tags,
        processable_country_codes: createOpeningDraft.processable_country_codes,
        hidden: createOpeningDraft.hidden ? true : false,
      };

      if (createOpeningDraft.hero_image_url.trim()) {
        const img = `<p><img src="${createOpeningDraft.hero_image_url.trim()}" alt="" /></p>`;
        const next = createOpeningDraft.description.trim()
          ? `${img}\n${createOpeningDraft.description.trim()}`
          : img;
        overrides.description = next;
      }

      const saveRes = await fetch(
        `/api/breezy/positions-cache/${encodeURIComponent(createdId)}?companyId=${encodeURIComponent(
          target
        )}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides, companies: [createOpeningDraft.company.trim()] }),
        }
      );
      const saveData = await saveRes.json().catch(() => null);
      if (!saveRes.ok) {
        throw new Error(
          (saveData && typeof saveData?.error === "string" && saveData.error) ||
            "Failed to save opening details."
        );
      }

      setCreateOpeningOpen(false);
      setCreateOpeningDraft({
        name: "",
        company: "",
        department: "",
        priority: "",
        location_name: "",
        benefit_tags: [],
        processable_country_codes: DEFAULT_PROCESSABLE_COUNTRY_CODES,
        summary: "",
        description: "",
        responsibilities: "",
        requirements: "",
        hidden: false,
        hero_image_url: "",
      });
      await loadPositions(target);
      setPriorityCountsRefreshKey((value) => value + 1);
      await loadPositionDetails(createdId, name);
      setEditing(true);
    } catch (err) {
      setCreateOpeningError(err instanceof Error ? err.message : "Failed to create opening.");
    } finally {
      setCreateOpeningSaving(false);
    }
  };

  const uploadCreateHeroImage = async (file: File) => {
    setCreateOpeningUploadingHero(true);
    setCreateOpeningError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/job-assets/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) || "Image upload failed."
        );
      }
      const url = data && typeof (data as { url?: unknown }).url === "string" ? (data as { url: string }).url : "";
      if (!url.trim()) throw new Error("Upload succeeded but no URL was returned.");
      setCreateOpeningDraft((prev) => ({ ...prev, hero_image_url: url.trim() }));
    } catch (err) {
      setCreateOpeningError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setCreateOpeningUploadingHero(false);
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
    setDetailsCompanyNames([]);
    setCanEdit(false);
    setEditing(false);
    setInlineEditField(null);

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
      const meta = parsed?.meta && isRecord(parsed.meta) ? parsed.meta : {};
      const linkedCompanyNames =
        normalizeStringList(meta.companies).length > 0
          ? normalizeStringList(meta.companies)
          : normalizeStringList(nextDetails?.companies);
      const fallbackCompany = nextDetails ? extractCompany(nextDetails) : "";
      const nextCompanyNames =
        linkedCompanyNames.length > 0
          ? linkedCompanyNames
          : fallbackCompany
            ? [fallbackCompany]
            : [];
      setDetails(nextDetails ?? { data });
      setDetailsCompanyNames(nextCompanyNames);
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
          company: nextCompanyNames[0] ?? pick("company"),
          companies: nextCompanyNames,
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
      const rowKey = pos.view_id || id || `${name}-${index}`;
      const active = Boolean(id && selectedPositionId === id);
      const orgType = normalizePositionType(pos.org_type);
      const company = asString(pos.company).trim();
      const companyLogoUrl = companyLogoByName[company.toLowerCase()] ?? "";
      const department = asString(pos.department).trim();
      const hidden = Boolean(pos.hidden) && orgType !== "pool";
      const stateNormalized = asString(pos.state).trim().toLowerCase();
      const statusTone = hidden
        ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
        : stateNormalized === "published"
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
      const statusLabel = hidden
        ? "Hidden"
        : asString(pos.state).trim() || "Draft";
      const avatarSeed = (company || name).trim() || "P";
      const avatar = avatarSeed.slice(0, 1).toUpperCase();
      const priorityKey = normalizePriorityKey(asString(pos.priority).trim());
      const priorityLabel = priorityKey ? getPriorityLabel(priorityKey, availablePriorityTypes) : "";

      return (
        <tr
          key={rowKey}
          role="button"
          tabIndex={id ? 0 : -1}
          aria-pressed={active}
          className={[
            "group align-middle transition",
            id ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/25" : "",
            active ? "bg-emerald-50" : "hover:bg-slate-50",
          ].join(" ")}
          onClick={() => (id ? void loadPositionDetails(id, name) : undefined)}
          onKeyDown={(event) => {
            if (!id) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            void loadPositionDetails(id, name);
          }}
        >
          <td className="whitespace-nowrap px-4 py-3">
            <div className="flex items-center gap-3" title={company || "Position"}>
              <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-600 shadow-sm">
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
              <span className="sr-only">{company || "Position"}</span>
            </div>
          </td>

          <td className="min-w-[320px] px-4 py-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                {priorityLabel ? (
                  <span
                    className={[
                      "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
                      getPriorityBadgeClass(priorityKey, availablePriorityTypes),
                    ].join(" ")}
                  >
                    <span className="max-w-[220px] truncate whitespace-nowrap">{priorityLabel}</span>
                  </span>
                ) : null}
                <div title={name} className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">
                  {name}
                </div>
              </div>
            </div>
          </td>

          <td className="whitespace-nowrap px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-2">
              {department ? (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-100">
                  <Layers className="h-3.5 w-3.5 text-sky-600" />
                  <span className="max-w-[220px] truncate whitespace-nowrap">{department}</span>
                </span>
              ) : null}
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${statusTone}`}
              >
                {statusLabel}
              </span>
            </div>
          </td>

          <td className="whitespace-nowrap px-4 py-3 text-right">
            {id ? (
              <div className="relative inline-flex">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={cardMenuOpenId === rowKey}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                    cardMenuButtonRef.current = event.currentTarget as HTMLButtonElement;
                    setCardMenuOpenId((prev) => {
                      const next = prev === rowKey ? null : rowKey;
                      if (next) {
                        setCardMenuAnchor({
                          top: rect.top,
                          bottom: rect.bottom,
                          right: rect.right,
                        });
                      } else {
                        setCardMenuAnchor(null);
                        cardMenuButtonRef.current = null;
                      }
                      return next;
                    });
                  }}
                  disabled={cardActionSavingId === id}
                  title="Actions"
                >
                  <AlignJustify className="h-5 w-5" />
                </button>

                {cardMenuOpenId === rowKey ? (
                  typeof document !== "undefined" && cardMenuAnchor
                    ? createPortal(
                        <div
                          ref={cardMenuRef}
                          role="menu"
                          className={[
                            "fixed z-[80] w-56 origin-bottom-right -translate-x-full rounded-2xl border border-slate-200 bg-white shadow-xl",
                            cardMenuAnchor.top > 220 ? "-translate-y-full" : "",
                          ].join(" ")}
                          style={{
                            top: (() => {
                              const up = cardMenuAnchor.top > 220;
                              const target = up
                                ? cardMenuAnchor.top - 8
                                : cardMenuAnchor.bottom + 8;
                              if (typeof window === "undefined") return Math.max(12, target);
                              return Math.max(12, Math.min(window.innerHeight - 12, target));
                            })(),
                            left: Math.min(
                              (typeof window !== "undefined" ? window.innerWidth : 9999) - 12,
                              cardMenuAnchor.right
                            ),
                          }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                            onClick={() => void openPositionEditor(id, name)}
                            disabled={cardActionSavingId === id}
                          >
                            <PencilLine className="h-4 w-4" />
                            Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                            onClick={() => void patchPositionHidden(id, !hidden)}
                            disabled={cardActionSavingId === id}
                          >
                            {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            {hidden ? "Unhide" : "Hide"}
                          </button>
                          <div className="border-t border-slate-200" />
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            onClick={() => requestDeletePosition(id, name)}
                            disabled={cardActionSavingId === id}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>,
                        document.body
                      )
                    : null
                ) : null}
              </div>
            ) : null}
          </td>
        </tr>
      );
    });
		  }, [
		    availablePriorityTypes,
		    cardActionSavingId,
		    cardMenuOpenId,
		    cardMenuAnchor,
		    companyLogoByName,
		    filteredPositions,
		    loadPositionDetails,
		    openPositionEditor,
		    patchPositionHidden,
		    requestDeletePosition,
		    selectedPositionId,
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

  const loadManagedDepartments = async () => {
    try {
      const res = await fetch("/api/company/job-departments", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as JobDepartmentsResponse | null;
      if (!res.ok) throw new Error(data?.error || "Failed to load departments.");
      const departments = Array.isArray(data?.departments)
        ? data.departments
            .map((item) => ({
              key: asString(item.key).trim(),
              label: asString(item.label).trim(),
              count: typeof item.count === "number" && Number.isFinite(item.count) ? item.count : 0,
              isHidden: item.isHidden === true,
            }))
            .filter((item) => item.key && item.label)
        : [];
      setManagedDepartments(departments);
    } catch {
      setManagedDepartments([]);
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

  const updatePriorityType = async (key: string, showOnFrontpage?: boolean) => {
    const normalized = normalizePriorityKey(key);
    const label = (priorityDrafts[normalized] ?? "").trim();
    if (!normalized || !label) return;
    setPrioritySaving(true);
    setError(null);
    try {
      const payload: { key: string; label: string; showOnFrontpage?: boolean } = {
        key: normalized,
        label,
      };
      if (typeof showOnFrontpage === "boolean") {
        payload.showOnFrontpage = showOnFrontpage;
      }
      const res = await fetch("/api/breezy/priority-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const deletePositionRecord = async () => {
    const posId = (selectedPositionId ?? "").trim();
    if (!posId) return;
    const label =
      selectedPositionLabel ||
      getFirstStringField(details, ["name", "title"]) ||
      posId;
    requestDeletePosition(posId, label);
    setVisibilityMenuOpen(false);
  };

  async function patchPositionHidden(posId: string, hidden: boolean) {
    const target = posId.trim();
    if (!target) return;
    const targetCompanyId = companyId.trim();
    if (!targetCompanyId) return;

    setCardActionSavingId(target);
    setError(null);
    try {
      const url = `/api/breezy/positions-cache/${encodeURIComponent(
        target
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
        prev.map((pos) => (pos.id === target ? { ...pos, hidden, edited: true } : pos))
      );

      if ((selectedPositionId ?? "").trim() === target) {
        setDetailsOverrides((prev) => ({ ...(prev ?? {}), hidden }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update visibility.");
    } finally {
      setCardActionSavingId(null);
      setCardMenuOpenId(null);
    }
  }

  function requestDeletePosition(posId: string, label?: string) {
    const target = posId.trim();
    if (!target) return;
    setDeleteConfirm({ positionId: target, label: (label ?? "").trim() || target });
    setCardMenuOpenId(null);
  }

  async function performDeletePosition(posId: string) {
    const target = posId.trim();
    if (!target) return false;
    const targetCompanyId = companyId.trim();
    if (!targetCompanyId) return false;

    setCardActionSavingId(target);
    setError(null);
    try {
      const url = `/api/breezy/positions-cache/${encodeURIComponent(
        target
      )}?companyId=${encodeURIComponent(targetCompanyId)}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to delete opening."
        );
      }

      setPositions((prev) => prev.filter((pos) => pos.id !== target));
      setPriorityCountsRefreshKey((value) => value + 1);
      if ((selectedPositionId ?? "").trim() === target) {
        closePositionModal();
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete opening.");
      return false;
    } finally {
      setCardActionSavingId(null);
    }
  }

  const saveQuickOverride = useCallback(
    async (overrides: Record<string, unknown>, options: { companies?: string[] } = {}) => {
      const posId = (selectedPositionId ?? "").trim();
      if (!posId) return;
      const targetCompanyId = companyId.trim();
      if (!targetCompanyId) return;

      const sanitizedOverrides = sanitizeOverrides(overrides);
      setSavingEdits(true);
      setError(null);

      const baseSnapshot = {
        name:
          getFirstStringField(details, ["name", "title"]) ||
          selectedPositionLabel ||
          selectedPositionId ||
          "",
        company: details ? extractCompany(details) : "",
        department: details ? extractDepartment(details) : "",
        priority: asString((details as Record<string, unknown> | null)?.priority),
      };

      const applyStringOverride = (
        obj: Record<string, unknown>,
        key: string,
        value: unknown
      ) => {
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (!trimmed) delete obj[key];
        else obj[key] = trimmed;
      };

      // Optimistically update local state to avoid "refresh/flicker" in the modal.
      setDetailsOverrides((prev) => {
        const next = { ...(prev ?? {}) } as Record<string, unknown>;
        for (const [key, value] of Object.entries(sanitizedOverrides)) {
          if (key === "hidden") {
            if (value === true) next.hidden = true;
            else delete next.hidden;
            continue;
          }
          if (typeof value !== "string") continue;
          const trimmed = value.trim();
          if (!trimmed) delete next[key];
          else next[key] = trimmed;
        }
        return next;
      });

      setDetails((prev) => {
        if (!prev || !isRecord(prev)) return prev;
        const next = { ...(prev as Record<string, unknown>) };
        for (const [key, value] of Object.entries(sanitizedOverrides)) {
          if (key === "hidden") {
            if (value === true) next.hidden = true;
            else delete next.hidden;
            continue;
          }
          applyStringOverride(next, key, value);
        }
        return next;
      });

      setPositions((prev) =>
        prev.map((item) => {
          if (item.id !== posId) return item;
          const next: BreezyPosition = { ...item };

          if (Object.prototype.hasOwnProperty.call(sanitizedOverrides, "name")) {
            const value = sanitizedOverrides.name;
            next.name =
              typeof value === "string" && value.trim() ? value.trim() : baseSnapshot.name;
          }
          if (Object.prototype.hasOwnProperty.call(sanitizedOverrides, "company")) {
            const value = sanitizedOverrides.company;
            const companyValue =
              typeof value === "string" && value.trim() ? value.trim() : baseSnapshot.company;
            next.company = companyValue || undefined;
          }
          if (Object.prototype.hasOwnProperty.call(sanitizedOverrides, "department")) {
            const value = sanitizedOverrides.department;
            const deptValue =
              typeof value === "string" && value.trim()
                ? value.trim()
                : baseSnapshot.department;
            next.department = deptValue || undefined;
          }
          if (Object.prototype.hasOwnProperty.call(sanitizedOverrides, "priority")) {
            const value = sanitizedOverrides.priority;
            const priorityValue =
              typeof value === "string" && value.trim() ? value.trim() : "";
            next.priority = priorityValue || undefined;
          }
          if (Object.prototype.hasOwnProperty.call(sanitizedOverrides, "hidden")) {
            next.hidden = sanitizedOverrides.hidden === true;
            if (next.hidden) next.edited = true;
          }
          return next;
        })
      );

      try {
        const url = `/api/breezy/positions-cache/${encodeURIComponent(
          posId
        )}?companyId=${encodeURIComponent(targetCompanyId)}`;
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            overrides: sanitizedOverrides,
            companies:
              options.companies ??
              (typeof sanitizedOverrides.company === "string" && sanitizedOverrides.company.trim()
                ? [sanitizedOverrides.company.trim()]
                : undefined),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (data && typeof data?.error === "string" && data.error) ||
              "Failed to save changes."
          );
        }
        if (
          Object.prototype.hasOwnProperty.call(sanitizedOverrides, "priority") ||
          Object.prototype.hasOwnProperty.call(sanitizedOverrides, "company") ||
          Array.isArray(options.companies)
        ) {
          setPriorityCountsRefreshKey((value) => value + 1);
        }
        // No reload here (unlike full Save) to keep the modal stable.
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save changes.");
        // If the optimistic update diverged (e.g., permission error), reload to recover.
        try {
          await loadPositionDetails(posId);
        } catch {
          // ignore
        }
      } finally {
        setSavingEdits(false);
      }
    },
    [
      companyId,
      details,
      loadPositionDetails,
      selectedPositionId,
      selectedPositionLabel,
      setPositions,
    ]
  );

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
      const overrides = sanitizeOverrides(editForm as unknown as Record<string, unknown>);
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides,
          companies:
            editForm.companies.length > 0
              ? editForm.companies
              : editForm.company.trim()
                ? [editForm.company.trim()]
                : [],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to save edits."
        );
      }
      await loadPositionDetails(posId);
      await loadPositions(targetCompanyId);
      setPriorityCountsRefreshKey((value) => value + 1);
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
      setPriorityCountsRefreshKey((value) => value + 1);
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
    void loadManagedDepartments();
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
    const timer = window.setTimeout(() => {
      setServerFilter(filter.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filter]);

  useEffect(() => {
    const target = companyId.trim();
    if (!target) return;
    setCompanyCountsLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/breezy/positions-cache/company-counts?companyId=${encodeURIComponent(
            target
          )}&recordType=${encodeURIComponent(recordType)}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => null)) as CompanyCountsResponse | null;
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load company counts.");
        }
        const list = Array.isArray(data?.companies) ? data!.companies! : [];
        const parsed = list
          .map((item) => ({
            name: asString(item?.name).trim(),
            count: typeof item?.count === "number" ? item.count : 0,
          }))
          .filter((item) => item.name);
        setCompanyCounts(parsed);
      } catch {
        setCompanyCounts([]);
      } finally {
        setCompanyCountsLoading(false);
      }
    })();
  }, [companyId, recordType]);

  useEffect(() => {
    const target = companyId.trim();
    if (!target) return;
    setPriorityCountsLoading(true);
    (async () => {
      try {
        const jobCompanyQuery = jobCompanyFilter.trim()
          ? `&jobCompany=${encodeURIComponent(jobCompanyFilter.trim())}`
          : "";
        const res = await fetch(
          `/api/breezy/positions-cache/priority-counts?companyId=${encodeURIComponent(
            target
          )}&recordType=${encodeURIComponent(recordType)}${jobCompanyQuery}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => null)) as PriorityCountsResponse | null;
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load opening type counts.");
        }
        const list = Array.isArray(data?.priorities) ? data!.priorities! : [];
        const parsed = list
          .map((item) => ({
            key: normalizePriorityKey(asString(item?.key)),
            count: typeof item?.count === "number" ? item.count : 0,
          }))
          .filter((item) => item.key && item.count > 0);
        setPriorityCounts(parsed);
      } catch {
        setPriorityCounts([]);
      } finally {
        setPriorityCountsLoading(false);
      }
    })();
  }, [companyId, jobCompanyFilter, priorityCountsRefreshKey, recordType]);

  useEffect(() => {
    if (!openingTypeFilter) return;
    const selected = normalizePriorityKey(openingTypeFilter);
    if (!selected) return;
    if (priorityCountsLoading) return;
    const stillAvailable = priorityCounts.some((item) => normalizePriorityKey(item.key) === selected);
    if (!stillAvailable) setOpeningTypeFilter("");
  }, [openingTypeFilter, priorityCounts, priorityCountsLoading]);

  useEffect(() => {
    if (!companyId) return;
    void loadPositions(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCompanyFilter, openingTypeFilter, serverFilter]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setLoadMoreInView(Boolean(entry?.isIntersecting));
        if (!entry?.isIntersecting) return;
        void loadMorePositions();
      },
      { root: null, rootMargin: "800px 0px", threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMorePositions]);

  useEffect(() => {
    if (!loadMoreInView) return;
    if (positionsNextOffset === null) return;
    void loadMorePositions();
  }, [loadMoreInView, loadMorePositions, positionsNextOffset]);

  useEffect(() => {
    const node = collapsedCompaniesRowRef.current;
    if (!node) return;

    const update = () => {
      const width = node.getBoundingClientRect().width;
      const tile = 180;
      const gap = 12;
      const max = 10;
      const computed = Math.max(1, Math.min(max, Math.floor((width + gap) / (tile + gap))));
      setCollapsedCompaniesLimit(computed);
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadCompanyLogos = async () => {
      try {
        const res = await fetch("/api/company/job-companies", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as JobCompanyLogoResponse | null;
        if (!res.ok || !data?.companies || ignore) return;

        const nextList = data.companies
          .map((company) => ({
            id: asString(company?.id).trim(),
            name: asString(company?.name).trim(),
            logoUrl: asString(company?.logoUrl).trim(),
            benefitTags: Array.isArray(company?.benefitTags)
              ? (company.benefitTags.filter((tag): tag is BenefitTag =>
                  typeof tag === "string" &&
                  AVAILABLE_BENEFIT_TAGS.includes(tag as BenefitTag)
                ) as BenefitTag[])
              : [],
          }))
          .filter((item) => item.name);

        const next = nextList.reduce<Record<string, string>>((acc, company) => {
          const name = company.name.trim().toLowerCase();
          const logoUrl = company.logoUrl.trim();
          if (!name || !logoUrl) return acc;
          acc[name] = logoUrl;
          return acc;
        }, {});

        if (!ignore) {
          setCompanyLogoByName(next);
          setJobCompanies(nextList);
        }
      } catch {
        if (!ignore) {
          setCompanyLogoByName({});
          setJobCompanies([]);
        }
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
	      {deleteConfirm && typeof document !== "undefined"
	        ? createPortal(
	            <div
	              className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
	              role="dialog"
	              aria-modal="true"
	              aria-label="Delete opening"
	              onClick={() => {
	                if (cardActionSavingId === deleteConfirm.positionId) return;
	                setDeleteConfirm(null);
	              }}
	            >
	              <div
	                className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
	                onClick={(event) => event.stopPropagation()}
	              >
	                <div className="flex items-start justify-between gap-4">
	                  <div>
	                    <div className="text-base font-semibold text-slate-950">Delete opening?</div>
	                    <div className="mt-2 text-sm text-slate-600">
	                      This will remove{" "}
	                      <span className="font-semibold text-slate-900">
	                        {(deleteConfirm.label || deleteConfirm.positionId).trim()}
	                      </span>{" "}
	                      from the site and admin list.
	                    </div>
	                  </div>
	                  <ModalCloseButton
	                    onClick={() => setDeleteConfirm(null)}
	                    disabled={cardActionSavingId === deleteConfirm.positionId}
	                  />
	                </div>

	                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
	                  <button
	                    type="button"
	                    className="h-11 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
	                    onClick={() => setDeleteConfirm(null)}
	                    disabled={cardActionSavingId === deleteConfirm.positionId}
	                  >
	                    Cancel
	                  </button>
	                  <button
	                    type="button"
	                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
	                    onClick={async () => {
	                      const id = deleteConfirm.positionId;
	                      const ok = await performDeletePosition(id);
	                      if (ok) setDeleteConfirm(null);
	                    }}
	                    disabled={cardActionSavingId === deleteConfirm.positionId}
	                  >
	                    <Trash2 className="h-4 w-4" />
	                    {cardActionSavingId === deleteConfirm.positionId ? "Deleting…" : "Delete"}
	                  </button>
	                </div>
	              </div>
	            </div>,
	            document.body
	          )
	        : null}
        {title || description ? (
          <div>
            {title ? (
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                {title}
              </h1>
            ) : null}
            {description ? (
              <p className={title ? "mt-2 text-sm text-slate-600" : "text-sm text-slate-600"}>
                {description}
              </p>
            ) : null}
          </div>
        ) : null}

		      <div
            className={[
              title || description ? "mt-8" : "mt-0",
              "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm",
            ].join(" ")}
          >
		        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">

		          <div>
		            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
		              Search
	            </div>
		            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4">
		              <Search className="h-4 w-4 text-slate-400" />
		              <input
		                className="h-11 w-full border-none bg-transparent text-sm text-slate-800 outline-none"
		                placeholder="Search openings…"
		                value={filter}
		                onChange={(event) => setFilter(event.target.value)}
		              />
                  <span className="shrink-0 whitespace-nowrap border-l border-slate-200 pl-3 text-sm text-slate-500">
                    <span className="font-semibold text-slate-900">
                      {filteredPositions.length.toLocaleString()}
                    </span>{" "}
                    {recordType === "pool" ? "pools" : "positions"}
                    {typeof positionsTotal === "number" ? (
                      <span className="ml-1 text-slate-400">
                        / {positionsTotal.toLocaleString()}
                      </span>
                    ) : null}
                  </span>
		            </div>
		          </div>

		          <div className="flex items-center justify-end gap-2">
		            <button
		              type="button"
		              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
		              onClick={() => void loadPositions()}
		              disabled={loadingPositions || !companyId.trim()}
		              title="Reload openings"
		            >
		              <RefreshCw
		                className={loadingPositions ? "h-4 w-4 animate-spin" : "h-4 w-4"}
		              />
		            </button>
		            {recordType === "position" ? (
		              <button
		                type="button"
	                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
	                onClick={() => {
	                  setCreateOpeningError(null);
	                  setCreateOpeningDraft({
	                    name: "",
	                    company: "",
	                    department: "",
	                    priority: "",
	                    location_name: "",
	                    benefit_tags: [],
	                    processable_country_codes: DEFAULT_PROCESSABLE_COUNTRY_CODES,
	                    summary: "",
	                    description: "",
	                    responsibilities: "",
	                    requirements: "",
	                    hidden: false,
	                    hero_image_url: "",
	                  });
	                  setCreateCompanyQuery("");
	                  setCreateCompanyPickerOpen(false);
	                  setCreatePriorityQuery("");
	                  setCreatePriorityPickerOpen(false);
	                  setCreateOpeningOpen(true);
	                }}
	                disabled={loadingPositions || !companyId.trim()}
	                title="Create a new opening"
	              >
	                <Plus className="h-4 w-4" />
	                New opening
	              </button>
	            ) : null}
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

	        <div className="mt-5">
	          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Companies
            </div>

            {showAllCompanies ? (
              <div className="mt-3 grid gap-3 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
                {companyFilterOptions.map((item) => {
                  const active =
                    item.name.trim().toLowerCase() === jobCompanyFilter.trim().toLowerCase();
                  const logoUrl =
                    item.logoUrl.trim() || companyLogoByName[item.name.trim().toLowerCase()] || "";
                  const initial = item.name.trim().slice(0, 1).toUpperCase() || "C";

                  return (
                    <button
                      key={item.name}
                      type="button"
                      className={[
                        "flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:bg-slate-50",
                        active
                          ? "border-emerald-400 bg-emerald-200 text-emerald-950 shadow-md ring-2 ring-emerald-600/15"
                          : "border-slate-200 text-slate-700",
                      ].join(" ")}
                      onClick={() =>
                        setJobCompanyFilter((prev) =>
                          prev.trim().toLowerCase() === item.name.trim().toLowerCase()
                            ? ""
                            : item.name
                        )
                      }
                      title={item.name}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-sm font-bold text-slate-700 ring-1 ring-slate-200">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          initial
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{item.name}</span>
                        {active ? (
                          <span className="block truncate text-xs text-emerald-800">
                            Selected (click to clear)
                          </span>
                        ) : companyCountsLoading ? (
                          <span className="block truncate text-xs text-slate-400">Loading…</span>
                        ) : item.count ? (
                          <span className="block truncate text-xs text-slate-500">
                            {item.count} openings
                          </span>
                        ) : (
                          <span className="block truncate text-xs text-slate-500">Filter</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div ref={collapsedCompaniesRowRef} className="mt-3 flex gap-3">
                {collapsedCompanyOptions.slice(0, collapsedCompaniesLimit).map((item) => {
                  const active =
                    item.name.trim().toLowerCase() === jobCompanyFilter.trim().toLowerCase();
                  const logoUrl =
                    item.logoUrl.trim() || companyLogoByName[item.name.trim().toLowerCase()] || "";
                  const initial = item.name.trim().slice(0, 1).toUpperCase() || "C";

                  return (
                    <button
                      key={item.name}
                      type="button"
                      className={[
                        "flex min-w-[180px] items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:bg-slate-50",
                        active
                          ? "border-emerald-400 bg-emerald-200 text-emerald-950 shadow-md ring-2 ring-emerald-600/15"
                          : "border-slate-200 text-slate-700",
                      ].join(" ")}
                      onClick={() =>
                        setJobCompanyFilter((prev) =>
                          prev.trim().toLowerCase() === item.name.trim().toLowerCase()
                            ? ""
                            : item.name
                        )
                      }
                      title={item.name}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-sm font-bold text-slate-700 ring-1 ring-slate-200">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          initial
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{item.name}</span>
                        {active ? (
                          <span className="block truncate text-xs text-emerald-800">
                            Selected (click to clear)
                          </span>
                        ) : companyCountsLoading ? (
                          <span className="block truncate text-xs text-slate-400">Loading…</span>
                        ) : item.count ? (
                          <span className="block truncate text-xs text-slate-500">
                            {item.count} openings
                          </span>
                        ) : (
                          <span className="block truncate text-xs text-slate-500">Filter</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              {jobCompanyFilter.trim() ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-slate-600 hover:underline"
                  onClick={() => setJobCompanyFilter("")}
                >
                  Clear filter
                </button>
              ) : (
                <span />
              )}

              {companyFilterOptions.length > 10 ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-emerald-700 hover:underline"
                  onClick={() => setShowAllCompanies((prev) => !prev)}
                >
                  {showAllCompanies ? "Show less" : "Show all"}
                </button>
              ) : null}
            </div>
          </div>

          {recordType === "position" &&
          (priorityCountsLoading || openingTypeFilterOptions.length > 0) ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Opening type
                </div>
                {openingTypeFilter ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-slate-600 hover:underline"
                    onClick={() => setOpeningTypeFilter("")}
                  >
                    Clear type
                  </button>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {priorityCountsLoading && openingTypeFilterOptions.length === 0 ? (
                  <span className="inline-flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-400 shadow-sm">
                    Loading types…
                  </span>
                ) : (
                  openingTypeFilterOptions.map((item) => {
                    const active = normalizePriorityKey(openingTypeFilter) === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={[
                          "inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold shadow-sm transition",
                          active
                            ? "border-sky-400 bg-sky-100 text-sky-950 ring-2 ring-sky-500/15"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        ].join(" ")}
                        onClick={() =>
                          setOpeningTypeFilter((prev) =>
                            normalizePriorityKey(prev) === item.key ? "" : item.key
                          )
                        }
                      >
                        <span
                          className={[
                            "h-2.5 w-2.5 rounded-full shadow-sm",
                            getPriorityBadgeClass(item.key, availablePriorityTypes) || "bg-slate-300",
                          ].join(" ")}
                          aria-hidden="true"
                        />
                        <span>{item.label}</span>
                        <span className={active ? "text-sky-800" : "text-slate-400"}>
                          {item.count}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-4 py-3">
                      Company
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Position
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingPositions ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="bg-white px-4 py-10 text-center text-sm text-slate-500"
                      >
                        Loading positions…
                      </td>
                    </tr>
                  ) : filteredPositions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="bg-white px-4 py-10 text-center text-sm text-slate-500"
                      >
                        No {recordType === "pool" ? "pools" : "positions"} found.
                      </td>
                    </tr>
                  ) : (
                    positionCards
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!loadingPositions ? (
            <div className="mt-6">
              <div ref={loadMoreSentinelRef} className="h-1 w-full" />
              {loadingMorePositions ? (
                <div className="mt-3 text-center text-sm text-slate-500">
                  Loading more…
                </div>
              ) : null}
              {!loadingMorePositions && positionsNextOffset === null && positionsTotal !== null ? (
                <div className="mt-3 text-center text-xs text-slate-400">
                  End of list
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {selectedPositionId ? (
        <DetailsModalShell
          open
          labelledBy="breezy-position-modal-title"
          onClose={closePositionModal}
          stickyHeroActions
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
	                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#2f7de1] to-[#64c8ff] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-200/70 ring-1 ring-white/20 hover:from-[#256fd2] hover:to-[#55bbff] focus:outline-none focus:ring-2 focus:ring-sky-300/60 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-70"
	                  onClick={startEditing}
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
                      <div className="border-t border-slate-200" />
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        onClick={() => void deletePositionRecord()}
                        disabled={visibilitySaving}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <ModalCloseButton onClick={closePositionModal} disabled={savingEdits} />
            </>
	          }
	          stickyHeader={
	            <div className="border-b border-slate-200/80 bg-white/95 px-6 pb-5 pt-6 backdrop-blur">
	              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
	                <div className="min-w-0">
	                  <div className="mb-3">
                    {(() => {
                      const baseCompany = details ? extractCompany(details) : "";
                      const companies =
                        editing && editForm.companies.length > 0
                          ? editForm.companies
                          : detailsCompanyNames.length > 0
                            ? detailsCompanyNames
                            : baseCompany
                              ? [baseCompany]
                              : [];
                      const primaryCompany = companies[0] ?? "";
                      const companyLabel =
                        companies.length > 1
                          ? `${primaryCompany} + ${companies.length - 1} more`
                          : primaryCompany;
                      const logoSrc = primaryCompany
                        ? companyLogoByName[primaryCompany.toLowerCase()] ?? ""
                        : "";
                      return primaryCompany ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-2">
                            {logoSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={logoSrc}
                                alt={primaryCompany}
                                className="h-8 w-8 flex-none rounded-full bg-white object-cover shadow-sm ring-1 ring-slate-200"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : null}

                            {canEdit && editing ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
                                title="Edit company"
                                onClick={() => {
                                  setInlineEditField("company");
                                  setPickerQuery("");
                                  setDepartmentPickerOpen(false);
                                  setCompanyPickerOpen(true);
                                }}
                                disabled={detailsLoading || savingEdits}
                              >
                                <span className="max-w-[340px] whitespace-nowrap truncate">
                                  {companyLabel}
                                </span>
                                <PencilLine className="h-4 w-4 text-slate-500" />
                              </button>
                            ) : (
                              <span className="max-w-[340px] whitespace-nowrap text-sm font-semibold text-slate-800 truncate">
                                {companyLabel}
                              </span>
                            )}
                          </span>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div className="mt-2">
                    <div className="flex min-w-0 items-start gap-2">
                      {editing && inlineEditField === "title" ? (
                        <input
                          id="breezy-position-modal-title"
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-lg font-extrabold text-slate-900 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 sm:text-2xl"
                          value={editForm.name}
                          disabled={savingEdits}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                          onBlur={() => {
                            const next = editForm.name;
                            void saveQuickOverride({ name: next });
                            setInlineEditField(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setInlineEditField(null);
                              return;
                            }
                            if (event.key === "Enter") {
                              const next = editForm.name;
                              void saveQuickOverride({ name: next });
                              setInlineEditField(null);
                            }
                          }}
                          placeholder={
                            getFirstStringField(details, ["name", "title"]) ||
                            selectedPositionLabel ||
                            selectedPositionId
                          }
                          autoFocus
                        />
                      ) : (
                        <>
                          {canEdit && editing ? (
                            <button
                              type="button"
                              id="breezy-position-modal-title"
                              className="min-w-0 text-left text-xl font-extrabold leading-tight text-slate-900 break-words transition hover:text-slate-950 disabled:opacity-60 sm:text-2xl"
                              title="Edit title"
                              onClick={() => {
                                const currentTitle =
                                  getFirstStringField(details, ["name", "title"]) ||
                                  selectedPositionLabel ||
                                  selectedPositionId;
                                setInlineEditField("title");
                                setEditForm((prev) => ({
                                  ...prev,
                                  name: prev.name.trim() ? prev.name : currentTitle,
                                }));
                              }}
                              disabled={detailsLoading || savingEdits}
                            >
                              {detailsLoading
                                ? "Loading…"
                                : (editing && editForm.name.trim()
                                    ? editForm.name.trim()
                                    : getFirstStringField(details, ["name", "title"]) ||
                                      selectedPositionLabel ||
                                      selectedPositionId)}
                            </button>
                          ) : (
                            <div
                              id="breezy-position-modal-title"
                              className="min-w-0 text-xl font-extrabold leading-tight text-slate-900 break-words sm:text-2xl"
                            >
                              {detailsLoading
                                ? "Loading…"
                                : getFirstStringField(details, ["name", "title"]) ||
                                  selectedPositionLabel ||
                                  selectedPositionId}
                            </div>
                          )}
                          {canEdit && editing ? (
                            <button
                              type="button"
                              className="mt-1 inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                              title="Edit title"
                              onClick={() => {
                                const currentTitle =
                                  getFirstStringField(details, ["name", "title"]) ||
                                  selectedPositionLabel ||
                                  selectedPositionId;
                                setInlineEditField("title");
                                setEditForm((prev) => ({
                                  ...prev,
                                  name: prev.name.trim() ? prev.name : currentTitle,
                                }));
                              }}
                              disabled={detailsLoading || savingEdits}
                            >
                              <PencilLine className="h-4 w-4" />
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                        {recordType === "pool" ? "Pool" : "Position"}
                      </span>
                      {(() => {
                        const baseDepartment = details ? extractDepartment(details) : "";
                        const department =
                          editing && editForm.department.trim()
                            ? editForm.department.trim()
                            : baseDepartment;
                        const location = details ? formatPositionLocation(details) : "";
                        const metaBadges = [
                          department ? { key: "department", label: department } : null,
                          location ? { key: "location", label: location } : null,
                        ].filter(Boolean) as Array<{ key: string; label: string }>;

                        return metaBadges.length > 0 ? (
                          <>
                            {metaBadges.map((badge) => {
                              const content = (
                                <>
                                  {badge.key === "department" ? (
                                    <Layers className="h-3.5 w-3.5 text-amber-600" />
                                  ) : (
                                    <MapPin className="h-3.5 w-3.5 text-cyan-600" />
                                  )}
                                  <span className="min-w-0 max-w-[320px] whitespace-nowrap truncate">
                                    {badge.label}
                                  </span>
                                  {canEdit && editing && badge.key === "department" ? (
                                    <PencilLine className="h-3.5 w-3.5 text-amber-700" />
                                  ) : null}
                                </>
                              );

                              const className = [
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm",
                                badge.key === "department"
                                  ? "border-amber-200 bg-gradient-to-r from-amber-100 to-[#ffc45c]/70 text-amber-950 shadow-amber-200/40"
                                  : "border-cyan-200 bg-gradient-to-r from-cyan-100 to-sky-100 text-cyan-950 shadow-cyan-200/40",
                              ].join(" ");

                              if (canEdit && editing && badge.key === "department") {
                                return (
                                  <button
                                    key={badge.key}
                                    type="button"
                                    className={[
                                      className,
                                      "text-left transition hover:brightness-[0.98] disabled:opacity-60",
                                    ].join(" ")}
                                    title="Edit department"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setInlineEditField("department");
                                      setPickerQuery("");
                                      setCompanyPickerOpen(false);
                                      setDepartmentPickerOpen(true);
                                    }}
                                    disabled={detailsLoading || savingEdits}
                                  >
                                    {content}
                                  </button>
                                );
                              }

                              return (
                                <span key={badge.key} className={className}>
                                  {content}
                                </span>
                              );
                            })}
                          </>
                        ) : null;
                      })()}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {recordType !== "pool" ? (
                        <>
                          {(() => {
                            const overridePriority =
                              typeof (detailsOverrides as Record<string, unknown>)?.priority ===
                              "string"
                                ? asString(
                                    (detailsOverrides as Record<string, unknown>)?.priority
                                  ).trim()
                                : "";
                            const currentPriority =
                              (editing ? editForm.priority.trim() : "") ||
                              overridePriority ||
                              asString((details as Record<string, unknown> | null)?.priority);
                            const priorityKey = normalizePriorityKey(currentPriority);
                            const label = getPriorityLabel(priorityKey, availablePriorityTypes) || "None";
                            return canEdit && editing ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-gradient-to-r from-sky-100 to-[#64c8ff]/70 px-2.5 py-1.5 text-[10px] font-semibold text-sky-950 shadow-sm shadow-sky-200/40 transition hover:brightness-[0.98] disabled:opacity-60"
                                title="Opening type"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpeningTypePickerOpen(true);
                                }}
                                disabled={detailsLoading || savingEdits}
                              >
                                <FolderKanban className="h-3.5 w-3.5 text-sky-600" />
                                <span className="min-w-0 max-w-[240px] whitespace-nowrap truncate">
                                  {label}
                                </span>
                                <PencilLine className="h-3.5 w-3.5 text-sky-700" />
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-gradient-to-r from-sky-100 to-[#64c8ff]/70 px-2.5 py-1.5 text-[10px] font-semibold text-sky-950 shadow-sm shadow-sky-200/40">
                                <FolderKanban className="h-3.5 w-3.5 text-sky-600" />
                                <span className="min-w-0 max-w-[240px] whitespace-nowrap truncate">
                                  {label}
                                </span>
                              </span>
                            );
                          })()}

                          {canEdit && editing ? (
                            <button
                              type="button"
                              className={[
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm transition hover:brightness-[0.98] disabled:opacity-60",
                                isHidden
                                  ? "border-rose-200 bg-rose-50 text-rose-900 shadow-rose-200/40"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-emerald-200/40",
                              ].join(" ")}
                              title="Active status"
                              onClick={(event) => {
                                event.stopPropagation();
                                setStatusPickerOpen(true);
                              }}
                              disabled={detailsLoading || visibilitySaving}
                            >
                              {isHidden ? (
                                <EyeOff className="h-3.5 w-3.5 text-rose-600" />
                              ) : (
                                <Eye className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                              <span className="whitespace-nowrap">
                                {isHidden ? "Not active" : "Active"}
                              </span>
                              <PencilLine
                                className={[
                                  "h-3.5 w-3.5",
                                  isHidden ? "text-rose-700" : "text-emerald-700",
                                ].join(" ")}
                              />
                            </button>
                          ) : (
                            <span
                              className={[
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm",
                                isHidden
                                  ? "border-rose-200 bg-rose-50 text-rose-900 shadow-rose-200/40"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-emerald-200/40",
                              ].join(" ")}
                            >
                              {isHidden ? (
                                <EyeOff className="h-3.5 w-3.5 text-rose-600" />
                              ) : (
                                <Eye className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                              <span className="whitespace-nowrap">
                                {isHidden ? "Not active" : "Active"}
                              </span>
                            </span>
                          )}
                        </>
                      ) : null}
                    </div>
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
                        onClick={() => {
                          setEditing(false);
                          setInlineEditField(null);
                          setStatusPickerOpen(false);
                          setOpeningTypePickerOpen(false);
                          setCompanyPickerOpen(false);
                          setDepartmentPickerOpen(false);
                          setPickerQuery("");
                        }}
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
                  className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
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
                          Edit labels, add new types, and choose which badges appear on the jobs page.
                        </div>
                      </div>
                      <ModalCloseButton onClick={() => setPriorityTypesModalOpen(false)} />
                    </div>

                    <div className="mt-4 grid gap-3">
                      {availablePriorityTypes.map((type) => {
                        const key = normalizePriorityKey(type.key);
                        return (
                          <div
                            key={key}
                            className="grid gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
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
                              className={[
                                "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-xs font-semibold transition disabled:opacity-60",
                                type.showOnFrontpage
                                  ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                              ].join(" ")}
                              onClick={() => void updatePriorityType(key, !type.showOnFrontpage)}
                              disabled={prioritySaving || !(priorityDrafts[key] ?? type.label).trim()}
                            >
                              {type.showOnFrontpage ? (
                                <Eye className="h-3.5 w-3.5" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5" />
                              )}
                              {type.showOnFrontpage ? "Frontpage" : "Hidden"}
                            </button>
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

              {companyPickerOpen || departmentPickerOpen ? (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
                  onClick={() => {
                    setCompanyPickerOpen(false);
                    setDepartmentPickerOpen(false);
                    setPickerQuery("");
                  }}
                >
                  <div
                    className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {companyPickerOpen ? "Companies" : "Departments"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {companyPickerOpen
                            ? "Pick one or more companies for this job."
                            : departmentPickerCompany
                              ? `Pick a department for ${departmentPickerCompany}.`
                              : "Pick an existing department."}
                        </div>
                      </div>
                      <ModalCloseButton
                        onClick={() => {
                          setCompanyPickerOpen(false);
                          setDepartmentPickerOpen(false);
                          setPickerQuery("");
                        }}
                      />
                    </div>

                    <div className="mt-4">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          value={pickerQuery}
                          onChange={(event) => setPickerQuery(event.target.value)}
                          placeholder={`Search ${companyPickerOpen ? "companies" : "departments"}...`}
                        />
                      </div>

                      <div className="mt-4 max-h-[320px] overflow-auto rounded-2xl border border-slate-200">
                        {filteredPickerOptions.length > 0 ? (
                          <div className="divide-y divide-slate-100">
                            {filteredPickerOptions.map((label) => {
                              const selected = editForm.companies.some(
                                (item) => item.trim().toLowerCase() === label.trim().toLowerCase()
                              );
                              const companyLogoUrl = companyPickerOpen
                                ? companyLogoByName[label.trim().toLowerCase()] ?? ""
                                : "";
                              const companyInitial = label.trim().slice(0, 1).toUpperCase() || "?";
                              return (
                                <button
                                  key={label}
                                  type="button"
                                  className={[
                                    "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold transition",
                                    selected && companyPickerOpen
                                      ? "bg-emerald-50 text-emerald-800"
                                      : "text-slate-800 hover:bg-slate-50",
                                  ].join(" ")}
                                  onClick={() => {
                                    if (companyPickerOpen) {
                                      setEditForm((prev) => {
                                        const exists = prev.companies.some(
                                          (item) =>
                                            item.trim().toLowerCase() === label.trim().toLowerCase()
                                        );
                                        const companies = exists
                                          ? prev.companies.filter(
                                              (item) =>
                                                item.trim().toLowerCase() !==
                                                label.trim().toLowerCase()
                                            )
                                          : [...prev.companies, label];
                                        return {
                                          ...prev,
                                          company: companies[0] ?? "",
                                          companies,
                                        };
                                      });
                                      return;
                                    }

                                    setEditForm((prev) => ({ ...prev, department: label }));
                                    void saveQuickOverride({ department: label });
                                    setDepartmentPickerOpen(false);
                                    setPickerQuery("");
                                    setInlineEditField(null);
                                  }}
                                >
                                  <span className="flex min-w-0 items-center gap-3">
                                    {companyPickerOpen ? (
                                      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                                        {companyLogoUrl ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={companyLogoUrl}
                                            alt={label}
                                            className="h-full w-full object-contain p-1"
                                            loading="lazy"
                                          />
                                        ) : (
                                          companyInitial
                                        )}
                                      </span>
                                    ) : null}
                                    <span className="min-w-0 truncate">{label}</span>
                                  </span>
                                  {companyPickerOpen && selected ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700">
                                      <Check className="h-4 w-4" />
                                      Selected
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">Select</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-sm text-slate-500">No matches found.</div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          onClick={() => {
                            if (companyPickerOpen) {
                              setEditForm((prev) => ({ ...prev, company: "", companies: [] }));
                            } else {
                              setEditForm((prev) => ({ ...prev, department: "" }));
                            }
                            if (!companyPickerOpen) {
                              setDepartmentPickerOpen(false);
                              setPickerQuery("");
                            }
                          }}
                        >
                          Clear
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            onClick={() => {
                              setCompanyPickerOpen(false);
                              setDepartmentPickerOpen(false);
                              setPickerQuery("");
                            }}
                          >
                            Cancel
                          </button>
                          {companyPickerOpen ? (
                            <button
                              type="button"
                              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                              onClick={() => {
                                const selectedCompanies = editForm.companies;
                                const primary = selectedCompanies[0] ?? "";
                                const companyKey = primary.trim().toLowerCase();
                                const allowedDepartments = new Set(
                                  positions
                                    .filter(
                                      (pos) =>
                                        !companyKey ||
                                        asString(pos.company).trim().toLowerCase() === companyKey
                                    )
                                    .map((pos) => asString(pos.department).trim().toLowerCase())
                                    .filter(Boolean)
                                );
                                const nextDept = editForm.department.trim();
                                const keepDept =
                                  !nextDept ||
                                  allowedDepartments.size === 0 ||
                                  allowedDepartments.has(nextDept.toLowerCase());

                                setEditForm((prev) => ({
                                  ...prev,
                                  company: primary,
                                  department: keepDept ? prev.department : "",
                                }));
                                setDetailsCompanyNames(selectedCompanies);
                                void saveQuickOverride(
                                  {
                                    company: primary,
                                    department: keepDept ? editForm.department : "",
                                  },
                                  { companies: selectedCompanies }
                                );
                                setCompanyPickerOpen(false);
                                setPickerQuery("");
                                setInlineEditField(null);
                              }}
                            >
                              Apply
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {statusPickerOpen ? (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
                  onClick={() => setStatusPickerOpen(false)}
                >
                  <div
                    className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Opening status</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Active openings are visible on the public jobs page.
                        </div>
                      </div>
                      <ModalCloseButton onClick={() => setStatusPickerOpen(false)} />
                    </div>

                    <div className="mt-4 grid gap-2">
                      <button
                        type="button"
                        className={[
                          "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-60",
                          !isHidden ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200",
                        ].join(" ")}
                        onClick={() => {
                          void setHiddenOverride(false);
                          setStatusPickerOpen(false);
                        }}
                        disabled={visibilitySaving || detailsLoading}
                      >
                        <span className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-emerald-600" />
                          Active
                        </span>
                        {!isHidden ? <span className="text-emerald-700">Selected</span> : null}
                      </button>
                      <button
                        type="button"
                        className={[
                          "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-60",
                          isHidden ? "border-rose-200 bg-rose-50/60" : "border-slate-200",
                        ].join(" ")}
                        onClick={() => {
                          void setHiddenOverride(true);
                          setStatusPickerOpen(false);
                        }}
                        disabled={visibilitySaving || detailsLoading}
                      >
                        <span className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4 text-rose-600" />
                          Not active
                        </span>
                        {isHidden ? <span className="text-rose-700">Selected</span> : null}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

                  {openingTypePickerOpen ? (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
                  onClick={() => setOpeningTypePickerOpen(false)}
                >
                  <div
                    className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Opening type</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Choose a label for this opening, or create a new one.
                        </div>
                      </div>
                      <ModalCloseButton onClick={() => setOpeningTypePickerOpen(false)} />
                    </div>

                    {(() => {
                      const overridePriority =
                        typeof (detailsOverrides as Record<string, unknown>)?.priority === "string"
                          ? asString((detailsOverrides as Record<string, unknown>)?.priority).trim()
                          : "";
                      const currentPriority =
                        editForm.priority.trim() ||
                        overridePriority ||
                        asString((details as Record<string, unknown> | null)?.priority);
                      const activeKey = normalizePriorityKey(currentPriority);

                      const options: Array<{ key: string; label: string }> = [
                        { key: "", label: "None" },
                        ...availablePriorityTypes.map((t) => ({
                          key: normalizePriorityKey(t.key),
                          label: t.label,
                        })),
                      ];

                      return (
                        <>
                          <div className="mt-4 max-h-[320px] overflow-auto rounded-2xl border border-slate-200">
                            <div className="divide-y divide-slate-100">
                              {options.map((opt) => {
                                const selected = normalizePriorityKey(opt.key) === activeKey;
                                return (
                                  <button
                                    key={opt.key || "__none__"}
                                    type="button"
                                    className={[
                                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-60",
                                      selected ? "bg-sky-50" : "bg-white",
                                    ].join(" ")}
                                    onClick={() => {
                                      setEditForm((prev) => ({ ...prev, priority: opt.key }));
                                      setDetailsOverrides((prev) => ({
                                        ...prev,
                                        priority: opt.key,
                                      }));
                                      void saveQuickOverride({ priority: opt.key });
                                      setOpeningTypePickerOpen(false);
                                    }}
                                    disabled={savingEdits || detailsLoading}
                                  >
                                    <span className="min-w-0 truncate">{opt.label}</span>
                                    {selected ? (
                                      <span className="text-sky-700">Selected</span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-sky-400 bg-gradient-to-r from-[#00b4ff] via-[#1594f5] to-[#006fe6] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-300/50 transition hover:from-[#16c8ff] hover:via-[#1aa2ff] hover:to-[#075fe0] disabled:opacity-60"
                              onClick={() => setPriorityTypesModalOpen(true)}
                              disabled={savingEdits || detailsLoading}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add / Remove
                            </button>
                          </div>
                        </>
                      );
                    })()}
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
                    const state = getFirstStringField(details, ["state", "status"]);
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
                              Changes you make here are saved as overrides. Edited keys:{" "}
                              {editedKeys.length > 0 ? editedKeys.join(", ") : "—"}
                            </div>
                          </div>

                          <div className="grid gap-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="grid gap-1">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Priority
                                </div>
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
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                                    onClick={() => setPriorityTypesModalOpen(true)}
                                    disabled={savingEdits || prioritySaving || !canEdit}
                                  >
                                    Manage types
                                  </button>
                                  {priorityTypesWarning ? (
                                    <div className="text-[11px] text-amber-700">
                                      {priorityTypesWarning}
                                    </div>
                                  ) : null}
                                </div>
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
                              <WysiwygEditor
                                value={editForm.description || description || ""}
                                disabled={savingEdits}
                                placeholder="Write the full description…"
                                minHeightClassName="min-h-[220px]"
                                onChange={(next) =>
                                  setEditForm((prev) => ({ ...prev, description: next }))
                                }
                              />
                            </div>

                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Responsibilities
                              </div>
                              <WysiwygEditor
                                value={editForm.responsibilities || responsibilities || ""}
                                disabled={savingEdits}
                                placeholder="List responsibilities…"
                                minHeightClassName="min-h-[180px]"
                                onChange={(next) =>
                                  setEditForm((prev) => ({ ...prev, responsibilities: next }))
                                }
                              />
                            </div>

                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Requirements
                              </div>
                              <WysiwygEditor
                                value={editForm.requirements || requirements || ""}
                                disabled={savingEdits}
                                placeholder="List requirements…"
                                minHeightClassName="min-h-[180px]"
                                onChange={(next) =>
                                  setEditForm((prev) => ({ ...prev, requirements: next }))
                                }
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

      {createOpeningOpen ? (
        <div
          className="fixed inset-0 z-[12000] flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Create job opening"
          onClick={() => {
            if (createOpeningSaving) return;
            setCreateOpeningOpen(false);
          }}
        >
          <div
            className="flex max-h-[calc(100svh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Create job opening</div>
                <div className="mt-1 text-xs text-slate-500">
                  This creates a new position in Breezy for the selected company.
                </div>
              </div>
              <ModalCloseButton
                onClick={() => setCreateOpeningOpen(false)}
                disabled={createOpeningSaving}
              />
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Job title
                </div>
                <input
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
                  value={createOpeningDraft.name}
                  onChange={(event) =>
                    setCreateOpeningDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="e.g. Assistant Joiner"
                  disabled={createOpeningSaving}
                  autoFocus
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Company
                  </div>
                  <div className="relative mt-2">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 shadow-sm outline-none transition hover:bg-slate-50 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
                      onClick={() => setCreateCompanyPickerOpen((open) => !open)}
                      disabled={createOpeningSaving}
                      aria-haspopup="listbox"
                      aria-expanded={createCompanyPickerOpen}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {selectedCreateCompany?.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedCreateCompany.logoUrl}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full border border-slate-200 bg-white object-contain"
                          />
                        ) : (
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                            {createOpeningDraft.company.trim() ? (
                              createOpeningDraft.company.trim().slice(0, 1).toUpperCase()
                            ) : (
                              <Building2 className="h-4 w-4 text-slate-500" />
                            )}
                          </span>
                        )}
                        <span
                          className={
                            createOpeningDraft.company.trim()
                              ? "min-w-0 truncate font-semibold"
                              : "min-w-0 truncate text-slate-400"
                          }
                        >
                          {createOpeningDraft.company.trim() || "Select company..."}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>

                    {createCompanyPickerOpen ? (
                      <div className="absolute left-0 right-0 top-full z-[13000] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-200 p-3">
                          <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                            <Search className="h-4 w-4 shrink-0 text-slate-400" />
                            <input
                              className="h-full min-w-0 flex-1 border-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                              value={createCompanyQuery}
                              onChange={(event) => setCreateCompanyQuery(event.target.value)}
                              placeholder="Search companies..."
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-72 overflow-y-auto p-2" role="listbox">
                          {createCompanyPickerOptions.length > 0 ? (
                            createCompanyPickerOptions.map((item) => {
                              const active =
                                item.name.trim().toLowerCase() ===
                                createOpeningDraft.company.trim().toLowerCase();
                              const initial = item.name.trim().slice(0, 1).toUpperCase() || "?";
                              return (
                                <button
                                  key={item.name}
                                  type="button"
                                  className={[
                                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                                    active
                                      ? "bg-sky-50 text-sky-950"
                                      : "text-slate-800 hover:bg-slate-50",
                                  ].join(" ")}
                                  role="option"
                                  aria-selected={active}
                                  onClick={() => {
                                    setCreateOpeningDraft((prev) => ({
                                      ...prev,
                                      company: item.name,
                                      department: "",
                                      benefit_tags:
                                        item.benefitTags.length > 0
                                          ? item.benefitTags
                                          : prev.benefit_tags,
                                    }));
                                    setCreateCompanyQuery("");
                                    setCreateCompanyPickerOpen(false);
                                  }}
                                >
                                  {item.logoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={item.logoUrl}
                                      alt=""
                                      className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-white object-contain shadow-sm"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                                      {initial}
                                    </span>
                                  )}
                                  <span className="min-w-0 flex-1 truncate font-semibold">
                                    {item.name}
                                  </span>
                                  {typeof item.count === "number" && item.count > 0 ? (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                      {item.count}
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-6 text-center text-sm text-slate-500">
                              No companies found.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Department
                  </div>
                  <div className="relative mt-2">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 shadow-sm outline-none transition hover:bg-slate-50 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
                      onClick={() => {
                        setCreateDepartmentPickerOpen((open) => !open);
                        setCreateCompanyPickerOpen(false);
                        setCreatePriorityPickerOpen(false);
                      }}
                      disabled={createOpeningSaving}
                      aria-haspopup="listbox"
                      aria-expanded={createDepartmentPickerOpen}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-sky-100 bg-sky-50 text-sky-700">
                          <Layers className="h-4 w-4" />
                        </span>
                        <span
                          className={
                            createOpeningDraft.department.trim()
                              ? "min-w-0 truncate font-semibold"
                              : "min-w-0 truncate text-slate-400"
                          }
                        >
                          {createOpeningDraft.department.trim() || "Select department..."}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>

                    {createDepartmentPickerOpen ? (
                      <div className="absolute left-0 right-0 top-full z-[13000] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-200 p-3">
                          <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                            <Search className="h-4 w-4 shrink-0 text-slate-400" />
                            <input
                              className="h-full min-w-0 flex-1 border-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                              value={createDepartmentQuery}
                              onChange={(event) => setCreateDepartmentQuery(event.target.value)}
                              placeholder="Search departments..."
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto p-2" role="listbox">
                          {createDepartmentPickerOptions.length > 0 ? (
                            createDepartmentPickerOptions.map((label) => {
                              const active =
                                label.trim().toLowerCase() ===
                                createOpeningDraft.department.trim().toLowerCase();
                              const isCustom =
                                createDepartmentQuery.trim() &&
                                label.trim().toLowerCase() ===
                                  createDepartmentQuery.trim().toLowerCase() &&
                                !createDepartmentOptions.some(
                                  (item) => item.trim().toLowerCase() === label.trim().toLowerCase()
                                );
                              return (
                                <button
                                  key={label}
                                  type="button"
                                  className={[
                                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                                    active
                                      ? "bg-sky-50 text-sky-950"
                                      : "text-slate-800 hover:bg-slate-50",
                                  ].join(" ")}
                                  role="option"
                                  aria-selected={active}
                                  onClick={() => {
                                    setCreateOpeningDraft((prev) => ({
                                      ...prev,
                                      department: label,
                                    }));
                                    setCreateDepartmentQuery("");
                                    setCreateDepartmentPickerOpen(false);
                                  }}
                                >
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-sky-100 bg-sky-50 text-sky-700">
                                    <Layers className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-semibold">
                                    {isCustom ? `Use “${label}”` : label}
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-6 text-center text-sm text-slate-500">
                              No departments found.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Location
                  </div>
                  <input
                    className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
                    value={createOpeningDraft.location_name}
                    onChange={(event) =>
                      setCreateOpeningDraft((prev) => ({
                        ...prev,
                        location_name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Astoria Grande, worldwide"
                    disabled={createOpeningSaving}
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Opening type
                  </div>
                  <div className="relative mt-2">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 shadow-sm outline-none transition hover:bg-slate-50 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
                      onClick={() => setCreatePriorityPickerOpen((open) => !open)}
                      disabled={createOpeningSaving}
                      aria-haspopup="listbox"
                      aria-expanded={createPriorityPickerOpen}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-sky-100 bg-sky-50 text-sky-700">
                          <FolderKanban className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 truncate font-semibold">
                          {selectedCreatePriorityLabel}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>

                    {createPriorityPickerOpen ? (
                      <div className="absolute left-0 right-0 top-full z-[13000] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-200 p-3">
                          <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                            <Search className="h-4 w-4 shrink-0 text-slate-400" />
                            <input
                              className="h-full min-w-0 flex-1 border-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                              value={createPriorityQuery}
                              onChange={(event) => setCreatePriorityQuery(event.target.value)}
                              placeholder="Search opening types..."
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto p-2" role="listbox">
                          {createPriorityPickerOptions.map((type) => {
                            const key = normalizePriorityKey(type.key);
                            const active = key === normalizePriorityKey(createOpeningDraft.priority);
                            return (
                              <button
                                key={key || "none"}
                                type="button"
                                className={[
                                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                                  active
                                    ? "bg-sky-50 text-sky-950"
                                    : "text-slate-800 hover:bg-slate-50",
                                ].join(" ")}
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setCreateOpeningDraft((prev) => ({ ...prev, priority: key }));
                                  setCreatePriorityQuery("");
                                  setCreatePriorityPickerOpen(false);
                                }}
                              >
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-sky-100 bg-sky-50 text-sky-700">
                                  <FolderKanban className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1 truncate font-semibold">
                                  {type.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Company benefits
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Select the cards that should appear in the job modal.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                    disabled={createOpeningSaving}
                    onClick={() =>
                      setCreateOpeningDraft((prev) => ({
                        ...prev,
                        benefit_tags:
                          selectedCreateCompany?.benefitTags.length
                            ? selectedCreateCompany.benefitTags
                            : AVAILABLE_BENEFIT_TAGS.slice(0, 6),
                      }))
                    }
                  >
                    Use company defaults
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AVAILABLE_BENEFIT_TAGS.map((tag) => {
                    const selected = createOpeningDraft.benefit_tags.includes(tag);
                    const Icon = getBenefitIcon(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={[
                          "flex items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition disabled:opacity-60",
                          selected
                            ? "border-sky-200 bg-white text-sky-950 shadow-sm"
                            : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white",
                        ].join(" ")}
                        disabled={createOpeningSaving}
                        onClick={() =>
                          setCreateOpeningDraft((prev) => ({
                            ...prev,
                            benefit_tags: selected
                              ? prev.benefit_tags.filter((item) => item !== tag)
                              : [...prev.benefit_tags, tag],
                          }))
                        }
                      >
                        <span
                          className={[
                            "grid h-9 w-9 shrink-0 place-items-center rounded-full border",
                            selected
                              ? "border-sky-200 bg-sky-50 text-sky-700"
                              : "border-slate-200 bg-slate-50 text-slate-500",
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 font-semibold">
                          {BENEFIT_TAG_LABELS[tag]}
                        </span>
                        {selected ? <Check className="h-4 w-4 text-sky-600" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nationalities we process
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      These chips appear above the description in the public job modal.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                    disabled={createOpeningSaving}
                    onClick={() =>
                      setCreateOpeningDraft((prev) => ({
                        ...prev,
                        processable_country_codes:
                          prev.processable_country_codes.length ===
                          DEFAULT_PROCESSABLE_COUNTRY_CODES.length
                            ? []
                            : DEFAULT_PROCESSABLE_COUNTRY_CODES,
                      }))
                    }
                  >
                    {createOpeningDraft.processable_country_codes.length ===
                    DEFAULT_PROCESSABLE_COUNTRY_CODES.length
                      ? "Clear all"
                      : "Select all"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_PROCESSABLE_COUNTRIES.map((country) => {
                    const selected = createOpeningDraft.processable_country_codes.includes(
                      country.code
                    );
                    return (
                      <button
                        key={country.code}
                        type="button"
                        className={[
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
                          selected
                            ? "border-sky-200 bg-sky-50 text-sky-950"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                        ].join(" ")}
                        disabled={createOpeningSaving}
                        onClick={() =>
                          setCreateOpeningDraft((prev) => ({
                            ...prev,
                            processable_country_codes: selected
                              ? prev.processable_country_codes.filter(
                                  (item) => item !== country.code
                                )
                              : [...prev.processable_country_codes, country.code],
                          }))
                        }
                      >
                        <span>{toFlagEmoji(country.code)}</span>
                        <span>{country.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Hero image (optional)
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-2xl file:border file:border-slate-200 file:bg-white file:px-4 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-50 disabled:opacity-60 sm:w-auto"
                    disabled={createOpeningSaving || createOpeningUploadingHero}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void uploadCreateHeroImage(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  {createOpeningUploadingHero ? (
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Uploading…
                    </span>
                  ) : createOpeningDraft.hero_image_url ? (
                    <a
                      href={createOpeningDraft.hero_image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-sky-700 underline underline-offset-2"
                    >
                      View uploaded image
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">
                      Uploads to a public bucket and will be shown at the top of the description.
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Summary
                </div>
                <textarea
                  className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
                  value={createOpeningDraft.summary}
                  disabled={createOpeningSaving}
                  onChange={(event) =>
                    setCreateOpeningDraft((prev) => ({ ...prev, summary: event.target.value }))
                  }
                  placeholder="Short summary shown in lists…"
                />
              </div>

              <div className="grid gap-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Description
                </div>
                <WysiwygEditor
                  value={createOpeningDraft.description}
                  disabled={createOpeningSaving}
                  placeholder="Write the full description…"
                  minHeightClassName="min-h-[160px]"
                  onChange={(next) =>
                    setCreateOpeningDraft((prev) => ({ ...prev, description: next }))
                  }
                />
              </div>

              <div className="grid gap-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Responsibilities
                </div>
                <WysiwygEditor
                  value={createOpeningDraft.responsibilities}
                  disabled={createOpeningSaving}
                  placeholder="List responsibilities…"
                  minHeightClassName="min-h-[130px]"
                  onChange={(next) =>
                    setCreateOpeningDraft((prev) => ({ ...prev, responsibilities: next }))
                  }
                />
              </div>

              <div className="grid gap-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Requirements
                </div>
                <WysiwygEditor
                  value={createOpeningDraft.requirements}
                  disabled={createOpeningSaving}
                  placeholder="List requirements…"
                  minHeightClassName="min-h-[130px]"
                  onChange={(next) =>
                    setCreateOpeningDraft((prev) => ({ ...prev, requirements: next }))
                  }
                />
              </div>

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm font-semibold text-slate-900">Active</span>
                <button
                  type="button"
                  className={[
                    "inline-flex h-10 items-center rounded-full border px-4 text-xs font-semibold transition",
                    createOpeningDraft.hidden
                      ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                  ].join(" ")}
                  onClick={() =>
                    setCreateOpeningDraft((prev) => ({ ...prev, hidden: !prev.hidden }))
                  }
                  disabled={createOpeningSaving}
                  title="Visibility on public jobs page"
                >
                  {createOpeningDraft.hidden ? "Not active" : "Active"}
                </button>
              </label>

              {createOpeningError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {createOpeningError}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                onClick={() => setCreateOpeningOpen(false)}
                disabled={createOpeningSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-950 bg-slate-950 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                onClick={() => void createOpening()}
                disabled={createOpeningSaving || !companyId.trim()}
              >
                {createOpeningSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {createOpeningSaving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
	    </div>
	  );
}
