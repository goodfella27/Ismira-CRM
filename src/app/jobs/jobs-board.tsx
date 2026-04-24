"use client";

import {
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
  Building2,
  UserRound,
  MapPin,
  X,
  Loader2,
  Send,
  Flame,
  AlertTriangle,
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
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createPortal } from "react-dom";

import DetailsModalShell from "@/components/details-modal-shell";
import { LogoStackSlider, type LogoStackItem } from "@/components/logo-stack-slider";
import { extractCompany, extractDepartment } from "@/lib/breezy-position-fields";
import { pickPositionDescription } from "@/lib/breezy-position-description";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  getPriorityLabel,
  normalizePriorityKey,
  type BreezyPriorityType,
} from "@/lib/breezy-priority-types";
import jobBanner from "@/images/job_abnner.png";
import StickyJobsHeader from "./sticky-jobs-header";

type JobListItem = {
  id: string;
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
  benefit_tags?: string[];
  processable_countries?: string[];
  blocked_countries?: string[];
  mentioned_countries?: string[];
};

type JobListItemIndexed = JobListItem & {
  __search: string;
  __companyKey: string;
  __departmentKey: string;
  __priorityKey: string;
  __updatedAtMs: number;
};

type JobsBoardCache = {
  v: 2;
  savedAt: number;
  etag?: string;
  items: JobListItem[];
  priorityTypes: BreezyPriorityType[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeFilterKey(value: unknown) {
  return asString(value).trim().toLowerCase();
}

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

const COUNTRY_DISPLAY_NAMES =
  typeof Intl !== "undefined" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

const HERO_LOGOS_CACHE_KEY = "jobs:hero_logos:v1";
const HERO_LOGOS_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

function countryLabelFromCode(code: string) {
  const upper = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return upper || "—";
  return COUNTRY_DISPLAY_NAMES?.of(upper) ?? upper;
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
              "absolute left-0 bottom-0 overflow-hidden rounded-[28px] ring-1 ring-black/5",
              "bg-white/40 shadow-[0_26px_60px_-30px_rgba(0,0,0,0.25)]",
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
          "text-[15px] leading-7 text-slate-800",
          "[&>*:first-child]:mt-0",
          "[&_p]:mt-4",
          "[&_h1]:mb-3 [&_h1]:mt-8 [&_h1]:border-l-4 [&_h1]:border-sky-300 [&_h1]:pl-4 [&_h1]:text-[1.1rem] [&_h1]:font-extrabold [&_h1]:uppercase [&_h1]:tracking-[0.08em] [&_h1]:text-slate-900",
          "[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-l-4 [&_h2]:border-sky-300 [&_h2]:pl-4 [&_h2]:text-[1.05rem] [&_h2]:font-extrabold [&_h2]:uppercase [&_h2]:tracking-[0.08em] [&_h2]:text-slate-900",
          "[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:border-l-4 [&_h3]:border-sky-200 [&_h3]:pl-4 [&_h3]:text-base [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-slate-800",
          "[&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-[0.08em] [&_h4]:text-slate-600",
          "[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-3 [&_ul]:pl-7",
          "[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-3 [&_ol]:pl-7",
          "[&_li]:leading-7 [&_li]:marker:text-sky-500",
          "[&_strong]:font-extrabold [&_strong]:text-slate-900",
          "[&_a]:font-semibold [&_a]:text-emerald-700 [&_a:hover]:underline",
          "[&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-[24px] [&_img]:border [&_img]:border-slate-200 [&_img]:shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)]",
          "[&_figure]:my-4",
          "[&_hr]:my-6 [&_hr]:border-slate-200",
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

function JobDetailsSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="animate-pulse">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="h-3 w-16 rounded bg-slate-200" />
            <div className="mt-2 h-6 w-72 rounded bg-slate-200" />
          </div>
          <div>
            <div className="h-3 w-10 rounded bg-slate-200" />
            <div className="mt-2 h-4 w-40 rounded bg-slate-200" />
          </div>
          <div className="sm:col-span-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="h-3 w-20 rounded bg-slate-200" />
                <div className="mt-2 h-4 w-48 rounded bg-slate-200" />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="h-3 w-28 rounded bg-slate-200" />
                <div className="mt-2 h-4 w-44 rounded bg-slate-200" />
              </div>
            </div>
          </div>
          <div className="sm:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full rounded bg-slate-200" />
                <div className="h-3 w-[92%] rounded bg-slate-200" />
                <div className="h-3 w-[86%] rounded bg-slate-200" />
                <div className="h-3 w-[70%] rounded bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 text-center text-xs text-slate-500">
          Fetching details (cached after first load)…
        </div>
      </div>
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

function FilterDropdown({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
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
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <button
        ref={buttonRef}
        type="button"
        className="mt-2 inline-flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm hover:bg-slate-50"
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
            <span className="text-slate-500">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 flex-none text-slate-400" />
      </button>

      {open && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[1000] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
              style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
              role="listbox"
            >
              {options.length > 8 ? (
                <div className="border-b border-slate-200 bg-white p-2">
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      className="h-10 w-full border-none bg-transparent text-sm text-slate-800 outline-none"
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
	                        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm",
	                        isSelected
	                          ? "bg-emerald-50 text-emerald-950"
	                          : "text-slate-700 hover:bg-slate-50",
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
                        <span className="flex-none text-xs font-semibold text-slate-500">
                          {opt.suffix}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">No results.</div>
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
  valueLabel,
  onClick,
}: {
  label: string;
  valueLabel: string;
  onClick: () => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <button
        type="button"
        className="mt-2 inline-flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-800 shadow-sm hover:bg-slate-50"
        onClick={onClick}
        aria-haspopup="dialog"
      >
        <span className="flex min-w-0 items-center gap-2 truncate text-left">
          <span className={valueLabel.toLowerCase().startsWith("all ") ? "text-slate-500" : ""}>
            {valueLabel}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 flex-none text-slate-400" />
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
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-[0_30px_80px_-55px_rgba(0,0,0,0.85)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-1 text-xs text-slate-500">
              {description ?? `${draft.length} selected`}
            </div>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 text-white shadow-sm hover:bg-black"
            aria-label="Close"
            onClick={onClose}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </button>
        </div>

        <div className="border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="h-11 w-full border-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              placeholder={`Search ${title.toLowerCase()}…`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query.trim() ? (
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-50"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="hide-scrollbar max-h-[60vh] overflow-auto px-5 py-5">
          <div className={`grid ${gridClass} gap-2`}>
            {filteredOptions.map((opt) => {
              const isSelected = draftSet.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={[
                    "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm shadow-sm transition",
                    isSelected
                      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "grid h-5 w-5 place-items-center rounded-md border text-[12px] font-bold",
                      isSelected
                        ? "border-emerald-400 bg-emerald-500 text-white"
                        : "border-slate-300 bg-white text-transparent",
                    ].join(" ")}
                  >
                    ✓
                  </span>
                  {opt.prefix ? <span className="flex-none">{opt.prefix}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {opt.suffix ? (
                    <span className="flex-none text-xs font-semibold text-slate-500">
                      {opt.suffix}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {filteredOptions.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No results.</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setDraft([])}
            disabled={draft.length === 0}
          >
            Clear selection
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-black"
              onClick={() => {
                onApply(draft);
                onClose();
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function toFlagEmoji(code: string) {
  const trimmed = (code ?? "").trim();
  if (!/^[a-z]{2}$/i.test(trimmed)) return "";
  const upper = trimmed.toUpperCase();
  return String.fromCodePoint(
    ...upper.split("").map((char) => 127397 + char.charCodeAt(0))
  );
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
        className="h-7 w-7 rounded-full bg-white object-contain shadow-sm ring-1 ring-slate-200"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
      {initial}
    </span>
  );
}

type NationalityCountries = {
  processable?: Array<{ code: string; name: string }>;
  blocked?: Array<{ code: string; name: string }>;
  mentioned?: Array<{ code: string; name: string }>;
};

const BENEFIT_TAG_LABELS: Record<string, string> = {
  meals: "Free Meals",
  accommodation: "Accommodation",
  travel_tickets: "Tickets / Travel",
  visa_support: "Visa Support",
  medical_exam: "Paid Medical",
  certification: "Certification",
  bonus_tips: "Bonus / Tips",
  contract_length: "Stable Contract",
  growth: "Career Growth",
  travel_opportunity: "Travel Opportunity",
};

function formatBenefitTag(tag: string) {
  const normalized = asString(tag).trim();
  if (!normalized) return "Unknown";
  return (
    BENEFIT_TAG_LABELS[normalized] ??
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

function BenefitTagDatapoints({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {tags.map((tag) => {
        const Icon = getBenefitTagIcon(tag);
        const label = formatBenefitTag(tag);
        return (
          <span key={tag} className="group/benefit relative inline-flex">
            <span
              aria-label={label}
              tabIndex={0}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-700 shadow-sm transition outline-none group-hover:border-sky-300 group-hover:bg-sky-50 group-focus-within/benefit:border-sky-300 group-focus-within/benefit:bg-sky-50"
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-lg transition duration-75 group-hover/benefit:opacity-100 group-focus-within/benefit:opacity-100"
            >
              {label}
              <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-slate-900" />
            </span>
          </span>
        );
      })}
    </div>
  );
}

function BenefitTagFeatureList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tags.map((tag) => {
        const Icon = getBenefitTagIcon(tag);
        const label = formatBenefitTag(tag);

        return (
          <div
            key={tag}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                You Get
              </div>
              <div className="truncate text-sm font-semibold text-slate-900">{label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CountryChips({ items }: { items: Array<{ code: string; name: string }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const code = asString(item.code).toUpperCase().trim();
        const name = asString(item.name).trim() || code;
        const flag = toFlagEmoji(code);
        return (
          <span
            key={`${code}:${name}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            title={name}
          >
            <span aria-hidden="true">{flag || "🏳️"}</span>
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

const JOBS_CACHE_KEY = "jobsboard:list:v1";
const JOBS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const JOBS_PAGE_SIZE = 24;

function readJobsCache(): JobsBoardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(JOBS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as
      | (Partial<JobsBoardCache> & { v?: number; priorityTypes?: unknown })
      | null;
    if (!parsed || typeof parsed.savedAt !== "number" || !Array.isArray(parsed.items)) return null;
    if (parsed.v === 2) {
      return {
        v: 2,
        savedAt: parsed.savedAt,
        etag: typeof parsed.etag === "string" ? parsed.etag : undefined,
        items: parsed.items as JobListItem[],
        priorityTypes: Array.isArray(parsed.priorityTypes)
          ? (parsed.priorityTypes as BreezyPriorityType[])
          : DEFAULT_BREEZY_PRIORITY_TYPES,
      };
    }
    if (parsed.v === 1) {
      return {
        v: 2,
        savedAt: parsed.savedAt,
        etag: typeof parsed.etag === "string" ? parsed.etag : undefined,
        items: parsed.items as JobListItem[],
        priorityTypes: DEFAULT_BREEZY_PRIORITY_TYPES,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeJobsCache(cache: JobsBoardCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(JOBS_CACHE_KEY, JSON.stringify(cache));
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
    const priorityKey = normalizeFilterKey(priority);
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
      __updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
      __search: ` ${search} countries:${countries.toLowerCase()} `,
    } satisfies JobListItemIndexed;
  });
}

export default function JobsBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const etagRef = useRef<string | null>(null);
  const jobsAbortRef = useRef<AbortController | null>(null);
  const detailsAbortRef = useRef<AbortController | null>(null);
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
  const [heroAssetsReady, setHeroAssetsReady] = useState(false);
  const [pageAssetsReady, setPageAssetsReady] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.readyState === "complete";
  });
  const [filter, setFilter] = useState("");
  const [companyFilters, setCompanyFilters] = useState<string[]>([]);
  const [departmentFilters, setDepartmentFilters] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState("");
  const [priorityTypes, setPriorityTypes] = useState<BreezyPriorityType[]>(
    DEFAULT_BREEZY_PRIORITY_TYPES
  );
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [searchSuggestOpen, setSearchSuggestOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState<number>(-1);
  const [searchCaretAtEnd, setSearchCaretAtEnd] = useState(true);
  const searchRootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const suppressNextSuggestOpenRef = useRef(false);

  const deferredFilter = useDeferredValue(filter);

  const urlSelectedId = useMemo(() => {
    const value = (searchParams?.get("job") ?? "").trim();
    return value ? value : null;
  }, [searchParams]);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const value = (searchParams?.get("job") ?? "").trim();
    return value ? value : null;
  });

  useEffect(() => {
    setSelectedId(urlSelectedId);
  }, [urlSelectedId]);

  const [detailsById, setDetailsById] = useState<Record<string, Record<string, unknown>>>({});
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const details = selectedId ? detailsById[selectedId] ?? null : null;
  const detailsLoading = selectedId ? detailsLoadingId === selectedId : false;
  const [shareCopied, setShareCopied] = useState(false);
  const [applyNavigating, setApplyNavigating] = useState(false);

  const [visibleCount, setVisibleCount] = useState(JOBS_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const anyModalOpen = Boolean(selectedId) || companyModalOpen || departmentModalOpen;

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

  const applyCachedJobs = useCallback((cache: JobsBoardCache) => {
    if (Date.now() - cache.savedAt > JOBS_CACHE_MAX_AGE_MS) return;
    etagRef.current = cache.etag ?? null;
    const indexed = indexJobs(cache.items);
    jobsRef.current = indexed;
    setJobs(indexed);
    setPriorityTypes(cache.priorityTypes);
    setLoading(false);
  }, []);

  const baseJobs = useMemo(() => {
    return jobs.filter((job) => job.__search.includes(" org:pool ") === false);
  }, [jobs]);

  const availablePriorityTypes = useMemo(() => priorityTypes, [priorityTypes]);

  const priorityLabelByKey = useMemo(() => {
    return new Map(
      availablePriorityTypes.map((item) => [normalizePriorityKey(item.key), item.label] as const)
    );
  }, [availablePriorityTypes]);

  const prioritySelection = useMemo(
    () => priorityFilters.map((value) => normalizePriorityKey(value)).filter(Boolean),
    [priorityFilters]
  );

  const hasPriorityFilter = prioritySelection.length > 0;

  const companyOptions = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const departmentSet = new Set(departmentFilters);
    const source =
      departmentSet.size > 0
        ? baseJobs.filter((job) => departmentSet.has(job.__departmentKey))
        : baseJobs;
    const narrowed = hasPriorityFilter
      ? source.filter((job) => prioritySelection.includes(job.__priorityKey))
      : source;
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
  }, [baseJobs, countryFilter, deferredFilter, departmentFilters, hasPriorityFilter, prioritySelection]);

  const departmentOptions = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const companySet = new Set(companyFilters);
    const source =
      companySet.size > 0
        ? baseJobs.filter((job) => companySet.has(job.__companyKey))
        : baseJobs;
    const narrowed = hasPriorityFilter
      ? source.filter((job) => prioritySelection.includes(job.__priorityKey))
      : source;
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
  }, [baseJobs, companyFilters, countryFilter, deferredFilter, hasPriorityFilter, prioritySelection]);

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
  }, [baseJobs, companyFilters, countryFilter, deferredFilter, departmentFilters]);

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
    const byQuery = !query
      ? narrowed
      : narrowed.filter((job) => job.__search.includes(query));
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
        else map.set(code, { code, label: countryLabelFromCode(code), count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [baseJobs, companyFilters, deferredFilter, departmentFilters, hasPriorityFilter, prioritySelection]);

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

  const filtered = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase();
    const companySet = new Set(companyFilters);
    const departmentSet = new Set(departmentFilters);
    const showFeaturedOnly =
      !hasPriorityFilter &&
      companySet.size === 0 &&
      departmentSet.size === 0 &&
      !countryFilter &&
      !query;

    const base = showFeaturedOnly ? baseJobs.filter((job) => job.__priorityKey.trim()) : baseJobs;
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
    const matches = !query
      ? byPriority
      : byPriority.filter((job) => {
          return job.__search.includes(query);
        });

    return [...matches].sort((a, b) => {
      if (b.__updatedAtMs !== a.__updatedAtMs) return b.__updatedAtMs - a.__updatedAtMs;
      return asString(a.name).localeCompare(asString(b.name), undefined, { sensitivity: "base" });
    });
  }, [
    baseJobs,
    companyFilters,
    countryFilter,
    deferredFilter,
    departmentFilters,
    hasPriorityFilter,
    prioritySelection,
  ]);

  const showingFeaturedOnly =
    !hasPriorityFilter &&
    companyFilters.length === 0 &&
    departmentFilters.length === 0 &&
    !countryFilter &&
    deferredFilter.trim().length === 0;

  const loadJobs = useCallback(async () => {
    jobsAbortRef.current?.abort();
    const controller = new AbortController();
    jobsAbortRef.current = controller;

    setError(null);
    const hasData = jobsRef.current.length > 0;
    setLoading(!hasData);
    try {
      const url = "/api/jobs";
      const headers: HeadersInit = {};
      if (etagRef.current) {
        headers["If-None-Match"] = etagRef.current;
      }
      const res = await fetch(url, { headers, signal: controller.signal });
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
      const indexed = indexJobs(list);
      setJobs(indexed);
      setPriorityTypes(nextPriorityTypes);

      const etag = res.headers.get("etag") ?? "";
      etagRef.current = etag.trim() ? etag.trim() : null;
      // Persist the raw list (smaller) and let the UI rebuild indices quickly on refresh.
      setTimeout(() => {
        writeJobsCache({
          v: 2,
          savedAt: Date.now(),
          etag: etagRef.current ?? undefined,
          items: list,
          priorityTypes: nextPriorityTypes,
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
      const res = await fetch(`/api/jobs/${encodeURIComponent(positionId)}`, { signal });
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

  const replaceSelectedIdInUrl = useCallback(
    (nextId: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (nextId) params.set("job", nextId);
      else params.delete("job");
      const qs = params.toString();
      router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
    },
    [router, searchParams]
  );

  const pushSelectedIdInUrl = useCallback(
    (nextId: string) => {
      const trimmed = nextId.trim();
      if (!trimmed) return;
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("job", trimmed);
      const qs = params.toString();
      router.push(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
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
    void loadJobs();
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
    setVisibleCount(JOBS_PAGE_SIZE);
  }, [companyFilters, departmentFilters, countryFilter, deferredFilter, priorityFilters]);

  const visibleJobs = useMemo(() => {
    return filtered.slice(0, Math.min(filtered.length, visibleCount));
  }, [filtered, visibleCount]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (visibleCount >= filtered.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleCount((current) => Math.min(filtered.length, current + JOBS_PAGE_SIZE));
      },
      { rootMargin: "700px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetails();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDetails, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      detailsAbortRef.current?.abort();
      setDetailsLoadingId(null);
      return;
    }
    const cachedDetails = detailsById[selectedId];
    if (
      cachedDetails &&
      typeof cachedDetails === "object" &&
      !Array.isArray(cachedDetails) &&
      "nationality_countries" in cachedDetails
    ) {
      return;
    }
    detailsAbortRef.current?.abort();
    const controller = new AbortController();
    detailsAbortRef.current = controller;
    void loadDetails(selectedId, controller.signal);
    return () => controller.abort();
  }, [detailsById, loadDetails, selectedId]);

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
        const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
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
      if (!Array.isArray(raw)) continue;
      const tags = raw.map((item) => asString(item).trim()).filter(Boolean);
      if (tags.length > 0) map.set(id, tags);
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
      companySet.size === 0 &&
      departmentSet.size === 0 &&
      !countryFilter &&
      !query;

    const base = showFeaturedOnly ? baseJobs.filter((job) => job.__priorityKey.trim()) : baseJobs;
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
    return byPriority;
  }, [
    baseJobs,
    companyFilters,
    countryFilter,
    deferredFilter,
    departmentFilters,
    hasPriorityFilter,
    prioritySelection,
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
      availablePriorityTypes.forEach((type, index) => {
        const key = normalizePriorityKey(type.key);
        const count = priorityCounts.get(key) ?? 0;
        if (count <= 0) return;
        add({
          id: `priority:${key}`,
          kind: "priority",
          label: type.label,
          prefix:
            index % 2 === 0 ? (
              <Flame className="h-4 w-4 text-orange-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-sky-600" />
            ),
          suffix: String(count),
          onSelect: () => {
            setPriorityFilters((prev) => (prev.includes(key) ? prev : [...prev, key]));
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
            setVisibleCount(JOBS_PAGE_SIZE);
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
          prefix: <UserRound className="h-4 w-4 text-amber-600" />,
          suffix: opt.count ? String(opt.count) : "",
          onSelect: () => {
            setDepartmentFilters((prev) => (prev.includes(opt.key) ? prev : [...prev, opt.key]));
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
            setVisibleCount(JOBS_PAGE_SIZE);
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
              <span className="text-base leading-none">{toFlagEmoji(opt.code)}</span>
              <MapPin className="h-4 w-4 text-emerald-600" />
            </span>
          ),
          suffix: opt.count ? String(opt.count) : "",
          onSelect: () => {
            setCountryFilter(opt.code);
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
            setVisibleCount(JOBS_PAGE_SIZE);
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
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Title
            </span>
          ),
	          onSelect: () => {
	            setFilter(title);
	            setSearchSuggestOpen(false);
	            setSearchActiveIndex(-1);
	            setVisibleCount(JOBS_PAGE_SIZE);
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
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Title
            </span>
          ),
          onSelect: () => {
            setFilter(title);
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
            setVisibleCount(JOBS_PAGE_SIZE);
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
            prefix: <UserRound className="h-4 w-4 text-amber-600" />,
            suffix: opt.count ? String(opt.count) : "",
            onSelect: () => {
              setDepartmentFilters((prev) => (prev.includes(opt.key) ? prev : [...prev, opt.key]));
              setFilter("");
              setSearchSuggestOpen(false);
              setSearchActiveIndex(-1);
              setVisibleCount(JOBS_PAGE_SIZE);
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
                <span className="text-base leading-none">{toFlagEmoji(opt.code)}</span>
                <MapPin className="h-4 w-4 text-emerald-600" />
              </span>
            ),
            suffix: opt.count ? String(opt.count) : "",
            onSelect: () => {
              setCountryFilter(opt.code);
              setFilter("");
              setSearchSuggestOpen(false);
              setSearchActiveIndex(-1);
              setVisibleCount(JOBS_PAGE_SIZE);
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
                className="h-6 w-6 rounded-full object-cover ring-1 ring-slate-200"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <Building2 className="h-4 w-4 text-slate-500" />
            ),
            suffix: opt.count ? String(opt.count) : "",
            onSelect: () => {
              setCompanyFilters((prev) => (prev.includes(opt.key) ? prev : [...prev, opt.key]));
              setFilter("");
              setSearchSuggestOpen(false);
              setSearchActiveIndex(-1);
              setVisibleCount(JOBS_PAGE_SIZE);
            },
          });
        });

      addPriority();
    }

    return suggestions.slice(0, 18);
  }, [
    availablePriorityTypes,
    companyOptions,
    countryOptions,
    departmentOptions,
    filter,
    priorityCounts,
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
      setVisibleCount(JOBS_PAGE_SIZE);
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
    [syncSearchCaret]
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
    priorityFilters.length > 0;

  const clearAllFilters = useCallback(() => {
    setFilter("");
    setCompanyFilters([]);
    setDepartmentFilters([]);
    setCountryFilter("");
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
        label: `Country: ${toFlagEmoji(countryFilter.toUpperCase())} ${countryFilterLabel}`,
        onRemove: () => setCountryFilter(""),
      });

    priorityFilters.forEach((key) => {
      const normalized = normalizePriorityKey(key);
      chips.push({
        id: `priority:${normalized}`,
        label: `Priority: ${getPriorityLabel(normalized, availablePriorityTypes)}`,
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
    availablePriorityTypes,
    priorityFilters,
  ]);

  const selectedSummary = useMemo(() => {
    if (!selectedId) return null;
    return jobs.find((job) => job.id === selectedId) ?? null;
  }, [jobs, selectedId]);

  const modalDescription = useMemo(() => {
    const raw = pickPositionDescription(details);
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
    return getPriorityLabel(priority, availablePriorityTypes);
  }, [availablePriorityTypes, details, selectedSummary]);

  const modalBenefitTags = useMemo(() => {
    if (!selectedId) return [];
    return benefitTagsById.get(selectedId) ?? [];
  }, [benefitTagsById, selectedId]);

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
    if (selectedId) url.searchParams.set("job", selectedId);
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
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-slate-50 px-3 pb-10 pt-28 text-slate-900 sm:px-5 lg:px-8">
      <StickyJobsHeader />
      <div className="mx-auto w-full max-w-[1280px]">
        <section
          className="relative overflow-hidden rounded-[36px] px-6 pb-16 pt-12 text-center shadow-[0_30px_80px_-55px_rgba(0,0,0,0.75)] sm:px-10 sm:pb-20 sm:pt-14"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#ff9f2f] via-[#58d0d8] to-[#3ea4e6]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_40%,rgba(255,255,255,0.30),transparent_56%)] opacity-95" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_20%,rgba(255,255,255,0.22),transparent_52%)] opacity-95" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_30%,rgba(0,0,0,0.18),transparent_58%)] opacity-90" />

          <div className="relative">
            <h1 className="text-balance text-4xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-6xl">
              Find Your Dream Jobs
            </h1>
	            <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-6 text-white/85 sm:text-base">
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
          className="relative z-10 mx-auto -mt-10 w-full max-w-[820px] rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)] sm:-mt-12 sm:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setVisibleCount(JOBS_PAGE_SIZE);
            setSearchSuggestOpen(false);
            setSearchActiveIndex(-1);
          }}
        >
          <div ref={searchRootRef} className="relative">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                <Search className="h-4 w-4" />
              </span>
              <div className="relative w-full">
                {inlineAutocomplete ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-10 w-full overflow-hidden whitespace-nowrap text-sm leading-10 text-slate-800"
                  >
                    <span className="text-transparent">{filter}</span>
                    <span className="text-slate-300">{inlineAutocomplete.tail}</span>
                  </div>
                ) : null}
                <input
                  ref={searchInputRef}
                  autoComplete="off"
                  className="relative h-10 w-full border-none bg-transparent text-sm leading-10 text-slate-800 outline-none placeholder:text-slate-400"
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
              <button
                type="submit"
                className="h-10 shrink-0 rounded-2xl bg-gradient-to-r from-[#2f7de1] to-[#64c8ff] px-7 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(47,125,225,0.7)] transition hover:from-[#256fd2] hover:to-[#55bbff]"
              >
                Search
              </button>
            </div>

            {searchSuggestOpen && searchSuggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="hide-scrollbar max-h-72 overflow-auto p-1">
	                  {searchSuggestions.map((item, idx) => {
	                    const active = idx === searchActiveIndex;
	                    return (
	                      <button
	                        key={item.id}
	                        type="button"
	                        className={[
	                          "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm",
	                          active
	                            ? "bg-emerald-50 text-emerald-950"
	                            : "text-slate-700 hover:bg-slate-50",
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
	                          <span className="flex-none text-xs font-semibold text-slate-500">
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
                  <button
                    type="button"
                    className="grid h-6 w-6 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                    aria-label={`Remove filter: ${chip.label}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      chip.onRemove();
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

			          <div className="mt-3 xl:hidden">
			            <div className="rounded-2xl border border-slate-200 bg-white p-3">
		              <div className="grid gap-4">
                    <MultiSelectTrigger
                      label="Company"
                      valueLabel={companyValueLabel}
                      onClick={() => setCompanyModalOpen(true)}
                    />
                    <MultiSelectTrigger
                      label="Department"
                      valueLabel={departmentValueLabel}
                      onClick={() => setDepartmentModalOpen(true)}
                    />
                    <FilterDropdown
                      label="Country"
                      value={countryFilter}
                      placeholder="All countries"
                      onChange={setCountryFilter}
                      options={[
                        { value: "", label: "All countries" },
                        ...countryOptions.map((opt) => ({
                          value: opt.code,
                          label: opt.label,
                          prefix: toFlagEmoji(opt.code),
                          suffix: opt.count ? String(opt.count) : "",
                        })),
                      ]}
                    />
	              </div>

		              <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
		                Priority
		              </div>
	              <div className="mt-2 grid gap-2">
                {availablePriorityTypes.map((type) => {
                  const key = normalizePriorityKey(type.key);
                  const count = priorityCounts.get(key) ?? 0;
                  const checked = priorityFilters.includes(key);
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
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
                        <span className={count === 0 ? "text-slate-400" : ""}>{type.label}</span>
                      </span>
                      <span className={count === 0 ? "text-slate-400" : "text-slate-500"}>
                        {count}
                      </span>
                    </label>
                  );
                })}

                {priorityFilters.length > 0 ? (
                  <button
                    type="button"
                    className="mt-1 w-full rounded-xl px-2 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => setPriorityFilters([])}
                  >
                    Clear priority
	                  </button>
	                ) : null}
	              </div>

	                <div className="mt-4 overflow-hidden rounded-2xl bg-white">
	                  <div className="relative h-[396px] w-full bg-white">
	                    <Image
	                      src={jobBanner}
	                      alt="Job banner"
	                      fill
	                      sizes="(max-width: 1279px) 100vw, 280px"
	                      className="object-contain object-bottom"
	                      priority={false}
	                    />
	                  </div>
	                </div>
	            </div>
	          </div>
	        </form>

		        <div className="mt-8 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
				          <aside className="sticky top-6 hidden xl:block self-start">
					            <div className="hide-scrollbar max-h-[calc(100vh-3rem)] overflow-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Filter</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {filtered.length.toLocaleString()}{" "}
                    {filtered.length === 1 ? "job" : "jobs"}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <MultiSelectTrigger
                  label="Company"
                  valueLabel={companyValueLabel}
                  onClick={() => setCompanyModalOpen(true)}
                />
                <MultiSelectTrigger
                  label="Department"
                  valueLabel={departmentValueLabel}
                  onClick={() => setDepartmentModalOpen(true)}
                />
                <FilterDropdown
                  label="Country"
                  value={countryFilter}
                  placeholder="All countries"
                  onChange={setCountryFilter}
                  options={[
                    { value: "", label: "All countries" },
                    ...countryOptions.map((opt) => ({
                      value: opt.code,
                      label: opt.label,
                      prefix: toFlagEmoji(opt.code),
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
                    label: opt.label,
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
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Priority
                </div>
                <div className="mt-2 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                  {availablePriorityTypes.map((type) => {
                    const key = normalizePriorityKey(type.key);
                    const count = priorityCounts.get(key) ?? 0;
                    const checked = priorityFilters.includes(key);
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
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
                          <span className={count === 0 ? "text-slate-400" : ""}>
                            {type.label}
                          </span>
                        </span>
                        <span className={count === 0 ? "text-slate-400" : "text-slate-500"}>
                          {count}
                        </span>
                      </label>
                    );
                  })}

                  {priorityFilters.length > 0 ? (
                    <button
                      type="button"
                      className="mt-1 w-full rounded-xl px-2 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      onClick={() => setPriorityFilters([])}
                    >
                      Clear
                    </button>
	                  ) : null}
		                </div>
		              </div>

                  <div className="mt-5 overflow-hidden rounded-2xl bg-white">
                    <div className="relative h-[360px] w-full bg-white">
                      <Image
                        src={jobBanner}
                        alt="Job banner"
                        fill
                        sizes="280px"
                        className="object-contain object-bottom"
                        priority={false}
                      />
                    </div>
                  </div>
		            </div>
		          </aside>

	          <main className="min-w-0">
            <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {filtered.length.toLocaleString()}
                  </span>{" "}
                  jobs
                </div>
                {hasAnyFilter ? (
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 xl:hidden"
                    onClick={clearAllFilters}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>

              {error ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-5 space-y-4">
                {loading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    Loading positions…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    {showingFeaturedOnly
                      ? "No featured (priority) positions yet. Use filters to browse all jobs."
                      : "No positions found."}
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
	                    const priorityLabel = getPriorityLabel(priority, availablePriorityTypes);
	                    const locationBadgeLabel = "WORLDWIDE";

	                    return (
                      <div
                        key={job.id || `${job.name}-${index}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        className={[
                          "group flex w-full cursor-pointer items-start justify-between gap-4 rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/25",
                          isSelected
                            ? "border-emerald-200 ring-inset ring-2 ring-emerald-500/20"
                            : "border-slate-200 hover:border-emerald-200",
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
	                        <div className="flex min-w-0 items-start gap-4">
		                          <div className="mt-0.5 grid h-[calc(var(--spacing)*21)] w-[calc(var(--spacing)*21)] shrink-0 place-items-center overflow-hidden rounded-full bg-white text-sm font-bold text-slate-600 ring-1 ring-slate-200">
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

                          <div className="min-w-0">
	                            <div className="flex min-w-0 flex-wrap items-center gap-2">
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
		                              <div className="min-w-0 flex-1 break-words text-[18px] font-extrabold leading-snug text-slate-900">
		                                {job.name || "Position"}
		                              </div>
		                            </div>
                            <BenefitTagDatapoints tags={benefitTags} />
			                            <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
			                              {department ? (
			                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-gradient-to-r from-amber-100 to-[#ffc45c]/70 px-2.5 py-1.5 text-amber-950 shadow-sm shadow-amber-200/40">
			                                  <UserRound className="h-3.5 w-3.5 text-amber-600" />
		                                  <span className="max-w-[260px] truncate whitespace-nowrap">
		                                    {department}
		                                  </span>
		                                </span>
		                              ) : null}
		                              {locationBadgeLabel ? (
		                                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-gradient-to-r from-cyan-100 to-sky-100 px-2.5 py-1.5 text-cyan-950 shadow-sm shadow-cyan-200/40">
		                                  <MapPin className="h-3.5 w-3.5 text-cyan-600" />
		                                  <span className="max-w-[320px] truncate whitespace-nowrap">
		                                    {locationBadgeLabel}
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

              {!loading && filtered.length > 0 ? (
                <div className="mt-5 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <div>
                    Showing{" "}
                    <span className="font-semibold text-slate-700">
                      {Math.min(filtered.length, visibleCount)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-slate-700">{filtered.length}</span>
                  </div>
                  {visibleCount < filtered.length ? (
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                      onClick={() =>
                        setVisibleCount((current) =>
                          Math.min(filtered.length, current + JOBS_PAGE_SIZE)
                        )
                      }
                    >
                      Load more
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div ref={sentinelRef} className="h-1" aria-hidden="true" />
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
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur hover:bg-white"
                onClick={handleCopyShareLink}
              >
                {shareCopied ? "Link copied" : "Copy link"}
              </button>
              <button
                type="button"
                aria-label="Close"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm hover:bg-black focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-transparent"
                onClick={closeDetails}
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
                      const company = details
                        ? asString(isRecord(details) ? details["company"] : undefined).trim() ||
                          extractCompany(details)
                        : asString(selectedSummary?.company).trim();
                      const companyLogo =
                        details && isRecord(details)
                          ? asString(details["company_logo_url"]).trim()
                          : asString(selectedSummary?.company_logo_url).trim();
                      return (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          {company ? (
                            <span className="inline-flex items-center gap-2 pr-2">
                              {companyLogo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={companyLogo}
                                  alt={company}
                                  className="h-8 w-8 flex-none rounded-full bg-white object-cover shadow-sm ring-1 ring-slate-200"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <Building2 className="h-5 w-5 text-slate-500" />
                              )}
                              <span className="max-w-[340px] whitespace-nowrap text-sm font-semibold text-slate-800 truncate">
                                {company}
                              </span>
                              {modalPriorityLabel ? (
                                <span
                                  className={[
                                    "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm",
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
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                  <div
                    id="job-details-title"
                    className="mt-2 text-xl font-extrabold leading-tight text-slate-900 break-words sm:text-2xl"
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
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      Position
                    </span>
                    {(() => {
                      const department = details
                        ? asString(isRecord(details) ? details["department"] : undefined).trim() ||
                          extractDepartment(details)
                        : asString(selectedSummary?.department).trim();
                      const location = "WORLDWIDE";
                      const metaBadges = [
                        department ? { key: "department", label: department } : null,
                        { key: "location", label: location },
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
                                  : "border-cyan-200 bg-gradient-to-r from-cyan-100 to-sky-100 text-cyan-950 shadow-cyan-200/40",
                              ].join(" ")}
                            >
                              {badge.key === "department" ? (
                                <UserRound className="h-3.5 w-3.5 text-amber-600" />
                              ) : (
                                <MapPin className="h-3.5 w-3.5 text-cyan-600" />
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
                  <button
                    type="button"
                    className="inline-flex h-16 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2f7de1] to-[#64c8ff] px-10 text-base font-semibold text-white shadow-xl shadow-sky-200/70 ring-1 ring-white/20 hover:from-[#256fd2] hover:to-[#55bbff] focus:outline-none focus:ring-2 focus:ring-sky-300/60 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-70 sm:justify-self-end"
                    disabled={applyNavigating}
                    onClick={() => {
                      if (typeof window === "undefined") return;
                      if (applyNavigating) return;
                      setApplyNavigating(true);
                      window.location.assign("https://www.ismira.lt/apply");
                    }}
                  >
                    {applyNavigating ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
                    ) : (
                      <>
                        <Send className="h-5 w-5" aria-hidden="true" />
                        <span>Apply Now</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="inline-flex h-16 items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-8 text-sm font-semibold text-amber-900 shadow-sm sm:justify-self-end">
                    Not active
                  </div>
                )}
              </div>
            </div>
          }
        >
          {modalIsHidden ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              This ad is not active.
            </div>
          ) : detailsLoading || (!details && !error) ? (
            <JobDetailsSkeleton />
          ) : !details ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              No details returned.
            </div>
          ) : (
            <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5">
              {modalBenefitTags.length > 0 ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Company Benefits
                  </div>
                  <div className="mt-3">
                    <BenefitTagFeatureList tags={modalBenefitTags} />
                  </div>
                </div>
              ) : null}

              {(() => {
                const raw = (details as Record<string, unknown>)?.nationality_countries;
                if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
                const countries = raw as NationalityCountries;
                const processable = Array.isArray(countries.processable)
                  ? countries.processable
                      .filter((item) => item && typeof item === "object")
                      .map((item) => ({
                        code: asString((item as { code?: unknown }).code),
                        name: asString((item as { name?: unknown }).name),
                      }))
                      .filter((item) => item.code.trim())
                  : [];
                const blocked = Array.isArray(countries.blocked)
                  ? countries.blocked
                      .filter((item) => item && typeof item === "object")
                      .map((item) => ({
                        code: asString((item as { code?: unknown }).code),
                        name: asString((item as { name?: unknown }).name),
                      }))
                      .filter((item) => item.code.trim())
                  : [];

                if (processable.length === 0 && blocked.length === 0) return null;

                return (
                  <div className="space-y-4">
                    {processable.length > 0 ? (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Nationalities we process
                        </div>
                        <div className="mt-2">
                          <CountryChips items={processable} />
                        </div>
                      </div>
                    ) : null}

                    {blocked.length > 0 ? (
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Nationalities we can’t process
                        </div>
                        <div className="mt-2">
                          <CountryChips items={blocked} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Description
                </div>
                <div className="mt-4 overflow-hidden rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)]">
                  {modalDescription.bodyHtml ? (
                    <RichText content={modalDescription.bodyHtml} />
                  ) : (
                    <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-800">
                      {modalDescription.bodyText || "—"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DetailsModalShell>
      ) : null}
    </div>
  );
}
