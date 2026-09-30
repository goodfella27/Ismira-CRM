"use client";
import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { FilterTooltip } from "@/components/filter-tooltip";
import { getPriorityTooltip, sortPriorityTypes } from "@/lib/breezy-priority-types";
import { getPriorityBadgeClass, getPriorityTextClass } from "@/lib/opening-type-colors";

import {
  Fragment,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Search,
  ChevronDown,
  Check,
  Copy,
  Share2,
  Building2,
  UserRound,
  MapPin,
  X,
  Loader2,
  Send,
  Plus,
  Flame,
  AlertTriangle,
  ClipboardList,
  RotateCcw,
  House,
  UtensilsCrossed,
  Plane,
  Shield,
  HeartPulse,
  GraduationCap,
  Coins,
  FileText,
  TrendingUp,
  Compass,
  LockKeyhole,
  Quote,
  Star,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { DropdownMenu, Dialog as DisclaimerDialog } from "radix-ui";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";

import { CountryFlag } from "@/components/country-flag";
import DetailsModalShell from "@/components/details-modal-shell";
import { JobPremiumDetailsPanel } from "@/components/job-premium-details-panel";
import { LogoStackSlider, type LogoStackItem } from "@/components/logo-stack-slider";
import {
  extractCompany,
  extractDepartment,
} from "@/lib/breezy-position-fields";
import { buildPublicPositionDescription } from "@/lib/breezy-position-description";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  getPriorityLabel,
  normalizePriorityKey,
  type BreezyPriorityType,
} from "@/lib/breezy-priority-types";
import {
  getJobShipTypeLabel,
  inferJobShipTypeFromText,
  JOB_SHIP_TYPE_LABELS,
  JOB_SHIP_TYPES,
  normalizeJobShipType,
  normalizeJobShipTypes,
  type JobShipType,
} from "@/lib/job-ship-types";
import {
  AVAILABLE_BENEFIT_TAGS,
  withRequiredBenefitTags,
  type BenefitTag,
} from "@/lib/job-benefits";
import {
  normalizeJobPremiumDetails,
  type JobPremiumDetails,
} from "@/lib/job-premium-details";
import {
  getJobCompanyLogosChangedAt,
  subscribeJobCompanyLogosChanged,
} from "@/lib/job-company-logo-events";
import {
  getPublicJobSharePath,
  getPublicJobShareSlug,
  getRequestedPublicJobValue,
  resolvePublicJobId,
} from "@/lib/public-job-links";

type PremiumAccessResponse = {
  available: boolean;
  canView: boolean;
  access: "visitor" | "member_basic" | "member_premium" | "admin";
  details: JobPremiumDetails | null;
};

function HeroCoverImage({ src }: { src: string }) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setAspectRatio(null);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src) {
    return (
      <div className="w-full bg-muted sm:aspect-[16/7]" />
    );
  }

  return (
    <div
      className="w-full overflow-hidden bg-muted"
      style={aspectRatio ? { aspectRatio: String(aspectRatio) } : { aspectRatio: "16 / 7" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        loading="eager"
        decoding="async"
        onLoad={(event) => {
          const width = event.currentTarget.naturalWidth || 0;
          const height = event.currentTarget.naturalHeight || 0;
          if (!width || !height) return;
          const next = width / height;
          if (!Number.isFinite(next) || next <= 0) return;
          setAspectRatio(next);
        }}
      />
    </div>
  );
}
import { getCountryCode, getCountryLabel } from "@/lib/country";
import StickyJobsHeader from "./sticky-jobs-header";

type JobListItem = {
  id: string;
  view_id?: string;
  name: string;
  state?: string;
  friendly_id?: string;
  org_type?: string;
  company?: string;
  department?: string;
  priority?: string;
  company_logo_url?: string;
  company_slug?: string;
  application_url?: string;
  updated_at?: string;
  ship_type?: string;
  ship_types?: string[];
  benefit_tags?: string[];
  processable_countries?: string[];
  blocked_countries?: string[];
  mentioned_countries?: string[];
  details?: Record<string, unknown>;
};

type JobListItemIndexed = JobListItem & {
  __search: string;
  __companyKey: string;
  __departmentKey: string;
  __priorityKey: string;
  __shipTypeKey: JobShipType | "";
  __shipTypeKeys: JobShipType[];
  __updatedAtMs: number;
};

function getOpeningTypeSortRank(key: string) {
  const normalized = normalizePriorityKey(key);
  if (!normalized) return 4;
  if (normalized.includes("urgent")) return 0;
  if (normalized.includes("regular")) return 1;
  if (normalized.includes("coming-soon")) return 3;
  return 2;
}

function compareJobsByOpeningType(a: JobListItemIndexed, b: JobListItemIndexed) {
  const aRank = getOpeningTypeSortRank(a.__priorityKey);
  const bRank = getOpeningTypeSortRank(b.__priorityKey);
  if (aRank !== bRank) return aRank - bRank;
  if (b.__updatedAtMs !== a.__updatedAtMs) return b.__updatedAtMs - a.__updatedAtMs;
  return asString(a.name).localeCompare(asString(b.name), undefined, { sensitivity: "base" });
}

type JobsBoardCache = {
  v: 9;
  savedAt: number;
  etag?: string;
  items: JobListItem[];
  priorityTypes: BreezyPriorityType[];
  benefitLabels?: Record<string, string>;
  countryLabels?: Record<string, string>;
};

type JobTestimonial = {
  id: string;
  quote: string;
  name: string;
  role: string;
  country: string;
  imageUrl: string | null;
  sortOrder: number;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeFilterKey(value: unknown) {
  return asString(value).trim().toLowerCase();
}

const HERO_LOGOS_CACHE_KEY = "jobs:hero_logos:v1";
const HERO_LOGOS_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

const TESTIMONIALS_CACHE_KEY = "jobs:testimonials:v5";
const TESTIMONIALS_CACHE_TTL_MS = 1000 * 60 * 5; // keep short so ordering/edits reflect quickly

function countryLabelFromCode(code: string, labels?: Record<string, string>) {
  const upper = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return upper || "—";
  const custom = labels?.[upper]?.trim();
  return getCountryLabel(upper, custom);
}

function HeroLogoStackSkeleton({ size = 124, className }: { size?: number; className?: string }) {
  const stackOffsetPx = 14;
  const wrapperHeight = size + stackOffsetPx * 2 + 8;
  return (
    <div
      className={["relative isolate select-none", className ?? ""].join(" ")}
      style={{ width: size, height: wrapperHeight }}
      aria-label="Loading logos"
    >
      {[2, 1, 0].map((level) => {
        const isActive = level === 0;
        const opacity = isActive ? 1 : level === 1 ? 0.55 : 0.32;
        const scale = isActive ? 1 : level === 1 ? 0.93 : 0.86;
        const translateY = isActive ? 0 : level === 1 ? -stackOffsetPx : -stackOffsetPx * 2;
        const zIndex = isActive ? 30 : level === 1 ? 20 : 10;
        return (
          <div
            key={level}
            className={[
              "absolute left-0 bottom-0 overflow-hidden rounded-dialog ring-1 ring-black/5",
              "bg-card/40 shadow-overlay",
              "animate-pulse",
            ].join(" ")}
            style={{
              width: size,
              height: size,
              zIndex,
              opacity,
              transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
            }}
            aria-hidden="true"
          >
            <div className="h-full w-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.85),rgba(255,255,255,0.35),rgba(255,255,255,0.15))]" />
          </div>
        );
      })}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function moveFlagRunsToOwnParagraph(doc: Document) {
  const flagRunPattern = /((?:\s*[\u{1F1E6}-\u{1F1FF}]{2}\s*){2,})/u;
  const candidates = Array.from(doc.body.querySelectorAll("p, h1, h2, h3, h4"));

  candidates.forEach((node) => {
    const text = node.textContent ?? "";
    const match = text.match(flagRunPattern);
    if (!match || !match[1]) return;

    const flags = match[1].trim();
    const flagIndex = text.indexOf(flags);
    if (flagIndex <= 0) return;

    const before = text.slice(0, flagIndex).trimEnd();
    if (!before) return;

    node.textContent = before;

    const flagsParagraph = doc.createElement("p");
    flagsParagraph.textContent = flags;
    node.insertAdjacentElement("afterend", flagsParagraph);
  });
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

    moveFlagRunsToOwnParagraph(doc);

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
          "text-[15px] leading-7 text-foreground",
          "[&>*:first-child]:mt-0",
          "[&_p]:mt-3",
          "[&_h1]:mb-2 [&_h1]:mt-6 [&_h1]:text-xl [&_h1]:font-extrabold [&_h1]:uppercase [&_h1]:tracking-wide [&_h1]:text-foreground",
          "xl:[&_h1]:mb-3 xl:[&_h1]:mt-8 xl:[&_h1]:border-l-4 xl:[&_h1]:border-input xl:[&_h1]:pl-4 xl:[&_h1]:text-[1.1rem] xl:[&_h1]:tracking-[0.08em] xl:[&_h1]:text-foreground",
          "[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-foreground",
          "xl:[&_h2]:mb-3 xl:[&_h2]:mt-8 xl:[&_h2]:border-l-4 xl:[&_h2]:border-input xl:[&_h2]:pl-4 xl:[&_h2]:text-[1.05rem] xl:[&_h2]:tracking-[0.08em] xl:[&_h2]:text-foreground",
          "[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-foreground",
          "xl:[&_h3]:mt-6 xl:[&_h3]:border-l-4 xl:[&_h3]:border-input xl:[&_h3]:pl-4 xl:[&_h3]:tracking-[0.06em]",
          "[&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wide [&_h4]:text-muted-foreground",
          "xl:[&_h4]:tracking-[0.08em]",
          "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 xl:[&_ul]:mt-4 xl:[&_ul]:space-y-3 xl:[&_ul]:pl-7",
          "[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 xl:[&_ol]:mt-4 xl:[&_ol]:space-y-3 xl:[&_ol]:pl-7",
          "[&_li]:leading-7 [&_li]:marker:text-foreground",
          "[&_strong]:font-extrabold [&_strong]:text-foreground",
          "[&_a]:font-semibold [&_a]:text-success [&_a:hover]:underline",
          "[&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-panel [&_img]:border [&_img]:border-border [&_img]:shadow-overlay",
          "[&_figure]:my-4",
          "[&_hr]:my-6 [&_hr]:border-border",
          "[&_br]:leading-6",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: safeHtml || "" }}
      />
    );
  }

  return (
    <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
      {safeText || "—"}
    </div>
  );
}

function JobDetailsSkeleton() {
  return (
    <div className="rounded-panel border border-border bg-card p-5">
      <div className="animate-pulse">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="h-3 w-16 rounded bg-accent" />
            <div className="mt-2 h-6 w-72 rounded bg-accent" />
          </div>
          <div>
            <div className="h-3 w-10 rounded bg-accent" />
            <div className="mt-2 h-4 w-40 rounded bg-accent" />
          </div>
          <div className="sm:col-span-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-panel border border-border bg-muted p-4">
                <div className="h-3 w-20 rounded bg-accent" />
                <div className="mt-2 h-4 w-48 rounded bg-accent" />
              </div>
              <div className="rounded-panel border border-border bg-muted p-4">
                <div className="h-3 w-28 rounded bg-accent" />
                <div className="mt-2 h-4 w-44 rounded bg-accent" />
              </div>
            </div>
          </div>
          <div className="sm:col-span-4">
            <div className="rounded-panel border border-border bg-card p-4">
              <div className="h-3 w-24 rounded bg-accent" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full rounded bg-accent" />
                <div className="h-3 w-[92%] rounded bg-accent" />
                <div className="h-3 w-[86%] rounded bg-accent" />
                <div className="h-3 w-[70%] rounded bg-accent" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Fetching details (cached after first load)…
        </div>
      </div>
    </div>
  );
}

function JobsListSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading positions">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="rounded-[22px] border border-border bg-card p-4 shadow-sm xl:rounded-panel xl:p-5"
        >
          <div className="animate-pulse xl:flex xl:items-start xl:gap-4">
            <div className="h-16 w-16 shrink-0 rounded-panel bg-muted ring-1 ring-ring xl:h-20 xl:w-20 xl:rounded-full" />
            <div className="mt-4 min-w-0 flex-1 xl:mt-0">
              <div className="h-4 w-24 rounded-full bg-muted" />
              <div className="mt-3 h-5 w-[78%] rounded bg-accent" />
              <div className="mt-2 h-4 w-[52%] rounded bg-muted" />
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="h-9 rounded-full bg-muted xl:rounded-panel" />
                <div className="h-9 rounded-full bg-muted xl:rounded-panel" />
                <div className="h-9 rounded-full bg-muted xl:rounded-panel" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="h-7 w-28 rounded-full bg-muted" />
                <div className="h-7 w-36 rounded-full bg-muted" />
                <div className="h-7 w-24 rounded-full bg-muted" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type DropdownOption = {
  value: string;
  label: string;
  prefix?: ReactNode;
  suffix?: string;
  searchText?: string;
};

function FilterSectionLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function JobsDisplayLimitFilter({
  value,
  onChange,
}: {
  value: JobsDisplayLimit;
  onChange: (next: JobsDisplayLimit) => void;
}) {
  return (
    <div>
      <FilterSectionLabel icon={ClipboardList} label="Job Openings" />
      <div className="mt-2 grid grid-cols-4 gap-2 rounded-panel border border-border bg-card p-2">
        {JOBS_DISPLAY_LIMIT_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              className={[
                "h-9 rounded-md px-2 text-xs font-semibold transition",
                selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterDropdown({
  label,
  icon,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  placeholder: string;
  options: DropdownOption[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const selected = options.find((opt) => opt.value === value) ?? null;
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const margin = 8;
    const menuHeight = menuRef.current?.offsetHeight ?? 360;
    const spaceBelow = viewportHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const preferredTop = openAbove ? rect.top - margin - menuHeight : rect.bottom + margin;
    const clampedTop = Math.min(preferredTop, viewportHeight - margin - menuHeight);
    setMenuStyle({
      top: Math.max(margin, clampedTop),
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const prefixText = typeof opt.prefix === "string" ? opt.prefix : "";
      const hay = `${opt.searchText ?? ""} ${opt.label} ${opt.value} ${prefixText}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const raf = requestAnimationFrame(() => updateMenuPosition());
    return () => cancelAnimationFrame(raf);
  }, [open, updateMenuPosition]);

  useLayoutEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => updateMenuPosition());
    return () => cancelAnimationFrame(raf);
  }, [filtered.length, open, query, updateMenuPosition]);

	  useEffect(() => {
	    if (!open) return;
	    const prevHtmlOverflow = document.documentElement.style.overflow;
	    const prevBodyOverflow = document.body.style.overflow;
	    document.documentElement.style.overflow = "hidden";
	    document.body.style.overflow = "hidden";

	    const onKeyDown = (event: KeyboardEvent) => {
	      if (event.key === "Escape") close();
	    };
	    const preventBackgroundScroll = (event: WheelEvent | TouchEvent) => {
	      const target = event.target;
	      const menu = menuRef.current;
	      if (menu && target instanceof Node && menu.contains(target)) return;
	      event.preventDefault();
	    };
	    const onPointerDown = (event: PointerEvent) => {
	      const el = rootRef.current;
	      const menu = menuRef.current;
	      if (!el) return;
      if (event.target instanceof Node && el.contains(event.target)) return;
      if (event.target instanceof Node && menu?.contains(event.target)) return;
      close();
    };
    const onScroll = () => {
      updateMenuPosition();
    };
    const onResize = () => {
      updateMenuPosition();
	    };
	    window.addEventListener("keydown", onKeyDown);
	    window.addEventListener("pointerdown", onPointerDown);
	    window.addEventListener("scroll", onScroll, true);
	    window.addEventListener("resize", onResize);
	    window.addEventListener("wheel", preventBackgroundScroll, { passive: false });
	    window.addEventListener("touchmove", preventBackgroundScroll, { passive: false });
	    return () => {
	      window.removeEventListener("keydown", onKeyDown);
	      window.removeEventListener("pointerdown", onPointerDown);
	      window.removeEventListener("scroll", onScroll, true);
	      window.removeEventListener("resize", onResize);
	      window.removeEventListener("wheel", preventBackgroundScroll as EventListener);
	      window.removeEventListener("touchmove", preventBackgroundScroll as EventListener);
	      document.documentElement.style.overflow = prevHtmlOverflow;
	      document.body.style.overflow = prevBodyOverflow;
	    };
	  }, [close, open, updateMenuPosition]);

  return (
    <div ref={rootRef} className="relative">
      <FilterSectionLabel icon={icon} label={label} />
      <button
        ref={buttonRef}
        type="button"
        className="mt-2 inline-flex h-11 w-full items-center justify-between gap-3 rounded-panel border border-border bg-card px-4 text-sm text-foreground shadow-sm hover:bg-muted"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2 truncate text-left">
          {selected ? (
            <>
              {selected.prefix ? (
                <span className="flex-none">{selected.prefix}</span>
              ) : null}
              <span className="min-w-0 truncate">{selected.label}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 flex-none text-muted-foreground" />
      </button>

      {open && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[1000] overflow-hidden rounded-panel border border-border bg-card shadow-xl"
              style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
              role="listbox"
            >
              {options.length > 8 ? (
                <div className="border-b border-border bg-card p-2">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <UiInput
                      className="h-10 w-full"
                      placeholder={`Search ${label.toLowerCase()}…`}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

	              <div className="hide-scrollbar max-h-72 overscroll-contain overflow-auto p-1">
	                {filtered.map((opt) => {
	                  const isSelected = opt.value === value;
	                  return (
	                    <button
                      key={`${label}:${opt.value || "all"}`}
                      type="button"
	                      className={[
	                        "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm",
	                        isSelected
	                          ? "bg-success-muted text-success"
	                          : "text-foreground hover:bg-muted",
	                      ].join(" ")}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(opt.value);
                        close();
                      }}
                    >
	                      <span className="flex min-w-0 items-center gap-2">
	                        {opt.prefix ? <span className="flex-none">{opt.prefix}</span> : null}
	                        <span className="min-w-0 truncate">{opt.label}</span>
	                      </span>
                      {opt.suffix ? (
                        <span className="flex-none text-xs font-semibold text-muted-foreground">
                          {opt.suffix}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">No results.</div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

type MultiSelectOption = {
  value: string;
  label: string;
  prefix?: ReactNode;
  suffix?: string;
  searchText?: string;
};

function MultiSelectTrigger({
  label,
  icon,
  valueLabel,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  valueLabel: string;
  onClick: () => void;
}) {
  return (
    <div>
      <FilterSectionLabel icon={icon} label={label} />
      <button
        type="button"
        className="mt-2 inline-flex h-11 w-full items-center justify-between gap-3 rounded-panel border border-border bg-card px-4 text-sm text-foreground shadow-sm hover:bg-muted"
        onClick={onClick}
        aria-haspopup="dialog"
      >
        <span className="flex min-w-0 items-center gap-2 truncate text-left">
          <span className={valueLabel.toLowerCase().startsWith("all ") ? "text-muted-foreground" : ""}>
            {valueLabel}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 flex-none text-muted-foreground" />
      </button>
    </div>
  );
}

function MultiSelectModal({
  open,
  title,
  description,
  options,
  selected,
  columns = 2,
  onApply,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  options: MultiSelectOption[];
  selected: string[];
  columns?: 1 | 2 | 3;
  onApply: (next: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>(() =>
    Array.from(new Set(selected.map((v) => v.trim()).filter(Boolean)))
  );

  const draftSet = useMemo(() => new Set(draft), [draft]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const hay = `${opt.searchText ?? ""} ${opt.label} ${opt.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  const toggle = useCallback((value: string) => {
    const key = value.trim();
    if (!key) return;
    setDraft((prev) => {
      if (prev.includes(key)) return prev.filter((item) => item !== key);
      return [...prev, key];
    });
  }, []);

  if (!open || typeof document === "undefined") return null;

  const gridClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2";

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-overlay p-2 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[92svh] w-full max-w-4xl overflow-hidden rounded-panel border border-white/10 bg-card shadow-overlay sm:rounded-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {description ?? `${draft.length} selected`}
            </div>
          </div>
          <UiButton variant="primary" size="md"
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center"
            aria-label="Close"
            onClick={onClose}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </UiButton>
        </div>

        <div className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-2 rounded-panel border border-border bg-card px-4 shadow-overlay">
            <Search className="h-4 w-4 text-muted-foreground" />
            <UiInput
              className="h-11 w-full"
              placeholder={`Search ${title.toLowerCase()}…`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query.trim() ? (
              <UiButton variant="ghost" size="md"
                type="button"
                className="grid h-9 w-9 place-items-center"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
              </UiButton>
            ) : null}
          </div>
        </div>

        <div className="hide-scrollbar max-h-[50svh] overflow-auto px-3 py-3 sm:max-h-[60vh] sm:px-5 sm:py-5">
          <div className={`grid ${gridClass} gap-2`}>
            {filteredOptions.map((opt) => {
              const isSelected = draftSet.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={[
                    "flex w-full items-center gap-3 rounded-panel border px-4 py-3 text-left text-sm shadow-sm transition",
                    isSelected
                      ? "border-success/25 bg-success-muted text-success"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "grid h-5 w-5 place-items-center rounded-md border text-[12px] font-bold",
                      isSelected
                        ? "border-success/25 bg-emerald-500 text-white"
                        : "border-input bg-card text-transparent",
                    ].join(" ")}
                  >
                    ✓
                  </span>
                  {opt.prefix ? <span className="flex-none">{opt.prefix}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {opt.suffix ? (
                    <span className="flex-none text-xs font-semibold text-muted-foreground">
                      {opt.suffix}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {filteredOptions.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No results.</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-4">
          <UiButton variant="secondary" size="sm"
            type="button"
            className=""
            onClick={() => setDraft([])}
            disabled={draft.length === 0}
          >
            Clear selection
          </UiButton>
          <div className="flex items-center gap-2">
            <UiButton variant="secondary" size="sm"
              type="button"
              className=""
              onClick={onClose}
            >
              Cancel
            </UiButton>
            <UiButton variant="primary" size="sm"
              type="button"
              className=""
              onClick={() => {
                onApply(draft);
                onClose();
              }}
            >
              Apply
            </UiButton>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function renderCountryFlag(code: string) {
  return <CountryFlag code={code} />;
}

function companyOptionPrefix(label: string, logoUrl: string): ReactNode {
  const name = (label ?? "").trim();
  const initial = name ? name.slice(0, 1).toUpperCase() : "?";
  const logo = (logoUrl ?? "").trim();
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={name || "Company"}
        className="h-7 w-7 rounded-full bg-card object-contain shadow-sm ring-1 ring-ring"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground ring-1 ring-ring">
      {initial}
    </span>
  );
}

type NationalityCountries = {
  processable?: Array<{ code: string; name: string }>;
  blocked?: Array<{ code: string; name: string }>;
  mentioned?: Array<{ code: string; name: string }>;
};

const DEFAULT_BENEFIT_TAG_LABELS: Record<string, string> = {
  meals: "Free Meals",
  accommodation: "Free Accommodation",
  travel_tickets: "Travel Expenses Covered",
  visa_support: "Visa Refunded",
  medical_exam: "Paid Medical",
  certification: "Certification",
  bonus_tips: "Bonus / Tips",
  contract_length: "Stable Contract",
  growth: "Career Growth",
  travel_opportunity: "Travel Opportunity",
};

const BENEFIT_TAG_DISPLAY_ORDER = [
  "travel_tickets",
  "accommodation",
  "travel_opportunity",
  "meals",
  "visa_support",
  "medical_exam",
  "certification",
  "bonus_tips",
  "contract_length",
  "growth",
];

function formatBenefitTag(
  tag: string,
  labels: Record<string, string> = DEFAULT_BENEFIT_TAG_LABELS
) {
  const normalized = asString(tag).trim();
  if (!normalized) return "Unknown";
  return (
    labels[normalized] ??
    DEFAULT_BENEFIT_TAG_LABELS[normalized] ??
    normalized
      .split("_")
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
      .join(" ")
  );
}

function getBenefitTagIcon(tag: string) {
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
    default:
      return FileText;
  }
}

function getVisibleBenefitTags(tags: string[]) {
  const available = new Set<string>(AVAILABLE_BENEFIT_TAGS);
  const normalized = tags
    .map((tag) => asString(tag).trim())
    .filter((tag): tag is BenefitTag => Boolean(tag) && (available.has(tag) || !tag.includes(" ")));
  const visibleTags = withRequiredBenefitTags(normalized);
  return visibleTags.sort((a, b) => {
    const aIndex = BENEFIT_TAG_DISPLAY_ORDER.indexOf(a);
    const bIndex = BENEFIT_TAG_DISPLAY_ORDER.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
}

function BenefitTagDatapoints({
  tags,
  benefitLabels,
}: {
  tags: string[];
  benefitLabels: Record<string, string>;
}) {
  if (tags.length === 0) return null;

  return (
    <div
      className={[
        "mt-4 grid grid-cols-2 gap-2.5",
        "xl:mt-5 xl:w-full xl:max-w-none xl:grid-cols-3 xl:gap-x-12 xl:gap-y-4",
      ].join(" ")}
    >
      {tags.map((tag) => {
        const Icon = getBenefitTagIcon(tag);
        const label = formatBenefitTag(tag, benefitLabels);
        return (
          <span
            key={tag}
            className={[
              "inline-flex min-w-0 items-center gap-2 rounded-panel bg-muted px-2.5 py-2 text-foreground ring-1 ring-ring",
              "xl:rounded-none xl:bg-transparent xl:px-1 xl:py-0.5 xl:ring-0",
            ].join(" ")}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-ring xl:bg-muted xl:ring-0">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 text-[11px] font-semibold leading-tight text-foreground xl:whitespace-normal xl:leading-tight">
              {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function BenefitTagFeatureList({
  tags,
  benefitLabels,
}: {
  tags: string[];
  benefitLabels: Record<string, string>;
}) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 xl:grid xl:gap-3 xl:grid-cols-3">
      {tags.map((tag) => {
        const Icon = getBenefitTagIcon(tag);
        const label = formatBenefitTag(tag, benefitLabels);

        return (
          <div
            key={tag}
            className="inline-flex min-w-0 items-center gap-2 rounded-full border border-border bg-muted px-3 py-2 xl:flex xl:gap-3 xl:rounded-panel xl:bg-card xl:px-4 xl:py-3"
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-ring xl:h-10 xl:w-10 xl:border xl:border-input xl:bg-accent xl:text-foreground xl:ring-0">
              <Icon className="h-3.5 w-3.5 xl:h-4.5 xl:w-4.5" />
            </span>
            <span className="min-w-0 text-xs font-semibold leading-tight text-foreground xl:hidden">
              {label}
            </span>
            <div className="hidden min-w-0 xl:block">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                You Get
              </div>
              <div className="truncate text-sm font-semibold text-foreground">{label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PremiumJobDetailsPanel({
  premium,
  loading,
  onLogin,
}: {
  premium: PremiumAccessResponse | null;
  loading: boolean;
  onLogin: () => void;
}) {
  if (loading) {
    return (
      <div className="h-28 animate-pulse rounded-panel border border-warning/25 bg-warning-muted" />
    );
  }
  if (!premium?.available) return null;

  if (!premium.canView || !premium.details) {
    return (
      <div className="relative isolate overflow-hidden rounded-panel border border-warning/25 bg-muted shadow-overlay">
        <div
          className="pointer-events-none absolute -right-8 -top-20 -z-10 h-44 w-44 rounded-full bg-fuchsia-300/30 blur-3xl"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-muted text-foreground shadow-sm ring-1 ring-white/60">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="text-sm font-bold text-foreground">Salary and insider details</div>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Member access reveals salary, gratuities, contract length, rank and cabin details.
              </p>
            </div>
          </div>
          {premium.access === "visitor" ? (
            <UiButton variant="primary" size="lg"
              type="button"
              onClick={onLogin}
              className="inline-flex h-11 shrink-0 items-center justify-center transition"
            >
              Log in to view
            </UiButton>
          ) : (
            <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-warning/25 bg-card/75 px-4 text-xs font-bold uppercase tracking-wide text-warning shadow-sm backdrop-blur-sm">
              Member access required
            </span>
          )}
        </div>
      </div>
    );
  }

  return <JobPremiumDetailsPanel details={premium.details} />;
}

function CountryChips({
  items,
  countryLabels,
}: {
  items: Array<{ code: string; name: string }>;
  countryLabels: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const code = asString(item.code).toUpperCase().trim();
        const name = getCountryLabel(code, asString(item.name).trim() || countryLabels[code]);
        const flag = renderCountryFlag(code);
        return (
          <span
            key={`${code}:${name}`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground xl:bg-card"
            title={name}
          >
            <span aria-hidden="true">{flag}</span>
            <span className="truncate">{name}</span>
          </span>
        );
      })}
    </div>
  );
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

const JOBS_CACHE_KEY = "jobsboard:list:v9";
const JOBS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_JOBS_DISPLAY_LIMIT = 20;
type JobsDisplayLimit = 20 | 50 | 100 | "all";
const JOBS_DISPLAY_LIMIT_OPTIONS: Array<{ value: JobsDisplayLimit; label: string }> = [
  { value: 20, label: "20" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: "all", label: "All" },
];

function getVisibleCountForLimit(limit: JobsDisplayLimit) {
  return limit === "all" ? Number.MAX_SAFE_INTEGER : limit;
}

function readJobsCache(): JobsBoardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(JOBS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as
      | (Partial<JobsBoardCache> & { v?: number; priorityTypes?: unknown })
      | null;
    if (!parsed || typeof parsed.savedAt !== "number" || !Array.isArray(parsed.items)) return null;
    if (parsed.savedAt < getJobCompanyLogosChangedAt()) return null;
    if (parsed.v === 9) {
      return {
        v: 9,
        savedAt: parsed.savedAt,
        etag: typeof parsed.etag === "string" ? parsed.etag : undefined,
        items: parsed.items as JobListItem[],
        priorityTypes: Array.isArray(parsed.priorityTypes)
          ? (parsed.priorityTypes as BreezyPriorityType[])
          : DEFAULT_BREEZY_PRIORITY_TYPES,
        benefitLabels:
          parsed.benefitLabels && typeof parsed.benefitLabels === "object" && !Array.isArray(parsed.benefitLabels)
            ? (parsed.benefitLabels as Record<string, string>)
            : DEFAULT_BENEFIT_TAG_LABELS,
        countryLabels:
          parsed.countryLabels && typeof parsed.countryLabels === "object" && !Array.isArray(parsed.countryLabels)
            ? (parsed.countryLabels as Record<string, string>)
            : {},
      };
    }
    return null;
  } catch {
    return null;
  }
}

function extractDetailsMap(list: JobListItem[]) {
  const next: Record<string, Record<string, unknown>> = {};
  for (const job of list) {
    const id = asString(job.id).trim();
    if (!id || !isRecord(job.details)) continue;
    next[id] = job.details;
  }
  return next;
}

function writeJobsCache(cache: JobsBoardCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(JOBS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function clearJobsCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(JOBS_CACHE_KEY);
  } catch {
    // ignore
  }
}

function touchJobsCache() {
  const cached = readJobsCache();
  if (!cached) return;
  writeJobsCache({ ...cached, savedAt: Date.now() });
}

function indexJobs(list: JobListItem[]) {
  return list.map((job) => {
    const company = asString(job.company).trim();
    const department = asString(job.department).trim();
    const priority = asString(job.priority).trim();
    const priorityKey = normalizePriorityKey(priority);
    const shipTypesFromPayload = normalizeJobShipTypes(job.ship_types);
    const shipTypes =
      shipTypesFromPayload.length > 0
        ? shipTypesFromPayload
        : normalizeJobShipTypes(job.ship_type || inferJobShipTypeFromText(company, job.name, department));
    const updatedAtRaw = asString(job.updated_at).trim();
    const updatedAtMs = updatedAtRaw ? Date.parse(updatedAtRaw) : Number.NaN;
    const org = (job.org_type || "position").toLowerCase();
    const countries = [
      ...(Array.isArray(job.processable_countries) ? job.processable_countries : []),
      ...(Array.isArray(job.mentioned_countries) ? job.mentioned_countries : []),
      ...(Array.isArray(job.blocked_countries) ? job.blocked_countries : []),
    ]
      .map((c) => asString(c).trim().toUpperCase())
      .filter(Boolean)
      .join(" ");

    const search =
      ` ${job.name} ${company} ${department} ${priority} ${job.state ?? ""} ${job.friendly_id ?? ""} ${job.org_type ?? ""} ${job.id} org:${org} `
        .toLowerCase()
        .trim();
    return {
      ...job,
      company,
      department,
      priority,
      __companyKey: normalizeFilterKey(company),
      __departmentKey: normalizeFilterKey(department),
      __priorityKey: priorityKey,
      __shipTypeKey: shipTypes[0] ?? "",
      __shipTypeKeys: shipTypes,
      __updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
      __search: ` ${search} countries:${countries.toLowerCase()} `,
    } satisfies JobListItemIndexed;
  });
}

function matchesShipTypeSelection(job: JobListItemIndexed, selection: JobShipType[]) {
  return job.__shipTypeKeys.some((key) => selection.includes(key));
}

function shouldInsertInlineTestimonial(index: number) {
  const position = index + 1;
  return position > 0 && position % 5 === 0;
}

function getInlineTestimonialIndex(index: number) {
  return Math.max(0, Math.floor((index + 1) / 5) - 1);
}

function getInlineTestimonials(index: number, testimonials: JobTestimonial[]) {
  if (testimonials.length === 0) return [];

  const position = index + 1;
  const manualTestimonials = testimonials.filter((testimonial) => testimonial.sortOrder === position);
  if (manualTestimonials.length > 0) return manualTestimonials;

  if (!shouldInsertInlineTestimonial(index)) return [];

  const automaticTestimonials = testimonials.filter((testimonial) => testimonial.sortOrder < 0);
  if (automaticTestimonials.length === 0) return [];
  const inlineTestimonials = automaticTestimonials;
  const testimonialIndex = getInlineTestimonialIndex(index);
  return [inlineTestimonials[testimonialIndex % inlineTestimonials.length]].filter(Boolean);
}

function getTopTestimonials(testimonials: JobTestimonial[]) {
  return testimonials.filter((testimonial) => testimonial.sortOrder === 0);
}

function getTestimonialCountryDisplay(country: string) {
  const code = getCountryCode(country);
  if (!code) return { flag: "", label: country.trim() };
  return { flag: renderCountryFlag(code), label: countryLabelFromCode(code) };
}

function JobTestimonialStrip({
  testimonial,
  variant = "inline",
}: {
  testimonial: JobTestimonial;
  variant?: "top" | "inline";
}) {
  const isTop = variant === "top";
  const country = getTestimonialCountryDisplay(testimonial.country);

  return (
    <div
      className={[
        "relative overflow-hidden rounded-panel border border-border bg-muted text-foreground",
        isTop ? "p-5 shadow-sm sm:p-6" : "p-5 shadow-overlay",
      ].join(" ")}
    >
      <div className="absolute right-4 top-4 text-foreground" aria-hidden="true">
        <Quote className={isTop ? "h-16 w-16" : "h-12 w-12"} />
      </div>

      <div className="relative grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-card text-lg font-extrabold text-muted-foreground ring-1 ring-ring sm:h-[72px] sm:w-[72px]">
            {testimonial.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={testimonial.imageUrl}
                alt={testimonial.name}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              (testimonial.name.trim() || "T").slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 sm:hidden">
            <div className="truncate text-sm font-extrabold text-foreground">
              {testimonial.name}
            </div>
            <div className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
              {testimonial.role}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-1 text-warning" aria-label="5 star review">
            {Array.from({ length: 5 }).map((_, starIndex) => (
              <Star key={starIndex} className="h-3.5 w-3.5 fill-current" />
            ))}
          </div>
          <p
            className={[
              "text-pretty font-semibold leading-6 text-foreground",
              isTop ? "text-base sm:text-lg" : "text-sm sm:text-base",
            ].join(" ")}
          >
            {`"${testimonial.quote}"`}
          </p>
          <div className="mt-3 hidden min-w-0 sm:block">
            <div className="truncate text-sm font-extrabold text-foreground">
              {testimonial.name}
            </div>
            <div className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
              {testimonial.role}
            </div>
          </div>
        </div>

        {country.label ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-input bg-card/75 px-3 py-1.5 text-xs font-bold text-foreground shadow-sm">
            {country.flag ? <span aria-hidden="true">{country.flag}</span> : null}
            <span>{country.label}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ApplyDisclaimerModal({
  open,
  loading,
  onApply,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const openerRef = useRef<HTMLElement | null>(null);
  return (
    <DisclaimerDialog.Root open={open} onOpenChange={next => { if (!next && !loading) onClose(); }}>
      <DisclaimerDialog.Portal>
        <DisclaimerDialog.Overlay className="fixed inset-0 z-[10050] bg-overlay" />
        <DisclaimerDialog.Content
          className="fixed left-1/2 top-1/2 z-[10051] max-h-[90svh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-dialog border border-border bg-card text-foreground shadow-overlay"
          onOpenAutoFocus={() => { openerRef.current = document.activeElement as HTMLElement | null; }}
          onCloseAutoFocus={event => { event.preventDefault(); if (openerRef.current?.isConnected) openerRef.current.focus(); }}
          aria-describedby={undefined}
        >
          <DisclaimerDialog.Title className="sr-only">Important notice</DisclaimerDialog.Title>
        <div className="flex items-start justify-between gap-4 border-b border-border bg-muted px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-panel bg-warning-muted text-warning ring-1 ring-warning/25">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">Before you apply</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  A quick note to help us avoid duplicate profiles.
                </div>
              </div>
            </div>
          </div>
          <UiButton variant="primary" size="md"
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center disabled:opacity-60"
            aria-label="Close"
            onClick={onClose}
            disabled={loading}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </UiButton>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-panel border border-border bg-card p-4 shadow-overlay">
            <div className="space-y-3">
              <div className="rounded-panel border border-warning/25 bg-warning-muted px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-panel bg-card text-warning ring-1 ring-warning/25">
                    <ClipboardList className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      Please apply to one position at a time
                    </div>
                    <div className="mt-1 text-sm leading-6 text-foreground">
                      Choose the role that best matches your current experience.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-panel border border-border bg-card px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-panel bg-primary text-primary-foreground shadow-sm">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">Duplicate applications may not be processed</div>
                    <div className="mt-1 text-sm leading-6 text-foreground">
                      If multiple applications are submitted, we may only process the most recent application.
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs leading-5 text-muted-foreground">
                Our recruiters can recommend other suitable roles during screening.
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <UiButton variant="secondary" size="lg"
              type="button"
              className="inline-flex h-11 items-center justify-center disabled:opacity-60 sm:w-auto"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </UiButton>
            <UiButton variant="primary" size="lg"
              type="button"
              className="inline-flex h-11 items-center justify-center gap-2 disabled:opacity-70 sm:w-auto"
              onClick={onApply}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>Continue to Apply</span>
                </>
              )}
            </UiButton>
          </div>
        </div>
        </DisclaimerDialog.Content>
      </DisclaimerDialog.Portal>
    </DisclaimerDialog.Root>
  );
}

export default function JobsBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const etagRef = useRef<string | null>(null);
  const jobsAbortRef = useRef<AbortController | null>(null);
  const detailsAbortRef = useRef<AbortController | null>(null);
  const testimonialsAbortRef = useRef<AbortController | null>(null);
  const prefetchingDetailsRef = useRef<Set<string>>(new Set());
  const scrollLockRef = useRef<{
    scrollY: number;
    body: Partial<CSSStyleDeclaration>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobListItemIndexed[]>([]);
  const jobsRef = useRef<JobListItemIndexed[]>(jobs);
  const [heroLogos, setHeroLogos] = useState<Array<{ id: string; label: string; logoUrl: string }>>(
    []
  );
  const [testimonials, setTestimonials] = useState<JobTestimonial[]>([]);
  const [heroAssetsReady, setHeroAssetsReady] = useState(false);
  const [pageAssetsReady, setPageAssetsReady] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.readyState === "complete";
  });
  const [filter, setFilter] = useState("");
  const [companyFilters, setCompanyFilters] = useState<string[]>([]);
  const [departmentFilters, setDepartmentFilters] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState("");
  const [shipTypeFilters, setShipTypeFilters] = useState<JobShipType[]>([]);
  const [priorityTypes, setPriorityTypes] = useState<BreezyPriorityType[]>(
    DEFAULT_BREEZY_PRIORITY_TYPES
  );
  const [benefitLabels, setBenefitLabels] = useState<Record<string, string>>(
    DEFAULT_BENEFIT_TAG_LABELS
  );
  const [countryLabels, setCountryLabels] = useState<Record<string, string>>({});
  const [openPriorityTooltip, setOpenPriorityTooltip] = useState<string | null>(null);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState<JobsDisplayLimit>(DEFAULT_JOBS_DISPLAY_LIMIT);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_JOBS_DISPLAY_LIMIT);

  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchSuggestOpen, setSearchSuggestOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState<number>(-1);
  const [searchCaretAtEnd, setSearchCaretAtEnd] = useState(true);
  const searchRootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextSuggestOpenRef = useRef(false);

  const deferredFilter = useDeferredValue(filter);

  const parseUrlList = useCallback((key: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const values = params.getAll(key).flatMap((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
    return Array.from(new Set(values));
  }, [searchParams]);

  const parseUrlValue = useCallback((key: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    return (params.get(key) ?? "").trim();
  }, [searchParams]);

  const urlSelectedId = useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const value = getRequestedPublicJobValue(params);
    if (!value) return null;
    return resolvePublicJobId(value, jobs) ?? null;
  }, [jobs, searchParams]);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const value = (searchParams?.get("job") ?? "").trim();
    return value ? value : null;
  });

  useEffect(() => {
    setSelectedId(urlSelectedId);
  }, [urlSelectedId]);

  useEffect(() => {
    const nextFilter = parseUrlValue("q");
    const nextCompanies = parseUrlList("company");
    const nextDepartments = parseUrlList("department");
    const nextShipTypes = parseUrlList("ship").filter(
      (value): value is JobShipType => JOB_SHIP_TYPES.includes(value as JobShipType)
    );
    const nextPriorities = parseUrlList("priority");
    const nextCountry = parseUrlValue("country").toUpperCase();

    setFilter(nextFilter);
    setCompanyFilters(nextCompanies);
    setDepartmentFilters(nextDepartments);
    setShipTypeFilters(nextShipTypes);
    setPriorityFilters(nextPriorities);
    setCountryFilter(nextCountry);
    resetVisibleCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const pendingCompanyNavigationRef = useRef<string | null>(null);
  const urlSyncRef = useRef<string>("");
  useEffect(() => {
    if (pendingCompanyNavigationRef.current !== null) {
      if ((searchParams?.toString() ?? "") !== pendingCompanyNavigationRef.current) return;
      pendingCompanyNavigationRef.current = null;
    }
    const timer = window.setTimeout(() => {
      if (pendingCompanyNavigationRef.current !== null) return;
      const params = new URLSearchParams(searchParams?.toString() ?? "");

      const nextFilter = filter.trim();
      if (nextFilter) params.set("q", nextFilter);
      else params.delete("q");

      const replaceList = (key: string, values: string[]) => {
        params.delete(key);
        values
          .map((value) => value.trim())
          .filter(Boolean)
          .forEach((value) => params.append(key, value));
      };

      replaceList("company", companyFilters);
      replaceList("department", departmentFilters);
      replaceList("ship", shipTypeFilters);
      replaceList("priority", priorityFilters);

      const nextCountry = countryFilter.trim().toUpperCase();
      if (nextCountry) params.set("country", nextCountry);
      else params.delete("country");

      const qs = params.toString();
      if (qs === (searchParams?.toString() ?? "")) return;
      if (qs === urlSyncRef.current) return;
      urlSyncRef.current = qs;
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    router,
    searchParams,
    filter,
    companyFilters,
    departmentFilters,
    countryFilter,
    shipTypeFilters,
    priorityFilters,
  ]);

  const [detailsById, setDetailsById] = useState<Record<string, Record<string, unknown>>>({});
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [premiumById, setPremiumById] = useState<Record<string, PremiumAccessResponse>>({});
  const [premiumLoadingId, setPremiumLoadingId] = useState<string | null>(null);
  const details = selectedId ? detailsById[selectedId] ?? null : null;
  const detailsLoading = selectedId ? detailsLoadingId === selectedId : false;
  const premium = selectedId ? premiumById[selectedId] ?? null : null;
  const premiumLoading = selectedId ? premiumLoadingId === selectedId : false;
  const [shareCopied, setShareCopied] = useState(false);
  const [applyNavigating, setApplyNavigating] = useState(false);
  const [applyDisclaimerOpen, setApplyDisclaimerOpen] = useState(false);

  const resetVisibleCount = useCallback(() => {
    setVisibleCount(getVisibleCountForLimit(displayLimit));
  }, [displayLimit]);

  useEffect(() => {
    resetVisibleCount();
  }, [resetVisibleCount]);

  const anyModalOpen =
    Boolean(selectedId) || companyModalOpen || departmentModalOpen || applyDisclaimerOpen;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof document !== "undefined" && document.readyState === "complete") {
      setPageAssetsReady(true);
      return;
    }

    let cancelled = false;
    const onLoad = () => {
      if (cancelled) return;
      setPageAssetsReady(true);
    };

    window.addEventListener("load", onLoad, { once: true });

    // Safety net: avoid leaving the hero in a skeleton state if the load event never fires.
    const timer = window.setTimeout(() => {
      if (!cancelled) setPageAssetsReady(true);
    }, 2500);

    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const body = document.body;
    if (!body) return;

    if (anyModalOpen) {
      if (scrollLockRef.current) return;

      const scrollY = window.scrollY;
      const scrollbarWidth = Math.max(
        0,
        window.innerWidth - document.documentElement.clientWidth
      );

      scrollLockRef.current = {
        scrollY,
        body: {
          overflow: body.style.overflow,
          position: body.style.position,
          top: body.style.top,
          width: body.style.width,
          paddingRight: body.style.paddingRight,
        },
      };

      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
      if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
      return;
    }

    const locked = scrollLockRef.current;
    if (!locked) return;
    const prev = locked.body;
    scrollLockRef.current = null;

    body.style.overflow = prev.overflow ?? "";
    body.style.position = prev.position ?? "";
    body.style.top = prev.top ?? "";
    body.style.width = prev.width ?? "";
    body.style.paddingRight = prev.paddingRight ?? "";

    window.scrollTo(0, locked.scrollY);
  }, [anyModalOpen]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const readHeroLogosCache = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(HERO_LOGOS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return null;
      const savedAt = Number((parsed as { savedAt?: unknown }).savedAt);
      if (!Number.isFinite(savedAt)) return null;
      if (Date.now() - savedAt > HERO_LOGOS_CACHE_TTL_MS) return null;
      const list = (parsed as { logos?: unknown }).logos;
      if (!Array.isArray(list)) return null;
      const logos = list
        .map((item) => ({
          id: typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : "",
          label:
            typeof (item as { label?: unknown })?.label === "string"
              ? (item as { label: string }).label
              : "",
          logoUrl:
            typeof (item as { logoUrl?: unknown })?.logoUrl === "string"
              ? (item as { logoUrl: string }).logoUrl
              : "",
        }))
        .filter((item) => item.id && item.logoUrl);
      return logos.length > 0 ? logos : null;
    } catch {
      return null;
    }
  }, []);

  const writeHeroLogosCache = useCallback(
    (logos: Array<{ id: string; label: string; logoUrl: string }>) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(
          HERO_LOGOS_CACHE_KEY,
          JSON.stringify({ savedAt: Date.now(), logos })
        );
      } catch {
        // ignore
      }
    },
    []
  );

  const readTestimonialsCache = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(TESTIMONIALS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return null;
      const savedAt = Number((parsed as { savedAt?: unknown }).savedAt);
      if (!Number.isFinite(savedAt)) return null;
      if (Date.now() - savedAt > TESTIMONIALS_CACHE_TTL_MS) return null;
      const list = (parsed as { testimonials?: unknown }).testimonials;
      if (!Array.isArray(list)) return null;
      const testimonials = list
        .map((item) => {
          const row = isRecord(item) ? item : {};
          return {
            id: typeof row.id === "string" ? row.id : "",
            quote: typeof row.quote === "string" ? row.quote.trim() : "",
            name: typeof row.name === "string" ? row.name.trim() : "",
            role: typeof row.role === "string" ? row.role.trim() : "",
            country: typeof row.country === "string" ? row.country.trim() : "",
            sortOrder:
              typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
                ? row.sortOrder
                : 0,
            imageUrl:
              typeof row.imageUrl === "string" && row.imageUrl.trim()
                ? row.imageUrl.trim()
                : null,
          };
        })
        .filter((item) => item.id && item.quote && item.name);
      return testimonials.length > 0 ? testimonials : null;
    } catch {
      return null;
    }
  }, []);

  const writeTestimonialsCache = useCallback((next: JobTestimonial[]) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        TESTIMONIALS_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), testimonials: next })
      );
    } catch {
      // ignore
    }
  }, []);

  const applyCachedJobs = useCallback((cache: JobsBoardCache) => {
    if (Date.now() - cache.savedAt > JOBS_CACHE_MAX_AGE_MS) return;
    etagRef.current = cache.etag ?? null;
    const indexed = indexJobs(cache.items);
    jobsRef.current = indexed;
    setJobs(indexed);
    setDetailsById((prev) => ({ ...prev, ...extractDetailsMap(cache.items) }));
    setPriorityTypes(cache.priorityTypes);
    setBenefitLabels(cache.benefitLabels ?? DEFAULT_BENEFIT_TAG_LABELS);
    setCountryLabels(cache.countryLabels ?? {});
    setLoading(false);
  }, []);

  const baseJobs = useMemo(() => {
    return jobs.filter((job) => job.__search.includes(" org:pool ") === false);
  }, [jobs]);

  const availablePriorityTypes = useMemo(() => sortPriorityTypes(priorityTypes), [priorityTypes]);
  const publicPriorityTypes = useMemo(
    () => availablePriorityTypes.filter((type) =>
      type.showOnFrontpage === true
    ),
    [availablePriorityTypes]
  );
  const publicPriorityTypeKeys = useMemo(
    () => new Set(publicPriorityTypes.map((type) => normalizePriorityKey(type.key))),
    [publicPriorityTypes]
  );
  const priorityBadgeLabelByKey = useMemo(() => {
    return new Map(
      availablePriorityTypes.map((item) => [normalizePriorityKey(item.key), item.label] as const)
    );
  }, [availablePriorityTypes]);

  const priorityLabelByKey = useMemo(() => {
    return new Map(
      publicPriorityTypes.map((item) => [normalizePriorityKey(item.key), item.label] as const)
    );
  }, [publicPriorityTypes]);

  const prioritySelection = useMemo(
    () => priorityFilters.map((value) => normalizePriorityKey(value)).filter(Boolean),
    [priorityFilters]
  );

  const hasPriorityFilter = prioritySelection.length > 0;
  const shipTypeSelection = useMemo(
    () =>
      shipTypeFilters
        .map((value) => normalizeJobShipType(value))
        .filter((value): value is JobShipType => Boolean(value)),
    [shipTypeFilters]
  );
  const hasShipTypeFilter = shipTypeSelection.length > 0;

  const companyOptions = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const departmentSet = new Set(departmentFilters);
    const source =
      departmentSet.size > 0
        ? baseJobs.filter((job) => departmentSet.has(job.__departmentKey))
        : baseJobs;
    const byShipType = hasShipTypeFilter
      ? source.filter((job) => matchesShipTypeSelection(job, shipTypeSelection))
      : source;
    const narrowed = hasPriorityFilter
      ? byShipType.filter((job) => prioritySelection.includes(job.__priorityKey))
      : byShipType;
    const byCountry = countryFilter
      ? narrowed.filter((job) => {
          const target = countryFilter.toUpperCase();
          const blocked = Array.isArray(job.blocked_countries) ? job.blocked_countries : [];
          if (blocked.map((c) => asString(c).toUpperCase()).includes(target)) return false;
          const processable = Array.isArray(job.processable_countries)
            ? job.processable_countries
            : [];
          const mentioned = Array.isArray(job.mentioned_countries) ? job.mentioned_countries : [];
          const combined = [...processable, ...mentioned].map((c) => asString(c).toUpperCase());
          return combined.includes(target);
        })
      : narrowed;
    const byQuery = !query
      ? byCountry
      : byCountry.filter((job) => job.__search.includes(query));
    const map = new Map<string, string>();
    const logos = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const job of byQuery) {
      const key = job.__companyKey;
      const label = asString(job.company).trim();
      if (!key || !label) continue;
      if (!map.has(key)) map.set(key, label);
      if (!logos.has(key)) {
        const logo = asString(job.company_logo_url).trim();
        if (logo) logos.set(key, logo);
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({
        key,
        label,
        count: counts.get(key) ?? 0,
        logo: logos.get(key) ?? "",
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
      );
  }, [
    baseJobs,
    countryFilter,
    deferredFilter,
    departmentFilters,
    hasPriorityFilter,
    hasShipTypeFilter,
    prioritySelection,
    shipTypeSelection,
  ]);

  const departmentOptions = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const companySet = new Set(companyFilters);
    const source =
      companySet.size > 0
        ? baseJobs.filter((job) => companySet.has(job.__companyKey))
        : baseJobs;
    const byShipType = hasShipTypeFilter
      ? source.filter((job) => matchesShipTypeSelection(job, shipTypeSelection))
      : source;
    const narrowed = hasPriorityFilter
      ? byShipType.filter((job) => prioritySelection.includes(job.__priorityKey))
      : byShipType;
    const byCountry = countryFilter
      ? narrowed.filter((job) => {
          const target = countryFilter.toUpperCase();
          const blocked = Array.isArray(job.blocked_countries) ? job.blocked_countries : [];
          if (blocked.map((c) => asString(c).toUpperCase()).includes(target)) return false;
          const processable = Array.isArray(job.processable_countries)
            ? job.processable_countries
            : [];
          const mentioned = Array.isArray(job.mentioned_countries) ? job.mentioned_countries : [];
          const combined = [...processable, ...mentioned].map((c) => asString(c).toUpperCase());
          return combined.includes(target);
        })
      : narrowed;
    const byQuery = !query
      ? byCountry
      : byCountry.filter((job) => job.__search.includes(query));
    const map = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const job of byQuery) {
      const key = job.__departmentKey;
      const label = asString(job.department).trim();
      if (!key || !label) continue;
      if (!map.has(key)) map.set(key, label);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
      );
  }, [
    baseJobs,
    companyFilters,
    countryFilter,
    deferredFilter,
    hasPriorityFilter,
    hasShipTypeFilter,
    prioritySelection,
    shipTypeSelection,
  ]);

  const priorityCounts = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const companySet = new Set(companyFilters);
    const departmentSet = new Set(departmentFilters);
    const source =
      companySet.size > 0
        ? baseJobs.filter((job) => companySet.has(job.__companyKey))
        : baseJobs;
    const byDepartment =
      departmentSet.size > 0
        ? source.filter((job) => departmentSet.has(job.__departmentKey))
        : source;
    const byShipType = hasShipTypeFilter
      ? byDepartment.filter((job) => matchesShipTypeSelection(job, shipTypeSelection))
      : byDepartment;
    const byCountry = countryFilter
      ? byShipType.filter((job) => {
          const target = countryFilter.toUpperCase();
          const blocked = Array.isArray(job.blocked_countries) ? job.blocked_countries : [];
          if (blocked.map((c) => asString(c).toUpperCase()).includes(target)) return false;
          const processable = Array.isArray(job.processable_countries)
            ? job.processable_countries
            : [];
          const mentioned = Array.isArray(job.mentioned_countries) ? job.mentioned_countries : [];
          const combined = [...processable, ...mentioned].map((c) => asString(c).toUpperCase());
          return combined.includes(target);
        })
      : byShipType;
    const narrowed = !query
      ? byCountry
      : byCountry.filter((job) => job.__search.includes(query));

    const counts = new Map<string, number>();
    for (const job of narrowed) {
      const key = job.__priorityKey;
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return counts;
  }, [
    baseJobs,
    companyFilters,
    countryFilter,
    deferredFilter,
    departmentFilters,
    hasShipTypeFilter,
    shipTypeSelection,
  ]);

  const shipTypeCounts = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const companySet = new Set(companyFilters);
    const departmentSet = new Set(departmentFilters);
    const source =
      companySet.size > 0
        ? baseJobs.filter((job) => companySet.has(job.__companyKey))
        : baseJobs;
    const byDepartment =
      departmentSet.size > 0
        ? source.filter((job) => departmentSet.has(job.__departmentKey))
        : source;
    const byCountry = countryFilter
      ? byDepartment.filter((job) => {
          const target = countryFilter.toUpperCase();
          const blocked = Array.isArray(job.blocked_countries) ? job.blocked_countries : [];
          if (blocked.map((c) => asString(c).toUpperCase()).includes(target)) return false;
          const processable = Array.isArray(job.processable_countries)
            ? job.processable_countries
            : [];
          const mentioned = Array.isArray(job.mentioned_countries) ? job.mentioned_countries : [];
          const combined = [...processable, ...mentioned].map((c) => asString(c).toUpperCase());
          return combined.includes(target);
        })
      : byDepartment;
    const byPriority = hasPriorityFilter
      ? byCountry.filter((job) => prioritySelection.includes(job.__priorityKey))
      : byCountry;
    const narrowed = !query
      ? byPriority
      : byPriority.filter((job) => job.__search.includes(query));

    const counts = new Map<JobShipType, number>();
    for (const job of narrowed) {
      for (const key of job.__shipTypeKeys) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return counts;
  }, [
    baseJobs,
    companyFilters,
    countryFilter,
    deferredFilter,
    departmentFilters,
    hasPriorityFilter,
    prioritySelection,
  ]);

  useEffect(() => {
    if (companyFilters.length === 0) return;
    const allowed = new Set(companyOptions.map((option) => option.key));
    const next = companyFilters.filter((value) => allowed.has(value));
    if (next.length === companyFilters.length) return;
    setCompanyFilters(next);
  }, [companyFilters, companyOptions]);

  useEffect(() => {
    if (departmentFilters.length === 0) return;
    const allowed = new Set(departmentOptions.map((option) => option.key));
    const next = departmentFilters.filter((value) => allowed.has(value));
    if (next.length === departmentFilters.length) return;
    setDepartmentFilters(next);
  }, [departmentFilters, departmentOptions]);

  const countryOptions = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const companySet = new Set(companyFilters);
    const departmentSet = new Set(departmentFilters);
    const source =
      companySet.size > 0
        ? baseJobs.filter((job) => companySet.has(job.__companyKey))
        : baseJobs;
    const byDepartment =
      departmentSet.size > 0
        ? source.filter((job) => departmentSet.has(job.__departmentKey))
        : source;
    const narrowed = hasPriorityFilter
      ? byDepartment.filter((job) => prioritySelection.includes(job.__priorityKey))
      : byDepartment;
    const byShipType = hasShipTypeFilter
      ? narrowed.filter((job) => matchesShipTypeSelection(job, shipTypeSelection))
      : narrowed;
    const byQuery = !query
      ? byShipType
      : byShipType.filter((job) => job.__search.includes(query));
    const map = new Map<string, { code: string; label: string; count: number }>();
    for (const job of byQuery) {
      const blocked = Array.isArray(job.blocked_countries) ? job.blocked_countries : [];
      const blockedSet = new Set(
        blocked.map((c) => asString(c).trim().toUpperCase()).filter(Boolean)
      );
      const processable = Array.isArray(job.processable_countries) ? job.processable_countries : [];
      const mentioned = Array.isArray(job.mentioned_countries) ? job.mentioned_countries : [];
      const combined = [...processable, ...mentioned]
        .map((c) => asString(c).trim().toUpperCase())
        .filter(Boolean);
      for (const code of combined) {
        if (blockedSet.has(code)) continue;
        const existing = map.get(code);
        if (existing) existing.count += 1;
        else map.set(code, { code, label: countryLabelFromCode(code, countryLabels), count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [
    baseJobs,
    companyFilters,
    countryLabels,
    deferredFilter,
    departmentFilters,
    hasPriorityFilter,
    hasShipTypeFilter,
    prioritySelection,
    shipTypeSelection,
  ]);

  useEffect(() => {
    if (!countryFilter) return;
    const upper = countryFilter.toUpperCase();
    if (countryOptions.some((opt) => opt.code === upper)) return;
    setCountryFilter("");
  }, [countryFilter, countryOptions]);

  useEffect(() => {
    if (priorityFilters.length === 0) return;
    const next = priorityFilters.filter((value) => (priorityCounts.get(normalizePriorityKey(value)) ?? 0) > 0);
    if (next.length === priorityFilters.length) return;
    setPriorityFilters(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorityCounts, priorityFilters]);

  useEffect(() => {
    if (shipTypeFilters.length === 0) return;
    const next = shipTypeFilters.filter((value) => (shipTypeCounts.get(value) ?? 0) > 0);
    if (next.length === shipTypeFilters.length) return;
    setShipTypeFilters(next);
  }, [shipTypeCounts, shipTypeFilters]);

  const filtered = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const companySet = new Set(companyFilters);
    const departmentSet = new Set(departmentFilters);
    const base = baseJobs;
    const byCompany =
      companySet.size > 0 ? base.filter((job) => companySet.has(job.__companyKey)) : base;
    const byDepartment =
      departmentSet.size > 0
        ? byCompany.filter((job) => departmentSet.has(job.__departmentKey))
        : byCompany;
    const byCountry = countryFilter
      ? byDepartment.filter((job) => {
          const target = countryFilter.toUpperCase();
          const blocked = Array.isArray(job.blocked_countries) ? job.blocked_countries : [];
          if (blocked.map((c) => asString(c).toUpperCase()).includes(target)) return false;
          const processable = Array.isArray(job.processable_countries)
            ? job.processable_countries
            : [];
          const mentioned = Array.isArray(job.mentioned_countries) ? job.mentioned_countries : [];
          const combined = [...processable, ...mentioned].map((c) => asString(c).toUpperCase());
          return combined.includes(target);
        })
      : byDepartment;
    const byShipType = hasShipTypeFilter
      ? byCountry.filter((job) => matchesShipTypeSelection(job, shipTypeSelection))
      : byCountry;
    const byPriority = hasPriorityFilter
      ? byShipType.filter((job) => prioritySelection.includes(job.__priorityKey))
      : byShipType;
    const matches = !query
      ? byPriority
      : byPriority.filter((job) => {
          return job.__search.includes(query);
        });

    return [...matches].sort(compareJobsByOpeningType);
  }, [
    baseJobs,
    companyFilters,
    countryFilter,
    deferredFilter,
    departmentFilters,
    hasPriorityFilter,
    hasShipTypeFilter,
    prioritySelection,
    shipTypeSelection,
  ]);

  const loadJobs = useCallback(async (options: { force?: boolean } = {}) => {
    jobsAbortRef.current?.abort();
    const controller = new AbortController();
    jobsAbortRef.current = controller;

    setError(null);
    const hasData = jobsRef.current.length > 0;
    setLoading(!hasData);
    try {
      const force = options.force === true;
      const url = "/api/jobs";
      const headers: HeadersInit = {};
      if (etagRef.current && !force) {
        headers["If-None-Match"] = etagRef.current;
      }
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
        cache: force ? "no-store" : "default",
      });
      if (res.status === 304) {
        touchJobsCache();
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load jobs."
        );
      }
      const list =
        data && typeof data === "object" && Array.isArray((data as { jobs?: unknown }).jobs)
          ? ((data as { jobs: JobListItem[] }).jobs ?? [])
          : Array.isArray(data)
            ? (data as JobListItem[])
            : [];
      const hasPriorityTypesPayload =
        data &&
        typeof data === "object" &&
        Array.isArray((data as { priorityTypes?: unknown }).priorityTypes);
      const nextPriorityTypes = hasPriorityTypesPayload
        ? ((data as { priorityTypes: BreezyPriorityType[] }).priorityTypes ?? [])
        : DEFAULT_BREEZY_PRIORITY_TYPES;
      const nextBenefitLabels =
        data &&
        typeof data === "object" &&
        (data as { benefitLabels?: unknown }).benefitLabels &&
        typeof (data as { benefitLabels?: unknown }).benefitLabels === "object" &&
        !Array.isArray((data as { benefitLabels?: unknown }).benefitLabels)
          ? ((data as { benefitLabels: Record<string, string> }).benefitLabels ?? {})
          : DEFAULT_BENEFIT_TAG_LABELS;
      const nextCountryLabels =
        data &&
        typeof data === "object" &&
        (data as { countryLabels?: unknown }).countryLabels &&
        typeof (data as { countryLabels?: unknown }).countryLabels === "object" &&
        !Array.isArray((data as { countryLabels?: unknown }).countryLabels)
          ? ((data as { countryLabels: Record<string, string> }).countryLabels ?? {})
          : {};
      const indexed = indexJobs(list);
      setJobs(indexed);
      setDetailsById((prev) => ({ ...prev, ...extractDetailsMap(list) }));
      setPriorityTypes(nextPriorityTypes);
      setBenefitLabels(nextBenefitLabels);
      setCountryLabels(nextCountryLabels);

      const etag = res.headers.get("etag") ?? "";
      etagRef.current = etag.trim() ? etag.trim() : null;
      // Persist the raw list (smaller) and let the UI rebuild indices quickly on refresh.
      setTimeout(() => {
        writeJobsCache({
          v: 9,
          savedAt: Date.now(),
          etag: etagRef.current ?? undefined,
          items: list,
          priorityTypes: nextPriorityTypes,
          benefitLabels: nextBenefitLabels,
          countryLabels: nextCountryLabels,
        });
      }, 0);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        if (jobsRef.current.length === 0) setJobs([]);
        setError(err instanceof Error ? err.message : "Failed to load jobs.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (id: string, signal?: AbortSignal) => {
    const positionId = id.trim();
    if (!positionId) return;
    setDetailsLoadingId(positionId);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(positionId)}`, {
        cache: "no-store",
        signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load job details."
        );
      }
      const payload = isRecord(data) ? data : { data };
      setDetailsById((prev) => ({ ...prev, [positionId]: payload }));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Failed to load job.");
      }
    } finally {
      setDetailsLoadingId((current) => (current === positionId ? null : current));
    }
  }, []);

  useEffect(() => {
    return subscribeJobCompanyLogosChanged(() => {
      clearJobsCache();
      etagRef.current = null;
      setDetailsById({});
      void loadJobs({ force: true });
      if (selectedId) void loadDetails(selectedId);
    });
  }, [loadDetails, loadJobs, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      await loadJobs({ force: true });
      if (selectedId && !controller.signal.aborted) {
        await loadDetails(selectedId, controller.signal);
      }
    };
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      controller.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loadDetails, loadJobs, selectedId]);

  const replaceSelectedIdInUrl = useCallback(
    (nextId: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("job");
      params.delete("jd");
      if (nextId) {
        const job = jobsRef.current.find((item) => item.id === nextId);
        if (job) params.set("jd", getPublicJobShareSlug(job));
        else params.set("job", nextId);
      }
      const qs = params.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router, searchParams]
  );

  const pushSelectedIdInUrl = useCallback(
    (nextId: string) => {
      const trimmed = nextId.trim();
      if (!trimmed) return;
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("job");
      params.delete("jd");
      const job = jobsRef.current.find((item) => item.id === trimmed);
      if (job) params.set("jd", getPublicJobShareSlug(job));
      else params.set("job", trimmed);
      const qs = params.toString();
      router.push(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router, searchParams]
  );

  const closeDetails = useCallback(() => {
    detailsAbortRef.current?.abort();
    setDetailsLoadingId(null);
    setShareCopied(false);
    setSelectedId(null);
    replaceSelectedIdInUrl(null);
  }, [replaceSelectedIdInUrl]);

  useEffect(() => {
    const cached = readJobsCache();
    if (cached) applyCachedJobs(cached);
    void loadJobs({ force: !cached && getJobCompanyLogosChangedAt() > 0 });
  }, [applyCachedJobs, loadJobs]);

  useEffect(() => {
    const cached = readHeroLogosCache();
    if (cached) setHeroLogos(cached);
  }, [readHeroLogosCache]);

		  useEffect(() => {
		    let ignore = false;
		    const load = async () => {
		      try {
	        const res = await fetch("/api/jobs/hero-logos", { cache: "no-store" });
	        const data = await res.json().catch(() => null);
	        if (!res.ok) return;
	        const list: unknown[] = Array.isArray(data?.logos) ? (data.logos as unknown[]) : [];
	        const parsed = list
	          .map((item) => {
	            const row = isRecord(item) ? item : {};
	            return {
	              id: typeof row.id === "string" ? row.id : "",
	              label: typeof row.label === "string" ? row.label : "",
	              logoUrl: typeof row.logoUrl === "string" ? row.logoUrl : "",
	            };
	          })
	          .filter((item) => item.id && item.logoUrl);
	        if (!ignore) {
	          setHeroLogos(parsed);
	          if (parsed.length > 0) writeHeroLogosCache(parsed);
	        }
	      } catch {
	        // ignore
      }
    };
    void load();
	    return () => {
	      ignore = true;
	    };
		  }, [writeHeroLogosCache]);

  useEffect(() => {
    let ignore = false;
    const cached = readTestimonialsCache();
    if (cached) setTestimonials(cached);

    const load = async () => {
      testimonialsAbortRef.current?.abort();
      const controller = new AbortController();
      testimonialsAbortRef.current = controller;
      try {
        // Avoid stale ordering/content after admin edits.
        const res = await fetch("/api/jobs/testimonials", {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return;
        const list: unknown[] = Array.isArray(data?.testimonials)
          ? (data.testimonials as unknown[])
          : [];
        const parsed = list
          .map((item) => {
            const row = isRecord(item) ? item : {};
            return {
              id: typeof row.id === "string" ? row.id : "",
              quote: typeof row.quote === "string" ? row.quote.trim() : "",
              name: typeof row.name === "string" ? row.name.trim() : "",
              role: typeof row.role === "string" ? row.role.trim() : "",
              country: typeof row.country === "string" ? row.country.trim() : "",
              sortOrder:
                typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
                  ? row.sortOrder
                  : 0,
              imageUrl:
                typeof row.imageUrl === "string" && row.imageUrl.trim()
                  ? row.imageUrl.trim()
                  : null,
            };
          })
          .filter((item) => item.id && item.quote && item.name);
        if (!ignore) {
          setTestimonials(parsed);
          if (parsed.length > 0) writeTestimonialsCache(parsed);
        }
      } catch {
        if (!ignore) setTestimonials([]);
      }
    };
    void load();
    return () => {
      ignore = true;
      testimonialsAbortRef.current?.abort();
    };
  }, [readTestimonialsCache, writeTestimonialsCache]);

  const heroSliderItems = useMemo<LogoStackItem[] | null>(() => {
    if (heroLogos.length === 0) return null;
    return heroLogos.map((logo, index) => ({
      id: logo.id,
      label: (logo.label || `Logo ${index + 1}`).trim(),
      src: logo.logoUrl,
    }));
  }, [heroLogos]);

  useEffect(() => {
    if (!heroSliderItems || heroSliderItems.length === 0) {
      setHeroAssetsReady(false);
      return;
    }

    let cancelled = false;
    setHeroAssetsReady(false);

    const sources = heroSliderItems
      .map((item) => item.src)
      .filter((src): src is string => typeof src === "string" && src.length > 0);
    if (sources.length === 0) return;

    const preload = (src: string) =>
      new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = src;
      });

    const timer = window.setTimeout(() => {
      if (!cancelled) setHeroAssetsReady(true);
    }, 3500);

    void Promise.all(sources.map(preload)).then(() => {
      window.clearTimeout(timer);
      if (!cancelled) setHeroAssetsReady(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [heroSliderItems]);

  useEffect(() => {
    resetVisibleCount();
  }, [
    companyFilters,
    departmentFilters,
    countryFilter,
    deferredFilter,
    priorityFilters,
    resetVisibleCount,
    shipTypeFilters,
  ]);

  const visibleJobs = useMemo(() => {
    return filtered.slice(0, Math.min(filtered.length, visibleCount));
  }, [filtered, visibleCount]);


  useEffect(() => {
    if (!selectedId) {
      detailsAbortRef.current?.abort();
      setDetailsLoadingId(null);
      return;
    }
    detailsAbortRef.current?.abort();
    const controller = new AbortController();
    detailsAbortRef.current = controller;
    void loadDetails(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadDetails, selectedId]);

  useEffect(() => {
    const positionId = selectedId?.trim() ?? "";
    if (!positionId) {
      setPremiumLoadingId(null);
      return;
    }

    const controller = new AbortController();
    setPremiumLoadingId(positionId);
    void fetch(`/api/jobs/${encodeURIComponent(positionId)}/premium`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !isRecord(data)) return;
        const next: PremiumAccessResponse = {
          available: data.available === true,
          canView: data.canView === true,
          access:
            data.access === "admin" ||
            data.access === "member_premium" ||
            data.access === "member_basic"
              ? data.access
              : "visitor",
          details: data.canView === true ? normalizeJobPremiumDetails(data.details) : null,
        };
        setPremiumById((prev) => ({ ...prev, [positionId]: next }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) {
          setPremiumLoadingId((current) => (current === positionId ? null : current));
        }
      });

    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    const ids = visibleJobs
      .slice(Math.max(0, visibleJobs.length - 12))
      .map((job) => job.id)
      .filter(Boolean)
      .filter((id) => !detailsById[id] && !prefetchingDetailsRef.current.has(id));
    if (ids.length === 0) return;

    let cancelled = false;

    const prefetchOne = async (id: string) => {
      prefetchingDetailsRef.current.add(id);
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const payload = isRecord(data) ? data : { data };
        if (cancelled) return;
        setDetailsById((prev) => (prev[id] ? prev : { ...prev, [id]: payload }));
      } catch {
        // ignore
      } finally {
        prefetchingDetailsRef.current.delete(id);
      }
    };

    const queue = [...ids];
    const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (!cancelled && queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        // eslint-disable-next-line no-await-in-loop
        await prefetchOne(next);
      }
    });

    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
  }, [detailsById, visibleJobs]);

  const benefitTagsById = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const job of visibleJobs) {
      const id = job.id;
      if (!id) continue;
      const raw = job.benefit_tags;
      const tags = Array.isArray(raw) ? raw.map((item) => asString(item).trim()).filter(Boolean) : [];
      map.set(id, getVisibleBenefitTags(tags));
    }
    return map;
  }, [visibleJobs]);

  const companyLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    companyOptions.forEach((opt) => map.set(opt.key, opt.label));
    return map;
  }, [companyOptions]);

  const departmentLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    departmentOptions.forEach((opt) => map.set(opt.key, opt.label));
    return map;
  }, [departmentOptions]);

  const companyValueLabel = useMemo(() => {
    if (companyFilters.length === 0) return "All companies";
    if (companyFilters.length === 1) {
      const key = companyFilters[0] ?? "";
      return companyLabelByKey.get(key) ?? "1 company selected";
    }
    return `${companyFilters.length} companies selected`;
  }, [companyFilters, companyLabelByKey]);

  const departmentValueLabel = useMemo(() => {
    if (departmentFilters.length === 0) return "All departments";
    if (departmentFilters.length === 1) {
      const key = departmentFilters[0] ?? "";
      return departmentLabelByKey.get(key) ?? "1 department selected";
    }
    return `${departmentFilters.length} departments selected`;
  }, [departmentFilters, departmentLabelByKey]);

  const countryFilterLabel = useMemo(() => {
    if (!countryFilter) return "";
    const upper = countryFilter.toUpperCase();
    return countryOptions.find((opt) => opt.code === upper)?.label ?? upper;
  }, [countryFilter, countryOptions]);

  const searchSuggestionPool = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const companySet = new Set(companyFilters);
    const departmentSet = new Set(departmentFilters);
    const showFeaturedOnly =
      !hasPriorityFilter &&
      !hasShipTypeFilter &&
      companySet.size === 0 &&
      departmentSet.size === 0 &&
      !countryFilter &&
      !query;

    const base = showFeaturedOnly
      ? baseJobs.filter((job) => publicPriorityTypeKeys.has(job.__priorityKey))
      : baseJobs;
    const byCompany =
      companySet.size > 0 ? base.filter((job) => companySet.has(job.__companyKey)) : base;
    const byDepartment =
      departmentSet.size > 0
        ? byCompany.filter((job) => departmentSet.has(job.__departmentKey))
        : byCompany;
    const byCountry = countryFilter
      ? byDepartment.filter((job) => {
          const target = countryFilter.toUpperCase();
          const blocked = Array.isArray(job.blocked_countries) ? job.blocked_countries : [];
          if (blocked.map((c) => asString(c).toUpperCase()).includes(target)) return false;
          const processable = Array.isArray(job.processable_countries)
            ? job.processable_countries
            : [];
          const mentioned = Array.isArray(job.mentioned_countries) ? job.mentioned_countries : [];
          const combined = [...processable, ...mentioned].map((c) => asString(c).toUpperCase());
          return combined.includes(target);
        })
      : byDepartment;
    const byPriority = hasPriorityFilter
      ? byCountry.filter((job) => prioritySelection.includes(job.__priorityKey))
      : byCountry;
    const byShipType = hasShipTypeFilter
      ? byPriority.filter((job) => matchesShipTypeSelection(job, shipTypeSelection))
      : byPriority;
    return byShipType;
  }, [
    baseJobs,
    companyFilters,
    countryFilter,
    deferredFilter,
    departmentFilters,
    hasPriorityFilter,
    hasShipTypeFilter,
    publicPriorityTypeKeys,
    prioritySelection,
    shipTypeSelection,
  ]);

  type SearchSuggestion = {
    id: string;
    kind: "title" | "department" | "country" | "company" | "priority";
    label: string;
    prefix?: ReactNode;
    suffix?: string;
    onSelect: () => void;
  };

  const searchSuggestions = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const suggestions: SearchSuggestion[] = [];

    const add = (item: SearchSuggestion) => {
      if (!item.label.trim()) return;
      suggestions.push(item);
    };

    const addPriority = () => {
      publicPriorityTypes.forEach((type, index) => {
        const key = normalizePriorityKey(type.key);
        const count = priorityCounts.get(key) ?? 0;
        if (count <= 0) return;
        add({
          id: `priority:${key}`,
          kind: "priority",
          label: type.label,
          prefix:
            index % 2 === 0 ? (
              <Flame className="h-4 w-4 text-warning" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-foreground" />
            ),
          suffix: String(count),
          onSelect: () => {
            setPriorityFilters((prev) => (prev.includes(key) ? prev : [...prev, key]));
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
            resetVisibleCount();
          },
        });
      });
    };

    const match = (text: string) => text.toLowerCase().includes(q);

    if (!q) {
      addPriority();

      const topDepartments = [...departmentOptions]
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
        .slice(0, 6);
      topDepartments.forEach((opt) => {
        add({
          id: `department:${opt.key}`,
          kind: "department",
          label: opt.label,
          prefix: <UserRound className="h-4 w-4 text-warning" />,
          suffix: opt.count ? String(opt.count) : "",
          onSelect: () => {
            setDepartmentFilters((prev) => (prev.includes(opt.key) ? prev : [...prev, opt.key]));
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
            resetVisibleCount();
          },
        });
      });

      const topCountries = [...countryOptions]
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
        .slice(0, 6);
      topCountries.forEach((opt) => {
        add({
          id: `country:${opt.code}`,
          kind: "country",
          label: opt.label,
          prefix: (
            <span className="flex items-center gap-1">
              <span className="text-base leading-none">{renderCountryFlag(opt.code)}</span>
              <MapPin className="h-4 w-4 text-success" />
            </span>
          ),
          suffix: opt.count ? String(opt.count) : "",
          onSelect: () => {
            setCountryFilter(opt.code);
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
            resetVisibleCount();
          },
        });
      });

	      const titleSeen = new Set<string>();
	      for (const job of [...searchSuggestionPool].sort((a, b) => b.__updatedAtMs - a.__updatedAtMs)) {
	        const title = asString(job.name).trim();
	        if (!title) continue;
        const key = title.toLowerCase();
        if (titleSeen.has(key)) continue;
        titleSeen.add(key);
        add({
          id: `title:${key}`,
          kind: "title",
          label: title,
          prefix: (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Title
            </span>
          ),
	          onSelect: () => {
	            setFilter(title);
	            setSearchSuggestOpen(false);
	            setSearchActiveIndex(-1);
	            resetVisibleCount();
	            requestAnimationFrame(() => {
	              suppressNextSuggestOpenRef.current = true;
	              searchInputRef.current?.focus();
	            });
	          },
	        });
	        if (titleSeen.size >= 5) break;
	      }
	    } else {
      const titleSeen = new Set<string>();
      for (const job of [...searchSuggestionPool].sort((a, b) => b.__updatedAtMs - a.__updatedAtMs)) {
        const title = asString(job.name).trim();
        if (!title) continue;
        const key = title.toLowerCase();
        if (titleSeen.has(key)) continue;
        if (!match(title) && !match(job.__search)) continue;
        titleSeen.add(key);
        add({
          id: `title:${key}`,
          kind: "title",
          label: title,
          prefix: (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Title
            </span>
          ),
          onSelect: () => {
            setFilter(title);
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
            resetVisibleCount();
            setTimeout(() => searchInputRef.current?.focus(), 0);
          },
        });
        if (titleSeen.size >= 6) break;
      }

      departmentOptions
        .filter((opt) => match(opt.label) || match(opt.key))
        .slice(0, 6)
        .forEach((opt) => {
          add({
            id: `department:${opt.key}`,
            kind: "department",
            label: opt.label,
            prefix: <UserRound className="h-4 w-4 text-warning" />,
            suffix: opt.count ? String(opt.count) : "",
            onSelect: () => {
              setDepartmentFilters((prev) => (prev.includes(opt.key) ? prev : [...prev, opt.key]));
              setFilter("");
              setSearchSuggestOpen(false);
              setSearchActiveIndex(-1);
              resetVisibleCount();
            },
          });
        });

      countryOptions
        .filter((opt) => match(opt.label) || match(opt.code))
        .slice(0, 8)
        .forEach((opt) => {
          add({
            id: `country:${opt.code}`,
            kind: "country",
            label: opt.label,
            prefix: (
              <span className="flex items-center gap-1">
                <span className="text-base leading-none">{renderCountryFlag(opt.code)}</span>
                <MapPin className="h-4 w-4 text-success" />
              </span>
            ),
            suffix: opt.count ? String(opt.count) : "",
            onSelect: () => {
              setCountryFilter(opt.code);
              setFilter("");
              setSearchSuggestOpen(false);
              setSearchActiveIndex(-1);
              resetVisibleCount();
            },
          });
        });

      companyOptions
        .filter((opt) => match(opt.label) || match(opt.key))
        .slice(0, 6)
        .forEach((opt) => {
          add({
            id: `company:${opt.key}`,
            kind: "company",
            label: opt.label,
            prefix: opt.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={opt.logo}
                alt=""
                className="h-6 w-6 rounded-full object-cover ring-1 ring-ring"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <Building2 className="h-4 w-4 text-muted-foreground" />
            ),
            suffix: opt.count ? String(opt.count) : "",
            onSelect: () => {
              setCompanyFilters((prev) => (prev.includes(opt.key) ? prev : [...prev, opt.key]));
              setFilter("");
              setSearchSuggestOpen(false);
              setSearchActiveIndex(-1);
              resetVisibleCount();
            },
          });
        });

      addPriority();
    }

    return suggestions.slice(0, 18);
  }, [
    companyOptions,
    countryOptions,
    departmentOptions,
    filter,
    priorityCounts,
    publicPriorityTypes,
    resetVisibleCount,
    searchSuggestionPool,
  ]);

  useEffect(() => {
    if (!searchSuggestOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = searchRootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setSearchSuggestOpen(false);
      setSearchActiveIndex(-1);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [searchSuggestOpen]);

  useEffect(() => {
    if (!searchSuggestOpen) return;
    setSearchActiveIndex(-1);
  }, [searchSuggestOpen, filter]);

  const syncSearchCaret = useCallback(() => {
    const el = searchInputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    setSearchCaretAtEnd(start === end && end === el.value.length);
  }, []);

  const measureInputTextWidth = useCallback((input: HTMLInputElement, text: string) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const styles = window.getComputedStyle(input);
    ctx.font = styles.font || `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
    // Approximate letter-spacing by adding it per character.
    const letterSpacing = Number.parseFloat(styles.letterSpacing || "0") || 0;
    const base = ctx.measureText(text).width;
    return base + Math.max(0, text.length - 1) * letterSpacing;
  }, []);

  const acceptInlineAutocomplete = useCallback(
    (nextValue: string) => {
      setFilter(nextValue);
      setSearchSuggestOpen(false);
      setSearchActiveIndex(-1);
      resetVisibleCount();
      requestAnimationFrame(() => {
        const input = searchInputRef.current;
        if (!input) return;
        suppressNextSuggestOpenRef.current = true;
        input.focus();
        try {
          input.setSelectionRange(nextValue.length, nextValue.length);
        } catch {
          // ignore
        }
        syncSearchCaret();
      });
    },
    [resetVisibleCount, syncSearchCaret]
  );

  const inlineAutocomplete = useMemo(() => {
    if (!searchSuggestOpen) return null;
    if (!searchCaretAtEnd) return null;
    const typed = filter;
    if (!typed.trim()) return null;
    if (/\s$/.test(typed)) return null;

    const tokenMatch = typed.match(/(\S+)$/);
    if (!tokenMatch) return null;
    const token = tokenMatch[1] ?? "";
    if (token.length < 2) return null;
    const tokenLower = token.toLowerCase();
    const prefix = typed.slice(0, typed.length - token.length);

    const pickBest = (labels: string[]) => {
      const matches = labels
        .map((label) => label.trim())
        .filter(Boolean)
        .filter((label) => label.toLowerCase().startsWith(tokenLower))
        .filter((label) => label.length > token.length);
      if (matches.length === 0) return "";
      return matches.sort((a, b) => a.length - b.length || a.localeCompare(b))[0] ?? "";
    };

    const departmentLabel = pickBest(departmentOptions.map((opt) => opt.label));
    const countryLabel = pickBest(countryOptions.map((opt) => opt.label));
    const companyLabel = pickBest(companyOptions.map((opt) => opt.label));
    const priorityLabel = pickBest(
      availablePriorityTypes
        .filter((type) => (priorityCounts.get(normalizePriorityKey(type.key)) ?? 0) > 0)
        .map((type) => type.label)
    );
    const titleLabel = pickBest(
      [...searchSuggestionPool]
        .sort((a, b) => b.__updatedAtMs - a.__updatedAtMs)
        .map((job) => asString(job.name))
    );

    const candidate =
      departmentLabel || countryLabel || companyLabel || priorityLabel || titleLabel;
    if (!candidate) return null;

    const tail = candidate.slice(token.length);
    if (!tail) return null;
    return { full: `${prefix}${candidate}`, tail };
  }, [
    companyOptions,
    countryOptions,
    departmentOptions,
    filter,
    availablePriorityTypes,
    priorityCounts,
    searchSuggestionPool,
    searchCaretAtEnd,
    searchSuggestOpen,
  ]);

  const hasAnyFilter =
    filter.trim().length > 0 ||
    companyFilters.length > 0 ||
    departmentFilters.length > 0 ||
    countryFilter.length > 0 ||
    shipTypeFilters.length > 0 ||
    priorityFilters.length > 0;

  const clearAllFilters = useCallback(() => {
    setFilter("");
    setCompanyFilters([]);
    setDepartmentFilters([]);
    setCountryFilter("");
    setShipTypeFilters([]);
    setPriorityFilters([]);
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void; onEdit?: () => void }> =
      [];

    const query = filter.trim();
    if (query) chips.push({ id: "query", label: `Keyword: ${query}`, onRemove: () => setFilter("") });

    if (companyFilters.length > 0) {
      const labels = companyFilters
        .map((key) => companyLabelByKey.get(key) ?? key)
        .filter(Boolean);
      const summary =
        labels.length <= 1
          ? labels[0] ?? "Selected"
          : labels.length === 2
            ? `${labels[0]} + ${labels[1]}`
            : `${labels[0]} + ${labels.length - 1}`;

      chips.push({
        id: "companies",
        label: `Companies: ${summary}`,
        onEdit: () => setCompanyModalOpen(true),
        onRemove: () => setCompanyFilters([]),
      });
    }

    if (departmentFilters.length > 0) {
      const labels = departmentFilters
        .map((key) => departmentLabelByKey.get(key) ?? key)
        .filter(Boolean);
      const summary =
        labels.length <= 1
          ? labels[0] ?? "Selected"
          : labels.length === 2
            ? `${labels[0]} + ${labels[1]}`
            : `${labels[0]} + ${labels.length - 1}`;

      chips.push({
        id: "departments",
        label: `Departments: ${summary}`,
        onEdit: () => setDepartmentModalOpen(true),
        onRemove: () => setDepartmentFilters([]),
      });
    }

    if (countryFilter)
      chips.push({
        id: `country:${countryFilter.toUpperCase()}`,
        label: `Country: ${countryFilterLabel}`,
        onRemove: () => setCountryFilter(""),
      });

    shipTypeFilters.forEach((key) => {
      chips.push({
        id: `ship-type:${key}`,
        label: `Ship: ${JOB_SHIP_TYPE_LABELS[key]}`,
        onRemove: () =>
          setShipTypeFilters((prev) => prev.filter((value) => value !== key)),
      });
    });

    priorityFilters.forEach((key) => {
      const normalized = normalizePriorityKey(key);
      chips.push({
        id: `priority:${normalized}`,
        label: `Priority: ${getPriorityLabel(normalized, publicPriorityTypes)}`,
        onRemove: () =>
          setPriorityFilters((prev) =>
            prev.filter((value) => normalizePriorityKey(value) !== normalized)
          ),
      });
    });

    return chips;
  }, [
    companyFilters,
    companyLabelByKey,
    countryFilter,
    countryFilterLabel,
    departmentFilters,
    departmentLabelByKey,
    filter,
    priorityFilters,
    publicPriorityTypes,
    shipTypeFilters,
  ]);

  const selectedSummary = useMemo(() => {
    if (!selectedId) return null;
    return jobs.find((job) => job.id === selectedId) ?? null;
  }, [jobs, selectedId]);

  const modalDescription = useMemo(() => {
    const raw = buildPublicPositionDescription(details);
    if (!raw.trim()) {
      return { heroSrc: "", bodyHtml: "", bodyText: "" };
    }
    if (!containsHtml(raw)) {
      return { heroSrc: "", bodyHtml: "", bodyText: raw.trim() };
    }
    const safeHtml = sanitizeHtml(raw);
    const extracted = extractHeroImageFromSafeHtml(safeHtml);
    return { heroSrc: extracted.heroSrc, bodyHtml: extracted.bodyHtml, bodyText: "" };
  }, [details]);

  const modalPriorityLabel = useMemo(() => {
    const priority = details
      ? asString(isRecord(details) ? details["priority"] : undefined).trim().toLowerCase()
      : asString(selectedSummary?.priority).trim().toLowerCase();
    const key = normalizePriorityKey(priority);
    if (!key) return "";
    return priorityBadgeLabelByKey.get(key) ?? getPriorityLabel(priority, availablePriorityTypes);
  }, [availablePriorityTypes, details, priorityBadgeLabelByKey, selectedSummary]);

  const modalBenefitTags = useMemo(() => {
    if (!selectedId) return [];
    if (details && isRecord(details) && Object.prototype.hasOwnProperty.call(details, "benefit_tags")) {
      const raw = (details as Record<string, unknown>).benefit_tags;
      const tags = Array.isArray(raw)
        ? raw.map((item) => asString(item).trim()).filter(Boolean)
        : [];
      return getVisibleBenefitTags(tags);
    }
    return benefitTagsById.get(selectedId) ?? [];
  }, [benefitTagsById, details, selectedId]);

  const modalIsHidden = useMemo(() => {
    if (!details || !isRecord(details)) return false;
    const value = (details as Record<string, unknown>).hidden;
    if (value === true) return true;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return ["1", "true", "yes", "y", "on"].includes(normalized);
    }
    return false;
  }, [details]);

  const handleCopyShareLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    if (!href) return;
    const url = new URL(href);
    url.pathname = "/";
    url.searchParams.delete("job");
    url.searchParams.delete("jd");
    const selectedJob = selectedId ? jobsRef.current.find((job) => job.id === selectedId) : null;
    if (selectedJob) {
      const path = getPublicJobSharePath(selectedJob);
      const slug = new URL(path, window.location.origin).searchParams.get("jd");
      if (slug) url.searchParams.set("jd", slug);
    } else if (selectedId) {
      url.searchParams.set("job", selectedId);
    }
    void navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 1800);
      })
      .catch(() => {
        // ignore
      });
  }, [selectedId]);

  useEffect(() => {
    setShareCopied(false);
    setApplyNavigating(false);
    setApplyDisclaimerOpen(false);
  }, [selectedId]);

  return (
    <div className="min-h-screen [overflow-x:clip] bg-muted px-2.5 pb-10 pt-20 text-foreground sm:px-5 sm:pt-28 lg:px-8">
      <StickyJobsHeader />
      <div className="mx-auto w-full max-w-[1280px]">
        <section
          className="relative border-b border-border px-5 pb-12 pt-9 text-center sm:px-10 sm:pb-16 sm:pt-12"
        >

          <div className="relative">
            <h1 className="mx-auto max-w-[12ch] text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:max-w-none sm:text-4xl">
              Find Your Dream Jobs
            </h1>
            <p className="mx-auto mt-4 max-w-[28ch] text-pretty text-sm leading-6 text-muted-foreground sm:max-w-2xl sm:text-base">
	              Browse open positions and view full job details.
	            </p>

			            {pageAssetsReady && heroAssetsReady && heroSliderItems && heroSliderItems.length > 0 ? (
			              <LogoStackSlider className="mx-auto mt-10" size={124} items={heroSliderItems} />
			            ) : (
			              <HeroLogoStackSkeleton className="mx-auto mt-10" size={124} />
			            )}
		          </div>
		        </section>

        <form
          className="relative z-10 mx-auto -mt-8 w-full max-w-[820px] rounded-panel border border-border bg-card p-3 shadow-control sm:-mt-8 sm:rounded-panel sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            resetVisibleCount();
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
          }}
        >
          <div ref={searchRootRef} className="relative">
            <div className="flex items-center gap-2 rounded-panel border border-border bg-card px-3 py-2.5 shadow-overlay sm:gap-3 sm:px-4 sm:py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-foreground ring-1 ring-ring sm:h-10 sm:w-10">
                <Search className="h-4 w-4" />
              </span>
              <div className="relative min-w-0 flex-1">
                {inlineAutocomplete ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-10 w-full overflow-hidden whitespace-nowrap text-sm leading-10 text-foreground"
                  >
                    <span className="text-transparent">{filter}</span>
                    <span className="text-muted-foreground">{inlineAutocomplete.tail}</span>
                  </div>
                ) : null}
                <UiInput
                  ref={searchInputRef}
                  autoComplete="off"
                  className="relative h-10 w-full leading-10"
                  placeholder="Jobs title or keywords"
                  value={filter}
	                  onFocus={() => {
	                    if (suppressNextSuggestOpenRef.current) {
	                      suppressNextSuggestOpenRef.current = false;
	                      requestAnimationFrame(() => syncSearchCaret());
	                      return;
	                    }
	                    setSearchSuggestOpen(true);
	                    requestAnimationFrame(() => syncSearchCaret());
	                  }}
	                  onChange={(event) => {
	                    setFilter(event.target.value);
	                    setSearchSuggestOpen(true);
	                    requestAnimationFrame(() => syncSearchCaret());
	                  }}
                  onSelect={() => requestAnimationFrame(() => syncSearchCaret())}
                  onMouseDown={(event) => {
                    if (!inlineAutocomplete) return;
                    if (!searchCaretAtEnd) return;
                    const input = event.currentTarget;
                    const rect = input.getBoundingClientRect();
                    const styles = window.getComputedStyle(input);
                    const paddingLeft = Number.parseFloat(styles.paddingLeft || "0") || 0;
                    const clickX = event.clientX - rect.left;
                    const typedWidth = measureInputTextWidth(input, filter);
                    if (clickX > paddingLeft + typedWidth + 2) {
                      event.preventDefault();
                      acceptInlineAutocomplete(inlineAutocomplete.full);
                      return;
                    }
                    requestAnimationFrame(() => syncSearchCaret());
                  }}
                  onClick={() => requestAnimationFrame(() => syncSearchCaret())}
                  onKeyUp={() => requestAnimationFrame(() => syncSearchCaret())}
	                  onKeyDown={(event) => {
                    if ((event.key === "Tab" || event.key === "ArrowRight") && inlineAutocomplete) {
                      event.preventDefault();
                      acceptInlineAutocomplete(inlineAutocomplete.full);
                      return;
                    }

                    if (!searchSuggestOpen) return;
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSearchSuggestOpen(false);
                      setSearchActiveIndex(-1);
                      return;
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setSearchActiveIndex((prev) => {
                        if (searchSuggestions.length === 0) return -1;
                        const next =
                          prev < 0 ? 0 : Math.min(searchSuggestions.length - 1, prev + 1);
                        return next;
                      });
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setSearchActiveIndex((prev) => {
                        if (searchSuggestions.length === 0) return -1;
                        const next = prev <= 0 ? -1 : prev - 1;
                        return next;
                      });
                      return;
                    }
	                    if (event.key === "Enter" && searchActiveIndex >= 0) {
	                      event.preventDefault();
	                      const item = searchSuggestions[searchActiveIndex];
	                      if (item) item.onSelect();
	                    }
	                  }}
	                />
              </div>
              <UiButton variant="primary" size="md"
                type="submit"
                className="hidden h-10 shrink-0 transition sm:block"
              >
                Search
              </UiButton>
            </div>

            {searchSuggestOpen && searchSuggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-panel border border-border bg-card shadow-xl">
                <div className="hide-scrollbar max-h-72 overflow-auto p-1">
	                  {searchSuggestions.map((item, idx) => {
	                    const active = idx === searchActiveIndex;
	                    return (
	                      <button
	                        key={item.id}
	                        type="button"
	                        className={[
	                          "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm",
	                          active
	                            ? "bg-success-muted text-success"
	                            : "text-foreground hover:bg-muted",
	                        ].join(" ")}
	                        onMouseEnter={() => setSearchActiveIndex(idx)}
	                        onMouseDown={(event) => {
	                          // Keep focus in the input (prevents immediate re-open on focus).
	                          event.preventDefault();
	                          suppressNextSuggestOpenRef.current = true;
	                          item.onSelect();
	                        }}
	                        onClick={() => {
	                          // Keyboard activation fallback.
	                          suppressNextSuggestOpenRef.current = true;
	                          item.onSelect();
	                        }}
	                      >
	                        <span className="flex min-w-0 items-center gap-2">
	                          {item.prefix ? <span className="flex-none">{item.prefix}</span> : null}
	                          <span className="min-w-0 truncate">{item.label}</span>
	                        </span>
	                        {item.suffix ? (
	                          <span className="flex-none text-xs font-semibold text-muted-foreground">
	                            {item.suffix}
	                          </span>
	                        ) : null}
	                      </button>
	                    );
	                  })}
                </div>
              </div>
            ) : null}
          </div>

          {activeFilterChips.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 px-1">
              {activeFilterChips.map((chip) => (
                <div
                  key={chip.id}
                  className="group inline-flex items-center gap-2 rounded-full border border-black bg-black px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black/90"
                >
                  <button
                    type="button"
                    onClick={chip.onEdit ?? chip.onRemove}
                    className="inline-flex min-w-0 items-center gap-2 text-left"
                    aria-label={
                      chip.onEdit ? `Edit filter: ${chip.label}` : `Remove filter: ${chip.label}`
                    }
                  >
                    <span className="max-w-[260px] truncate whitespace-nowrap">
                      {chip.label}
                    </span>
                    {chip.onEdit ? (
                      <span className="text-[10px] font-semibold text-white/60">Edit</span>
                    ) : null}
                  </button>
                  <UiButton variant="ghost" size="md"
                    type="button"
                    className="grid h-6 w-6 place-items-center transition"
                    aria-label={`Remove filter: ${chip.label}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      chip.onRemove();
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </UiButton>
                </div>
              ))}
              <UiButton variant="secondary" size="sm"
                type="button"
                className="inline-flex items-center gap-2 transition"
                onClick={clearAllFilters}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Clear all filters
              </UiButton>
            </div>
          ) : null}

          <div className="mt-3 xl:hidden">
            <div className="flex items-center justify-between gap-3 rounded-panel border border-border bg-muted p-2">
              <UiButton variant="primary" size="md"
                type="button"
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-2"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                aria-expanded={mobileFiltersOpen}
              >
                <SlidersHorizontal className="h-4 w-4 shrink-0" />
                <span>{mobileFiltersOpen ? "Hide filters" : "Filter Jobs"}</span>
                {activeFilterChips.length > 0 ? (
                  <span className="rounded-full bg-card/15 px-2 py-0.5 text-[11px]">
                    {activeFilterChips.length}
                  </span>
                ) : null}
              </UiButton>
              {hasAnyFilter ? (
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="shrink-0"
                  onClick={clearAllFilters}
                >
                  Clear
                </UiButton>
              ) : null}
            </div>

            {mobileFiltersOpen ? (
              <div className="mt-3 rounded-panel border border-border bg-card p-3 shadow-sm">
                <div className="grid gap-4">
                    <MultiSelectTrigger
                      label="Company"
                      icon={Building2}
                      valueLabel={companyValueLabel}
                      onClick={() => setCompanyModalOpen(true)}
                    />
                    <MultiSelectTrigger
                      label="Department"
                      icon={UserRound}
                      valueLabel={departmentValueLabel}
                      onClick={() => setDepartmentModalOpen(true)}
                    />
                    <FilterDropdown
                      label="Your citizenship"
                      icon={MapPin}
                      value={countryFilter}
                      placeholder="All countries"
                      onChange={setCountryFilter}
                      options={[
                        { value: "", label: "All countries" },
                        ...countryOptions.map((opt) => ({
                          value: opt.code,
                          label: opt.label,
                          prefix: renderCountryFlag(opt.code),
                          suffix: opt.count ? String(opt.count) : "",
                        })),
                      ]}
                    />
                </div>

                <div className="mt-5">
                  <FilterSectionLabel icon={Compass} label="Ship Type" />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                    {JOB_SHIP_TYPES.map((shipType) => {
                      const count = shipTypeCounts.get(shipType) ?? 0;
                      const checked = shipTypeFilters.includes(shipType);
                      return (
                        <label
                          key={shipType}
                          className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-input text-success focus:ring-success/25"
                              checked={checked}
                              disabled={count === 0}
                              onChange={(event) =>
                                setShipTypeFilters((prev) =>
                                  event.target.checked
                                    ? prev.includes(shipType)
                                      ? prev
                                      : [...prev, shipType]
                                    : prev.filter((value) => value !== shipType)
                                )
                              }
                            />
                            <span className={count === 0 ? "truncate text-muted-foreground" : "truncate"}>
                              {JOB_SHIP_TYPE_LABELS[shipType]}
                            </span>
                          </span>
                          <span className={count === 0 ? "text-muted-foreground" : "text-muted-foreground"}>
                            {count}
                          </span>
                        </label>
                      );
                    })}

                    {shipTypeFilters.length > 0 ? (
                      <button
                        type="button"
                        className="mt-1 w-full rounded-md px-2 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-muted"
                        onClick={() => setShipTypeFilters([])}
                      >
                        Clear ship type
                      </button>
                    ) : null}
                </div>

                <div className="mt-5">
                  <FilterSectionLabel icon={AlertTriangle} label="Priority" />
                </div>
                <div className="mt-2 grid gap-2">
                {publicPriorityTypes.map((type) => {
                  const key = normalizePriorityKey(type.key);
                  const count = priorityCounts.get(key) ?? 0;
                  const checked = priorityFilters.includes(key);
                  const priorityTextClass = getPriorityTextClass(key, availablePriorityTypes);
                  return (
                    <div
                      key={key}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
                    >
                      <label className="flex flex-1 cursor-pointer min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input text-success focus:ring-success/25"
                          checked={checked}
                          disabled={count === 0}
                          onChange={(event) =>
                            setPriorityFilters((prev) =>
                              event.target.checked
                                ? prev.includes(key)
                                  ? prev
                                  : [...prev, key]
                                : prev.filter((value) => value !== key)
                            )
                          }
                        />
                        <span className={count === 0 ? "truncate text-muted-foreground" : `truncate ${priorityTextClass}`}>
                          {type.label}
                        </span>
                      </label>
                      <FilterTooltip label={type.label} text={getPriorityTooltip(type)} open={openPriorityTooltip === key} onOpenChange={open => setOpenPriorityTooltip(current => open ? key : current === key ? null : current)} />
                      <span className={count === 0 ? "text-muted-foreground" : priorityTextClass}>
                        {count}
                      </span>
                    </div>
                  );
                })}

                {priorityFilters.length > 0 ? (
                  <button
                    type="button"
                    className="mt-1 w-full rounded-md px-2 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-muted"
                    onClick={() => setPriorityFilters([])}
                  >
                    Clear priority
	                  </button>
	                ) : null}
                </div>

                <div className="mt-5">
                  <JobsDisplayLimitFilter value={displayLimit} onChange={setDisplayLimit} />
                </div>
              </div>
            ) : null}
          </div>
	        </form>

        <div className="mt-5 grid gap-6 sm:mt-8 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
				          <aside className="sticky top-24 hidden self-start xl:block">
					            <div className="hide-scrollbar max-h-[calc(100vh-7rem)] overflow-auto rounded-panel border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Filter</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {filtered.length.toLocaleString()}{" "}
                    {filtered.length === 1 ? "job" : "jobs"}
                  </div>
                </div>
                {hasAnyFilter ? (
                  <UiButton variant="secondary" size="sm"
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1.5 transition"
                    onClick={clearAllFilters}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear all
                  </UiButton>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4">
                <MultiSelectTrigger
                  label="Company"
                  icon={Building2}
                  valueLabel={companyValueLabel}
                  onClick={() => setCompanyModalOpen(true)}
                />
                <MultiSelectTrigger
                  label="Department"
                  icon={UserRound}
                  valueLabel={departmentValueLabel}
                  onClick={() => setDepartmentModalOpen(true)}
                />
                <FilterDropdown
                  label="Your citizenship"
                  icon={MapPin}
                  value={countryFilter}
                  placeholder="All countries"
                  onChange={setCountryFilter}
                  options={[
                    { value: "", label: "All countries" },
                    ...countryOptions.map((opt) => ({
                      value: opt.code,
                      label: opt.label,
                      prefix: renderCountryFlag(opt.code),
                      suffix: opt.count ? String(opt.count) : "",
                    })),
                  ]}
                />
              </div>

              {companyModalOpen ? (
                <MultiSelectModal
                  open
                  title="Companies"
                  description="Select one or multiple companies"
                  columns={2}
                  options={companyOptions.map((opt) => ({
                    value: opt.key,
                    label: opt.label.toUpperCase(),
                    prefix: companyOptionPrefix(opt.label, opt.logo),
                    searchText: opt.label,
                    suffix: opt.count ? String(opt.count) : "",
                  }))}
                  selected={companyFilters}
                  onApply={(next) => setCompanyFilters(next)}
                  onClose={() => setCompanyModalOpen(false)}
                />
              ) : null}

              {departmentModalOpen ? (
                <MultiSelectModal
                  open
                  title="Departments"
                  description="Select one or multiple departments"
                  columns={2}
                  options={departmentOptions.map((opt) => ({
                    value: opt.key,
                    label: opt.label,
                    searchText: opt.label,
                    suffix: opt.count ? String(opt.count) : "",
                  }))}
                  selected={departmentFilters}
                  onApply={(next) => setDepartmentFilters(next)}
                  onClose={() => setDepartmentModalOpen(false)}
                />
              ) : null}

              <div className="mt-5">
                <FilterSectionLabel icon={Compass} label="Ship Type" />
                <div className="mt-2 grid gap-2 rounded-panel border border-border bg-card p-3">
                  {JOB_SHIP_TYPES.map((shipType) => {
                    const count = shipTypeCounts.get(shipType) ?? 0;
                    const checked = shipTypeFilters.includes(shipType);
                    return (
                      <label
                        key={shipType}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input text-success focus:ring-success/25"
                            checked={checked}
                            disabled={count === 0}
                            onChange={(event) =>
                              setShipTypeFilters((prev) =>
                                event.target.checked
                                  ? prev.includes(shipType)
                                    ? prev
                                    : [...prev, shipType]
                                  : prev.filter((value) => value !== shipType)
                              )
                            }
                          />
                          <span className={count === 0 ? "text-muted-foreground" : ""}>
                            {JOB_SHIP_TYPE_LABELS[shipType]}
                          </span>
                        </span>
                        <span className={count === 0 ? "text-muted-foreground" : "text-muted-foreground"}>
                          {count}
                        </span>
                      </label>
                    );
                  })}

                  {shipTypeFilters.length > 0 ? (
                    <button
                      type="button"
                      className="mt-1 w-full rounded-md px-2 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-muted"
                      onClick={() => setShipTypeFilters([])}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5">
                <FilterSectionLabel icon={AlertTriangle} label="Priority" />
                <div className="mt-2 grid gap-2 rounded-panel border border-border bg-card p-3">
                  {publicPriorityTypes.map((type) => {
                    const key = normalizePriorityKey(type.key);
                    const count = priorityCounts.get(key) ?? 0;
                    const checked = priorityFilters.includes(key);
                    const priorityTextClass = getPriorityTextClass(key, availablePriorityTypes);
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
                      >
                        <FilterTooltip label={type.label} text={getPriorityTooltip(type)} open={openPriorityTooltip === key} onOpenChange={open => setOpenPriorityTooltip(current => open ? key : current === key ? null : current)}>
                        <label className="flex flex-1 cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input text-success focus:ring-success/25"
                            checked={checked}
                            disabled={count === 0}
                            onChange={(event) =>
                              setPriorityFilters((prev) =>
                                event.target.checked
                                  ? prev.includes(key)
                                    ? prev
                                    : [...prev, key]
                                  : prev.filter((value) => value !== key)
                              )
                            }
                          />
                          <span className={count === 0 ? "text-muted-foreground" : priorityTextClass}>
                            {type.label}
                          </span>
                        </label>
                        </FilterTooltip>
                        <span className={count === 0 ? "text-muted-foreground" : priorityTextClass}>
                          {count}
                        </span>
                      </div>
                    );
                  })}

                  {priorityFilters.length > 0 ? (
                    <button
                      type="button"
                      className="mt-1 w-full rounded-md px-2 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-muted"
                      onClick={() => setPriorityFilters([])}
                    >
                      Clear
                    </button>
	                  ) : null}
		                </div>
		              </div>

                  <div className="mt-5">
                    <JobsDisplayLimitFilter value={displayLimit} onChange={setDisplayLimit} />
                  </div>
		            </div>
		          </aside>

	          <main className="min-w-0">
            <div className="min-w-0 rounded-panel border border-border bg-card p-3 text-foreground shadow-sm sm:rounded-panel sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {filtered.length.toLocaleString()}
                  </span>{" "}
                  jobs
                </div>
                {hasAnyFilter ? (
                  <UiButton variant="secondary" size="sm"
                    type="button"
                    className="xl:hidden"
                    onClick={clearAllFilters}
                  >
                    Clear all
                  </UiButton>
                ) : null}
              </div>

              {error ? (
                <div className="mt-4 rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {!loading && filtered.length > 0
                ? getTopTestimonials(testimonials).map((testimonial) => (
                    <div key={`top-${testimonial.id}`} className="mt-5">
                      <JobTestimonialStrip testimonial={testimonial} variant="top" />
                    </div>
                  ))
                : null}

              <div className="mt-5 space-y-4">
                {loading ? (
                  <JobsListSkeleton />
                ) : filtered.length === 0 ? (
                  <div className="rounded-panel border border-border bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
                    No positions found.
                  </div>
                ) : (
                  visibleJobs.map((job, index) => {
                    const isSelected = selectedId === job.id;
                    const company = asString(job.company).trim();
                    const department = asString(job.department).trim();
                    const companyLogoUrl = asString(job.company_logo_url).trim();
                    const benefitTags = benefitTagsById.get(job.id) ?? [];
                    const avatarSeed = (company || asString(job.name)).trim() || "J";
                    const avatar = avatarSeed.slice(0, 1).toUpperCase();
	                    const priority = asString(job.priority).trim().toLowerCase();
	                    const priorityKey = normalizePriorityKey(priority);
	                    const priorityLabel = priorityKey
	                      ? priorityBadgeLabelByKey.get(priorityKey) ??
	                        getPriorityLabel(priorityKey, availablePriorityTypes)
	                      : "";
	                    const shipTypeLabels =
	                      job.__shipTypeKeys.length > 0
	                        ? job.__shipTypeKeys.map((type) => JOB_SHIP_TYPE_LABELS[type])
	                        : [
	                            getJobShipTypeLabel(job.ship_type) ||
	                              getJobShipTypeLabel(inferJobShipTypeFromText(job.company, job.name)),
	                          ].filter(Boolean);

	                    return (
                    <Fragment key={job.view_id || job.id || `${job.name}-${index}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        className={[
                          "group w-full cursor-pointer rounded-[22px] border bg-card p-4 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-success/25 xl:flex xl:items-start xl:justify-between xl:gap-4 xl:rounded-panel xl:p-5",
                          isSelected
                            ? "border-success/25 ring-inset ring-2 ring-success/25"
                            : "border-border hover:border-success/25",
                        ].join(" ")}
                        onClick={() => {
                          setSelectedId(job.id);
                          pushSelectedIdInUrl(job.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          setSelectedId(job.id);
                          pushSelectedIdInUrl(job.id);
                        }}
                      >
                        <div className="min-w-0 xl:flex xl:items-start xl:gap-4">
                          <div className="hidden mt-0.5 h-[calc(var(--spacing)*21)] w-[calc(var(--spacing)*21)] shrink-0 place-items-center overflow-hidden rounded-full bg-card text-sm font-bold text-muted-foreground ring-1 ring-ring xl:grid">
                            {companyLogoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={companyLogoUrl}
                                alt={company || job.name || "Company"}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              avatar
                            )}
                          </div>

                          <div className="min-w-0 xl:flex-1">
                            <div className="flex min-w-0 items-start gap-3 xl:block">
                              <div className="mt-0.5 grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-panel bg-card text-sm font-bold text-muted-foreground ring-1 ring-ring xl:hidden">
                            {companyLogoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={companyLogoUrl}
                                alt={company || job.name || "Company"}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              avatar
                            )}
                              </div>

                              <div className="min-w-0 flex-1">
                              <div className="min-w-0 break-words text-[19px] font-extrabold leading-[1.18] text-foreground xl:hidden">
                                <span className="flex flex-wrap items-center gap-2">
                                  {priorityLabel ? (
                                    <span
                                      className={[
                                        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
                                        getPriorityBadgeClass(priority, availablePriorityTypes),
                                      ].join(" ")}
                                    >
                                      {priorityLabel}
                                    </span>
                                  ) : null}
                                  <span className="min-w-0 break-words">{job.name || "Position"}</span>
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 xl:mt-0">
                                {priorityLabel ? (
                                  <span
                                    className={[
                                      "hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm xl:inline-flex",
                                      getPriorityBadgeClass(priority, availablePriorityTypes),
                                    ].join(" ")}
                                  >
                                    {priorityLabel}
                                  </span>
                                ) : null}
                                <div className="hidden min-w-0 flex-1 break-words text-[18px] font-extrabold leading-snug text-foreground xl:block">
                                  {job.name || "Position"}
                                </div>
                              </div>
                              </div>
                            </div>

                            <BenefitTagDatapoints tags={benefitTags} benefitLabels={benefitLabels} />
                            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-semibold xl:mt-5">
			                              {department ? (
			                                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1.5 text-foreground shadow-sm">
			                                  <UserRound className="h-3.5 w-3.5 text-warning" />
                                  <span className="max-w-[210px] truncate whitespace-nowrap xl:max-w-[260px]">
		                                    {department}
		                                  </span>
		                                </span>
		                              ) : null}
		                              {shipTypeLabels.map((shipTypeLabel) => (
		                                <span
		                                  key={shipTypeLabel}
		                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1.5 text-foreground shadow-sm"
		                                >
		                                  <Compass className="h-3.5 w-3.5 text-foreground" />
                                  <span className="max-w-[210px] truncate whitespace-nowrap xl:max-w-[320px]">
		                                    {shipTypeLabel}
		                                  </span>
		                                </span>
		                              ))}
		                            </div>
	                          </div>
	                        </div>

                      </div>
                      {getInlineTestimonials(index, testimonials).map((testimonial) => (
                        <JobTestimonialStrip
                          key={`${job.id}-${testimonial.id}`}
                          testimonial={testimonial}
                          variant="inline"
                        />
                      ))}
                    </Fragment>
	                    );
	                  })
	                )}
              </div>

              {!loading && filtered.length > 0 ? (
                <div className="mt-6 flex flex-col items-center justify-center gap-3 text-center text-xs text-muted-foreground">
                  <div>
                    Showing{" "}
                    <span className="font-semibold text-foreground">
                      {Math.min(filtered.length, visibleCount)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-foreground">{filtered.length}</span>
                  </div>
                  {visibleCount < filtered.length ? (
                    <UiButton variant="primary" size="lg"
                      type="button"
                      className="inline-flex h-12 items-center justify-center gap-2 transition hover:brightness-105"
                      onClick={() =>
                        setVisibleCount((current) =>
                          Math.min(filtered.length, current + getVisibleCountForLimit(displayLimit))
                        )
                      }
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>Load more{displayLimit === "all" ? "" : ` ${displayLimit}`}</span>
                    </UiButton>
                  ) : null}
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </div>

      {selectedId ? (
        <DetailsModalShell
          open
          labelledBy="job-details-title"
          onClose={closeDetails}
          hero={
            <HeroCoverImage src={modalDescription.heroSrc} />
          }
          heroActions={
            <>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-card/90 text-foreground shadow-sm backdrop-blur transition hover:bg-card focus:outline-none focus:ring-2 focus:ring-white/70"
                    aria-label="Share job"
                    title="Share job"
                  >
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={8}
                    className="z-[12000] min-w-44 rounded-md border border-border bg-card p-1.5 shadow-xl shadow-slate-950/15"
                  >
                    <DropdownMenu.Item
                      onSelect={handleCopyShareLink}
                      className="flex h-10 cursor-default select-none items-center gap-2.5 rounded-lg px-3 text-sm font-semibold text-foreground outline-none transition data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                    >
                      {shareCopied ? (
                        <Check className="h-4 w-4 text-success" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4 text-warning" aria-hidden="true" />
                      )}
                      {shareCopied ? "Link copied" : "Copy link"}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-transparent"
                onClick={closeDetails}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  ×
                </span>
              </button>
            </>
          }
          stickyHeader={
            <div className="sticky top-0 z-20 border-b border-border/80 bg-card/95 px-4 py-4 backdrop-blur sm:px-6 sm:py-5 xl:px-6 xl:pb-5 xl:pt-6">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:gap-4">
                <div className="min-w-0">
                  <div className="mb-2">
                    {(() => {
                      const company = details
                        ? asString(isRecord(details) ? details["company"] : undefined).trim() ||
                          extractCompany(details)
                        : asString(selectedSummary?.company).trim();
                      const companyLogo =
                        details && isRecord(details)
                          ? asString(details["company_logo_url"]).trim()
                          : asString(selectedSummary?.company_logo_url).trim();
                      return (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          {company ? (
                            <span className="inline-flex flex-wrap items-center gap-2 pr-2">
                              {companyLogo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={companyLogo}
                                  alt={company}
                                  className="h-7 w-7 flex-none rounded-full bg-card object-cover shadow-sm ring-1 ring-ring sm:h-8 sm:w-8"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <Building2 className="h-5 w-5 text-muted-foreground" />
                              )}
                              <span className="max-w-[190px] truncate whitespace-nowrap text-sm font-semibold text-foreground uppercase tracking-wide sm:max-w-[340px]">
                                {company}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  detailsAbortRef.current?.abort();
                                  setDetailsLoadingId(null);
                                  setShareCopied(false);
                                  const params = new URLSearchParams(searchParams?.toString() ?? "");
                                  for (const key of ["job", "jd", "q", "company", "department", "country", "ship", "priority"]) params.delete(key);
                                  params.set("company", normalizeFilterKey(company));
                                  pendingCompanyNavigationRef.current = params.toString();
                                  router.push(`/?${params.toString()}`, { scroll: false });
                                }}
                                className="shrink-0 rounded-full border border-input bg-accent px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                              >
                                See all jobs
                              </button>
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                  <div
                    id="job-details-title"
                    className="mt-1 break-words text-[22px] font-extrabold leading-tight text-foreground sm:mt-2 sm:text-2xl"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 break-words">
                        {asString(details?.name).trim() ||
                          asString(details?.title).trim() ||
                          asString(selectedSummary?.name).trim() ||
                          selectedId}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      Position
                    </span>
                              {modalPriorityLabel ? (
                                <span
                                  className={[
                                    "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm sm:px-3 sm:py-1.5 sm:text-[11px]",
                                    getPriorityBadgeClass(
                                      details
                                        ? asString(isRecord(details) ? details["priority"] : undefined)
                                        : asString(selectedSummary?.priority),
                                      availablePriorityTypes
                                    ),
                                  ].join(" ")}
                                >
                                  {modalPriorityLabel}
                                </span>
                              ) : null}
                    {(() => {
                      const department = details
                        ? asString(isRecord(details) ? details["department"] : undefined).trim() ||
                          extractDepartment(details)
                        : asString(selectedSummary?.department).trim();
                      const shipTypeKeys =
                        details && isRecord(details)
                          ? normalizeJobShipTypes(details.ship_types).length > 0
                            ? normalizeJobShipTypes(details.ship_types)
                            : normalizeJobShipTypes(
                                details.ship_type ||
                                  inferJobShipTypeFromText(details.company, details.name, details.title)
                              )
                          : selectedSummary
                            ? selectedSummary.__shipTypeKeys
                            : [];
                      const metaBadges = [
                        department ? { key: "department", label: department } : null,
                        ...shipTypeKeys.map((shipType) => ({
                          key: `shipType-${shipType}`,
                          label: JOB_SHIP_TYPE_LABELS[shipType],
                        })),
                      ].filter(Boolean) as Array<{ key: string; label: string }>;

                      return metaBadges.length > 0 ? (
                        <>
                          {metaBadges.map((badge) => (
                            <span
                              key={badge.key}
                              className={[
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm",
                                badge.key === "department"
                                  ? "border-border bg-muted text-foreground"
                                  : "border-border bg-muted text-foreground",
                              ].join(" ")}
                            >
                              {badge.key === "department" ? (
                                <UserRound className="h-3.5 w-3.5 text-warning" />
                              ) : (
                                <Compass className="h-3.5 w-3.5 text-foreground" />
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
                </div>

                {!modalIsHidden ? (
                  <div className="ml-auto flex w-full flex-col items-center sm:w-auto sm:items-end sm:justify-self-end">
                    <button
                      type="button"
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-panel bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg ring-1 ring-white/20 focus:outline-none focus:ring-2 focus:ring-ring/60 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-70 sm:h-14 sm:w-auto sm:rounded-full sm:px-8 sm:text-base xl:h-16 xl:px-10 xl:shadow-xl"
                      disabled={applyNavigating}
                      onClick={() => {
                        if (typeof window === "undefined") return;
                        if (applyNavigating) return;
                        setApplyDisclaimerOpen(true);
                      }}
                    >
                      {applyNavigating ? (
                        <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                          <span>Apply Now</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="inline-flex h-12 items-center justify-center rounded-panel border border-warning/25 bg-warning-muted px-5 text-sm font-semibold text-warning shadow-sm sm:h-14 sm:rounded-full sm:px-8 sm:justify-self-end xl:h-16">
                    Not active
                  </div>
                )}
              </div>
            </div>
          }
        >
          {modalIsHidden ? (
            <div className="rounded-panel border border-warning/25 bg-warning-muted px-4 py-4 text-sm text-warning">
              This ad is not active.
            </div>
          ) : detailsLoading || (!details && !error) ? (
            <JobDetailsSkeleton />
          ) : !details ? (
            <div className="rounded-panel border border-border bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
              No details returned.
            </div>
          ) : (
            <div className="space-y-5 xl:space-y-6 xl:rounded-panel xl:border xl:border-border xl:bg-card xl:p-5">
              <PremiumJobDetailsPanel
                premium={premium}
                loading={premiumLoading}
                onLogin={() => {
                  const next = selectedId
                    ? getPublicJobSharePath(
                        jobsRef.current.find((job) => job.id === selectedId) ?? {
                          id: selectedId,
                        }
                      )
                    : "/";
                  router.push(`/admin?next=${encodeURIComponent(next)}`);
                }}
              />

              {modalBenefitTags.length > 0 ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="xl:hidden">Benefits</span>
                    <span className="hidden xl:inline">Company Benefits</span>
                  </div>
                  <div className="mt-3">
                    <BenefitTagFeatureList tags={modalBenefitTags} benefitLabels={benefitLabels} />
                  </div>
                </div>
              ) : null}

              {(() => {
                const raw = (details as Record<string, unknown>)?.nationality_countries;
                const countries =
                  raw && typeof raw === "object" && !Array.isArray(raw)
                    ? (raw as NationalityCountries)
                    : null;
                const processableFromDetails = Array.isArray(countries?.processable)
                  ? countries.processable
                      .filter((item) => item && typeof item === "object")
                      .map((item) => ({
                        code: asString((item as { code?: unknown }).code),
                        name: asString((item as { name?: unknown }).name),
                      }))
                      .filter((item) => item.code.trim())
                  : [];
                const processable =
                  processableFromDetails.length > 0
                    ? processableFromDetails
                    : Array.isArray(selectedSummary?.processable_countries)
                      ? selectedSummary.processable_countries
                          .map((code) => {
                            const normalized = asString(code).trim().toUpperCase();
                            return {
                              code: normalized,
                              name: countryLabelFromCode(normalized, countryLabels),
                            };
                          })
                          .filter((item) => item.code)
                      : [];
                const blockedFromDetails = Array.isArray(countries?.blocked)
                  ? countries.blocked
                      .filter((item) => item && typeof item === "object")
                      .map((item) => ({
                        code: asString((item as { code?: unknown }).code),
                        name: asString((item as { name?: unknown }).name),
                      }))
                      .filter((item) => item.code.trim())
                  : [];
                const blocked =
                  blockedFromDetails.length > 0
                    ? blockedFromDetails
                    : Array.isArray(selectedSummary?.blocked_countries)
                      ? selectedSummary.blocked_countries
                          .map((code) => {
                            const normalized = asString(code).trim().toUpperCase();
                            return {
                              code: normalized,
                              name: countryLabelFromCode(normalized, countryLabels),
                            };
                          })
                          .filter((item) => item.code)
                      : [];

                if (processable.length === 0 && blocked.length === 0) return null;

                return (
                  <div className="space-y-4 border-t border-border pt-5 xl:border-t-0 xl:pt-0">
                    {processable.length > 0 ? (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Nationalities we process
                        </div>
                        <div className="mt-2">
                          <CountryChips items={processable} countryLabels={countryLabels} />
                        </div>
                      </div>
                    ) : null}

                    {blocked.length > 0 ? (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Nationalities we can’t process
                        </div>
                        <div className="mt-2">
                          <CountryChips items={blocked} countryLabels={countryLabels} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              <div className="border-t border-border pt-5 xl:border-t-0 xl:pt-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Description
                </div>
                <div className="mt-3 xl:mt-4 xl:overflow-hidden xl:rounded-dialog xl:border xl:border-border xl:bg-card xl:p-8 xl:shadow-overlay">
                  {modalDescription.bodyHtml ? (
                    <RichText content={modalDescription.bodyHtml} />
                  ) : (
                    <div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                      {modalDescription.bodyText || "—"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DetailsModalShell>
      ) : null}

      <ApplyDisclaimerModal
        open={applyDisclaimerOpen}
        loading={applyNavigating}
        onClose={() => setApplyDisclaimerOpen(false)}
        onApply={() => {
          if (typeof window === "undefined") return;
          if (applyNavigating) return;
          setApplyNavigating(true);
          window.location.assign("https://www.ismira.lt/apply");
        }}
      />
    </div>
  );
}
