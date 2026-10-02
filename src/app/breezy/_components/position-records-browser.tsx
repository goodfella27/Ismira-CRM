"use client";
import tableStyles from "./positions-crm-table.module.css";
import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { OpeningTypeOrderControls } from "@/components/opening-type-order-controls";
import { getPriorityTooltip, getPriorityWebsiteTitle } from "@/lib/breezy-priority-types";
import { getOpeningTypeColor, getPriorityBadgeClass } from "@/lib/opening-type-colors";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Select } from "radix-ui";
import {
  AlertCircle,
  BadgeDollarSign,
  BedDouble,
  Building2,
  CalendarDays,
  Copy,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronsUp,
  Check,
  CheckCircle2,
  CircleOff,
  Coins,
  Compass,
  FileText,
  Gift,
  GraduationCap,
  Globe2,
  HeartPulse,
  House,
  HandCoins,
  Layers,
  LockKeyhole,
  MapPin,
  FolderKanban,
  PencilLine,
  MoreHorizontal,
  NotebookText,
  Eye,
  EyeOff,
  Plane,
  Plus,
  Shield,
  StickyNote,
  TrendingUp,
  Trash2,
  UtensilsCrossed,
  Upload,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";

import DetailsModalShell from "@/components/details-modal-shell";
import { JobPremiumDetailsPanel } from "@/components/job-premium-details-panel";
import dynamic from "next/dynamic";
const WysiwygEditor = dynamic(() => import("@/components/wysiwyg-editor"), { loading: () => <div className="h-48 animate-pulse rounded-md bg-muted" aria-label="Loading editor" /> });
import { loadBreezyCompanyId, saveBreezyCompanyId } from "@/lib/breezy-storage";
import { extractCompany, extractDepartment } from "@/lib/breezy-position-fields";
import { getCountryLabel, getCountryEditorOptions } from "@/lib/country";
import { useWorkspaceRequests } from "@/components/workspace-data-provider";
import { PositionDetailsSkeleton } from "@/components/position-details-skeleton";
import { PositionsPageSkeleton } from "@/components/positions-page-skeleton";
import { CountryFlag } from "@/components/country-flag";
import { pickPositionDescription } from "@/lib/breezy-position-description";
import {
  BENEFIT_TAG_LABELS,
  REQUIRED_BENEFIT_TAGS,
  withRequiredBenefitTags,
  type BenefitTag,
} from "@/lib/job-benefits";
import {
  DEFAULT_JOB_BENEFIT_OPTIONS,
  normalizeBenefitOptions,
  type JobBenefitOption,
} from "@/lib/job-benefit-options";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  getPriorityLabel,
  humanizePriorityKey,
  normalizePriorityKey,
  type BreezyPriorityType,
} from "@/lib/breezy-priority-types";
import {
  DEFAULT_JOB_COUNTRY_OPTIONS,
  normalizeCountryOptions,
  type JobCountryOption,
} from "@/lib/job-country-options";
import {
  EMPTY_JOB_PREMIUM_DETAILS,
  hasJobPremiumDetails,
  normalizeJobPremiumDetails,
  type JobPremiumDetails,
} from "@/lib/job-premium-details";
import { composeDescriptionWithHeroImage } from "@/lib/job-description-hero-image";
import { subscribeJobCompanyLogosChanged } from "@/lib/job-company-logo-events";

function HeroCoverImage({ src, bottomActions }: { src: string; bottomActions?: ReactNode }) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const actions = bottomActions ? (
    <div className="absolute bottom-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2">
      {bottomActions}
    </div>
  ) : null;

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
      <div className="relative aspect-[16/7] w-full bg-muted">
        {actions}
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden bg-muted"
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
      {actions}
    </div>
  );
}

const DEFAULT_ISMIRA_WEB_TITLE = "UPCOMING INTERVIEWS WITH CRUISE EMPLOYERS";

function ModalCloseButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <UiButton variant="primary" size="md"
      type="button"
      aria-label="Close"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center transition disabled:opacity-60"
      onClick={onClick}
      disabled={disabled}
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </UiButton>
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
  show_on_ismira_web?: boolean;
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
    openingType?: string | null;
    benefitTags?: string[];
    countryCodes?: string[];
  }>;
  benefitOptions?: unknown;
};

type JobCompanyPickerOption = {
  id?: string;
  name: string;
  logoUrl: string;
  openingType: string;
  count: number;
  benefitTags: BenefitTag[];
  countryCodes: string[];
};

const DEFAULT_PROCESSABLE_COUNTRIES = DEFAULT_JOB_COUNTRY_OPTIONS;
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

function renderCountryFlag(code: string) {
  return <CountryFlag code={code} />;
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
    default:
      return FileText;
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

function normalizeBenefitTagList(payload: unknown): BenefitTag[] {
  if (!Array.isArray(payload)) return withRequiredBenefitTags([]);
  const seen = new Set<string>();
  const list: BenefitTag[] = [];
  for (const item of payload) {
    const tag =
      typeof item === "string"
        ? item
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 80)
        : "";
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    list.push(tag as BenefitTag);
  }
  return withRequiredBenefitTags(list);
}

function normalizeCountryCodeList(payload: unknown): string[] {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of payload) {
    const code =
      typeof item === "string"
        ? item.trim().toUpperCase()
        : isRecord(item) && typeof item.code === "string"
          ? item.code.trim().toUpperCase()
          : "";
    if (!/^[A-Z]{2}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    list.push(code);
  }
  return list;
}

function extractBenefitTagsFromDetails(details: BreezyPositionDetails | null) {
  return normalizeBenefitTagList(isRecord(details) ? details.benefit_tags : null);
}

function extractProcessableCountryCodesFromDetails(details: BreezyPositionDetails | null) {
  if (!isRecord(details)) return [];
  const direct = normalizeCountryCodeList(details.processable_country_codes);
  if (direct.length > 0) return direct;
  const countries = isRecord(details.nationality_countries)
    ? details.nationality_countries
    : null;
  return normalizeCountryCodeList(countries?.processable);
}

function CountryChips({ countries }: { countries: JobCountryOption[] }) {
  if (countries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {countries.map((country) => (
        <span
          key={country.code}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground"
        >
          <span aria-hidden="true">{renderCountryFlag(country.code)}</span>
          <span>{getCountryLabel(country.code, country.name)}</span>
        </span>
      ))}
    </div>
  );
}

function BenefitChips({
  tags,
  options,
}: {
  tags: BenefitTag[];
  options: JobBenefitOption[];
}) {
  if (tags.length === 0) return null;

  const labels = new Map(options.map((option) => [option.tag, option.label]));

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const Icon = getBenefitIcon(tag);
        const label =
          labels.get(tag) ||
          BENEFIT_TAG_LABELS[tag] ||
          tag
            .split("_")
            .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
            .join(" ");

        return (
          <span
            key={tag}
            className="inline-flex items-center gap-2 rounded-full border border-input bg-accent px-3 py-1.5 text-xs font-semibold text-foreground"
          >
            <Icon className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
            <span>{label}</span>
          </span>
        );
      })}
    </div>
  );
}

type PremiumSelectOption = {
  value: string;
  label: string;
  Icon: LucideIcon;
};

const EMPTY_PREMIUM_SELECT_VALUE = "__none__";

const POSITION_COMPENSATION_OPTIONS: PremiumSelectOption[] = [
  { value: EMPTY_PREMIUM_SELECT_VALUE, label: "Select type", Icon: CircleOff },
  { value: "tipping", label: "Tipping position", Icon: HandCoins },
  { value: "non_tipping", label: "Non-tipping position", Icon: BadgeDollarSign },
];

const STRIPE_OPTIONS: PremiumSelectOption[] = [
  { value: EMPTY_PREMIUM_SELECT_VALUE, label: "Select stripes", Icon: CircleOff },
  { value: "1", label: "1 stripe", Icon: ChevronsUp },
  { value: "1.5", label: "1.5 stripes", Icon: ChevronsUp },
  { value: "2", label: "2 stripes", Icon: ChevronsUp },
];

const CABIN_OPTIONS: PremiumSelectOption[] = [
  { value: EMPTY_PREMIUM_SELECT_VALUE, label: "Select cabin", Icon: CircleOff },
  { value: "single", label: "Single cabin", Icon: BedDouble },
  { value: "shared", label: "Shared cabin", Icon: UsersRound },
];

function PremiumSelectField({
  label,
  LabelIcon,
  value,
  options,
  onValueChange,
  disabled,
}: {
  label: string;
  LabelIcon: LucideIcon;
  value: string;
  options: PremiumSelectOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  const selectedValue = value || EMPTY_PREMIUM_SELECT_VALUE;
  const selectedOption =
    options.find((option) => option.value === selectedValue) ?? options[0];
  const SelectedIcon = selectedOption.Icon;

  return (
    <div className="grid content-start gap-1.5">
      <div
        id={labelId}
        className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
      >
        <LabelIcon className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
        {label}
      </div>
      <Select.Root
        value={selectedValue}
        disabled={disabled}
        onValueChange={(nextValue) =>
          onValueChange(nextValue === EMPTY_PREMIUM_SELECT_VALUE ? "" : nextValue)
        }
      >
        <Select.Trigger
          aria-labelledby={labelId}
          className="group inline-flex h-11 w-full items-center justify-between gap-3 rounded-md border border-warning/25 bg-card px-3 text-sm font-semibold text-foreground outline-none transition hover:border-warning/25 focus:border-warning/25 focus:ring-2 focus:ring-warning/25 data-[state=open]:border-warning/25 data-[state=open]:ring-2 data-[state=open]:ring-warning/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <SelectedIcon className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="truncate">{selectedOption.label}</span>
          </span>
          <Select.Icon asChild>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={6}
            className="z-[12000] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-card p-1.5 shadow-xl shadow-slate-950/15"
          >
            <Select.Viewport>
              {options.map((option) => {
                const OptionIcon = option.Icon;
                return (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    className="relative flex h-10 cursor-default select-none items-center gap-2.5 rounded-lg px-3 pr-9 text-sm font-medium text-foreground outline-none transition data-[disabled]:pointer-events-none data-[highlighted]:bg-warning-muted data-[highlighted]:text-foreground data-[state=checked]:bg-muted data-[state=checked]:text-foreground"
                  >
                    <OptionIcon className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator className="absolute right-3 inline-flex items-center text-pink-500">
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </Select.ItemIndicator>
                  </Select.Item>
                );
              })}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

function PremiumDetailsFields({
  value,
  onChange,
  disabled,
}: {
  value: JobPremiumDetails;
  onChange: (next: JobPremiumDetails) => void;
  disabled?: boolean;
}) {
  const hasSalary = Boolean(value.salaryText.trim());
  const hasSalaryNote = Boolean(value.salaryNote.trim());
  const salaryNoteIsMissing = hasSalary && !hasSalaryNote;

  return (
    <div className="overflow-hidden rounded-panel border border-border bg-card">
      <div className="relative isolate flex flex-wrap items-center justify-between gap-3 overflow-hidden bg-muted px-4 py-4 text-foreground">
        <div
          className="pointer-events-none absolute -right-8 -top-20 -z-10 h-40 w-40 rounded-full bg-card/25 blur-3xl"
          aria-hidden="true"
        />
        <div>
          <div className="text-xs font-bold uppercase tracking-wide">
            Premium details
          </div>
          <div className="mt-1 text-xs text-foreground/75">
            Admin, Member Premium and Member Basic users can view these values.
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/50 bg-card/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground backdrop-blur-sm">
          <LockKeyhole className="h-3 w-3" aria-hidden="true" />
          Protected
        </span>
      </div>
      <div className="grid gap-4 p-4">
        {salaryNoteIsMissing ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-danger-muted px-3 py-2 text-xs font-semibold text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Salary note is required because Salary has a value. Add the payment context before saving.
            </span>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid content-start gap-1.5 text-xs font-semibold text-foreground">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5">
                <BadgeDollarSign className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                Salary
              </span>
              {hasSalary ? (
                <span className="rounded-full bg-warning-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                  Requires salary note
                </span>
              ) : null}
            </span>
            <UiInput
              value={value.salaryText}
              disabled={disabled}
              maxLength={500}
              onChange={(event) => onChange({ ...value, salaryText: event.target.value })}
              className="h-11 transition disabled:opacity-60"
              placeholder="Example: €2,500 per month + gratuities or sales commission"
            />
          </label>
          <label className="grid content-start gap-1.5 text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              Gratuities / bonuses / commissions
            </span>
            <UiInput
              value={value.tipsText}
              disabled={disabled}
              maxLength={500}
              onChange={(event) => onChange({ ...value, tipsText: event.target.value })}
              className="h-11 transition disabled:opacity-60"
              placeholder="Example: Typical monthly gratuities €600+"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PremiumSelectField
          label="Position compensation"
          LabelIcon={HandCoins}
          value={value.positionCompensationType}
          options={POSITION_COMPENSATION_OPTIONS}
          disabled={disabled}
          onValueChange={(positionCompensationType) =>
            onChange({
              ...value,
              positionCompensationType:
                positionCompensationType as JobPremiumDetails["positionCompensationType"],
            })
          }
        />
        <label className="grid content-start gap-1.5 text-xs font-semibold text-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-pink-500" aria-hidden="true" />
            Contract length
          </span>
          <UiInput
            value={value.contractLength}
            disabled={disabled}
            maxLength={200}
            onChange={(event) => onChange({ ...value, contractLength: event.target.value })}
            className="h-11 transition disabled:opacity-60"
            placeholder="Example: 6 months"
          />
        </label>
        <PremiumSelectField
          label="Stripes"
          LabelIcon={ChevronsUp}
          value={value.stripes}
          options={STRIPE_OPTIONS}
          disabled={disabled}
          onValueChange={(stripes) =>
            onChange({ ...value, stripes: stripes as JobPremiumDetails["stripes"] })
          }
        />
        </div>
        <div className="grid items-start gap-3 sm:grid-cols-2">
        <PremiumSelectField
          label="Cabin"
          LabelIcon={BedDouble}
          value={value.cabinType}
          options={CABIN_OPTIONS}
          disabled={disabled}
          onValueChange={(cabinType) =>
            onChange({ ...value, cabinType: cabinType as JobPremiumDetails["cabinType"] })
          }
        />
        <label className="grid content-start gap-1.5 text-xs font-semibold text-foreground">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5 text-pink-500" aria-hidden="true" />
              Salary note
            </span>
            {hasSalary ? (
              <span className="rounded-full bg-danger-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
                Required
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Optional
              </span>
            )}
          </span>
          <input
            value={value.salaryNote}
            disabled={disabled}
            required={hasSalary}
            aria-invalid={salaryNoteIsMissing}
            maxLength={500}
            onChange={(event) => onChange({ ...value, salaryNote: event.target.value })}
            className={`h-11 rounded-md border bg-card px-3 text-sm text-foreground outline-none transition disabled:opacity-60 ${
              salaryNoteIsMissing
                ? "border-destructive/25 bg-danger-muted hover:border-destructive/25 focus:border-destructive/25 focus:ring-2 focus:ring-destructive/25"
                : "border-warning/25 hover:border-warning/25 focus:border-warning/25 focus:ring-2 focus:ring-warning/25"
            }`}
            placeholder="Paid while on board"
          />
          <span
            className={`inline-flex items-start gap-1.5 font-normal ${
              salaryNoteIsMissing
                ? "text-destructive"
                : hasSalary
                  ? "text-success"
                  : "text-muted-foreground"
            }`}
          >
            {salaryNoteIsMissing ? (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : hasSalary ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : null}
            <span>
              {salaryNoteIsMissing
                ? "Required now: explain when or how this salary is paid."
                : hasSalary
                  ? "Requirement complete."
                  : "Optional unless Salary is filled."}
            </span>
          </span>
        </label>
        </div>
        <label className="grid content-start gap-1.5 text-xs font-semibold text-foreground">
        <span className="flex items-center gap-1.5">
          <NotebookText className="h-3.5 w-3.5 text-pink-500" aria-hidden="true" />
          Additional premium information
        </span>
        <UiTextarea
          value={value.additionalInfo}
          disabled={disabled}
          maxLength={5000}
          onChange={(event) => onChange({ ...value, additionalInfo: event.target.value })}
          className="min-h-[110px] leading-6 transition disabled:opacity-60"
          placeholder="Add contract, rotation, bonus or other information reserved for members."
        />
        </label>
      </div>
    </div>
  );
}

function PremiumDetailsPreview({ details }: { details: JobPremiumDetails }) {
  if (!hasJobPremiumDetails(details)) return null;
  return <JobPremiumDetailsPanel details={details} />;
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
  if (direct) return direct;
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
          "text-[15px] leading-7 text-foreground",
          "[&>*:first-child]:mt-0",
          "[&_p]:mt-3",
          "[&_h1]:mb-2 [&_h1]:mt-6 [&_h1]:border-l-4 [&_h1]:border-input [&_h1]:pl-4 [&_h1]:text-lg [&_h1]:font-extrabold [&_h1]:uppercase [&_h1]:tracking-normal [&_h1]:text-foreground",
          "xl:[&_h1]:mb-3 xl:[&_h1]:mt-8 xl:[&_h1]:text-[1.1rem]",
          "[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:border-l-4 [&_h2]:border-input [&_h2]:pl-4 [&_h2]:text-base [&_h2]:font-extrabold [&_h2]:uppercase [&_h2]:tracking-normal [&_h2]:text-foreground",
          "xl:[&_h2]:mb-3 xl:[&_h2]:mt-8 xl:[&_h2]:text-[1.05rem]",
          "[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:border-l-4 [&_h3]:border-input [&_h3]:pl-4 [&_h3]:text-base [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-normal [&_h3]:text-foreground",
          "[&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-normal [&_h4]:text-muted-foreground",
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
  const requestCache = useWorkspaceRequests();
  const cachedFetch = requestCache.request;
  // Don't read localStorage during the initial render; it causes hydration mismatches.
  const [companyId, setCompanyId] = useState("");
  const [filter, setFilter] = useState("");
  const [serverFilter, setServerFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [positionsTotal, setPositionsTotal] = useState<number | null>(null);
  const [positionsNextOffset, setPositionsNextOffset] = useState<number | null>(null);
  const [loadingMorePositions, setLoadingMorePositions] = useState(false);
  const detailsRequestRef = useRef(0);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [loadMoreInView, setLoadMoreInView] = useState(false);
  const positionsQueryKeyRef = useRef<string>("");
  const [jobCompanies, setJobCompanies] = useState<
    Array<{
      id?: string;
      name: string;
      logoUrl: string;
      openingType: string;
      benefitTags: BenefitTag[];
      countryCodes: string[];
    }>
  >([]);
  const [benefitOptions, setBenefitOptions] = useState<JobBenefitOption[]>(
    DEFAULT_JOB_BENEFIT_OPTIONS
  );
  const [jobCompanyFilter, setJobCompanyFilter] = useState("");
  const [openingTypeFilter, setOpeningTypeFilter] = useState("");
  const [externalFilter, setExternalFilter] = useState<"" | "ismira-web" | "none">("");
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [companyCounts, setCompanyCounts] = useState<Array<{ name: string; count: number }>>([]);
  const [companyCountsLoading, setCompanyCountsLoading] = useState(false);
  const [priorityCounts, setPriorityCounts] = useState<Array<{ key: string; count: number }>>([]);
  const [priorityCountsLoading, setPriorityCountsLoading] = useState(false);
  const [priorityCountsRefreshKey, setPriorityCountsRefreshKey] = useState(0);
  const [processableCountries, setProcessableCountries] = useState<JobCountryOption[]>(
    DEFAULT_PROCESSABLE_COUNTRIES
  );
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
  const [premiumDetails, setPremiumDetails] = useState<JobPremiumDetails>(
    EMPTY_JOB_PREMIUM_DETAILS
  );
  const [detailsOverrides, setDetailsOverrides] = useState<Record<string, unknown>>(
    {}
  );
  const [detailsCompanyNames, setDetailsCompanyNames] = useState<string[]>([]);
  const [detailsCompanyOpeningType, setDetailsCompanyOpeningType] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [createOpeningOpen, setCreateOpeningOpen] = useState(false);
  const [createOpeningSaving, setCreateOpeningSaving] = useState(false);
  const [createOpeningError, setCreateOpeningError] = useState<string | null>(null);
  const [createOpeningUploadingHero, setCreateOpeningUploadingHero] = useState(false);
  const [editUploadingHero, setEditUploadingHero] = useState(false);
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
    benefit_tags: withRequiredBenefitTags([]),
    processable_country_codes: DEFAULT_PROCESSABLE_COUNTRY_CODES,
    summary: "",
    description: "",
    responsibilities: "",
    requirements: "",
    hidden: false,
    hero_image_url: "",
  }));
  const [createPremiumDetails, setCreatePremiumDetails] = useState<JobPremiumDetails>(
    EMPTY_JOB_PREMIUM_DETAILS
  );
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
  const [priorityTypesModalOpen, setPriorityTypesModalOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [openingTypePickerOpen, setOpeningTypePickerOpen] = useState(false);
  const [ismiraWebPickerOpen, setIsmiraWebPickerOpen] = useState(false);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [managedDepartments, setManagedDepartments] = useState<JobDepartmentOption[]>([]);
  const [tooltipDrafts, setTooltipDrafts] = useState<Record<string, string>>({});
  const [websiteTitleDrafts, setWebsiteTitleDrafts] = useState<Record<string, string>>({});
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
    benefit_tags: withRequiredBenefitTags([]),
    processable_country_codes: [] as string[],
    summary: "",
    description: "",
    responsibilities: "",
    requirements: "",
    hero_image_url: "",
    show_on_ismira_web: false,
    ismira_web_title: DEFAULT_ISMIRA_WEB_TITLE,
  });
  const processableCountryCodes = useMemo(
    () => processableCountries.map((country) => country.code),
    [processableCountries]
  );
  const editableCountries = useMemo(
    () => getCountryEditorOptions(processableCountries, [
      ...extractProcessableCountryCodesFromDetails(details),
      ...editForm.processable_country_codes,
    ]),
    [processableCountries, details, editForm.processable_country_codes]
  );
  const editableCountryCodes = editableCountries.map((country) => country.code);
  const allEditableCountriesSelected = editableCountryCodes.length > 0 &&
    editableCountryCodes.every((code) => editForm.processable_country_codes.includes(code));
  const benefitOptionTags = useMemo(
    () => benefitOptions.map((option) => option.tag),
    [benefitOptions]
  );

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
    const description = pickPositionDescription(merged);
    const editDescription = containsHtml(description)
      ? extractHeroImageFromSafeHtml(sanitizeHtml(description))
      : { heroSrc: "", bodyHtml: description };
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
    const showOnIsmiraWeb = merged.show_on_ismira_web === true;
    const ismiraWebTitle =
      getFirstStringField(merged, ["ismira_web_title"]) || DEFAULT_ISMIRA_WEB_TITLE;

    setEditForm({
      name: name || selectedPositionLabel || selectedPositionId || "",
      company: companies[0] ?? company ?? "",
      companies,
      department: department || "",
      priority: normalizePriorityKey(priority || ""),
      location_name: locationName || "",
      benefit_tags: extractBenefitTagsFromDetails(merged),
      processable_country_codes: extractProcessableCountryCodesFromDetails(merged),
      summary: summary || "",
      description: editDescription.bodyHtml || "",
      responsibilities: responsibilities || "",
      requirements: requirements || "",
      hero_image_url: editDescription.heroSrc || "",
      show_on_ismira_web: showOnIsmiraWeb,
      ismira_web_title: ismiraWebTitle,
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
        openingType: company?.openingType ?? "",
        count: byCount(name),
        benefitTags: company?.benefitTags ?? [],
        countryCodes: company?.countryCodes ?? [],
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

  const selectedEditCompany = useMemo(() => {
    const selected = (editForm.companies[0] ?? editForm.company).trim().toLowerCase();
    if (!selected) return null;
    return (
      companyFilterOptions.find((item) => item.name.trim().toLowerCase() === selected) ?? null
    );
  }, [companyFilterOptions, editForm.company, editForm.companies]);

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
    const key = normalizePriorityKey(
      createOpeningDraft.priority || selectedCreateCompany?.openingType || ""
    );
    return getPriorityLabel(key, availablePriorityTypes) || "None";
  }, [availablePriorityTypes, createOpeningDraft.priority, selectedCreateCompany]);

  const createPriorityPickerOptions = useMemo(() => {
    const query = createPriorityQuery.trim().toLowerCase();
    const inheritedKey = normalizePriorityKey(selectedCreateCompany?.openingType ?? "");
    const options = [
      ...(inheritedKey
        ? [
            {
              key: "__inherit__",
              label: `Company default (${getPriorityLabel(inheritedKey, availablePriorityTypes)})`,
            },
          ]
        : []),
      { key: "", label: "None" },
      ...availablePriorityTypes,
    ];
    if (!query) return options;
    return options.filter((item) => item.label.toLowerCase().includes(query));
  }, [availablePriorityTypes, createPriorityQuery, selectedCreateCompany]);

	  const closePositionModal = useCallback(() => {
      detailsRequestRef.current += 1;
	    setSelectedPositionId(null);
	    setSelectedPositionLabel(null);
	    setDetails(null);
	    setDetailsOverrides({});
    setDetailsCompanyNames([]);
    setDetailsCompanyOpeningType("");
    setCanEdit(false);
    setEditing(false);
    setInlineEditField(null);
    setPriorityTypesModalOpen(false);
    setStatusPickerOpen(false);
    setOpeningTypePickerOpen(false);
    setIsmiraWebPickerOpen(false);
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
    const raw = pickPositionDescription(details);
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

  useEffect(() => {
    let cancelled = false;
    cachedFetch("/api/company/job-countries", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Failed to load countries.");
        return normalizeCountryOptions(data?.countries);
      })
      .then((countries) => {
        if (!cancelled) setProcessableCountries(countries);
      })
      .catch(() => {
        if (!cancelled) setProcessableCountries(DEFAULT_PROCESSABLE_COUNTRIES);
      });
    return () => {
      cancelled = true;
    };
  }, [cachedFetch]);

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

    const externalFiltered = externalFilter
      ? priorityFiltered.filter((pos) => (pos.show_on_ismira_web === true) === (externalFilter === "ismira-web"))
      : priorityFiltered;

    if (!query) return externalFiltered;
    return externalFiltered.filter((pos) => {
      const haystack =
        `${pos.name ?? ""} ${pos.company ?? ""} ${pos.department ?? ""} ${pos.state ?? ""} ${pos.org_type ?? ""} ${pos.friendly_id ?? ""} ${pos.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [positions, filter, jobCompanyFilter, openingTypeFilter, externalFilter, recordType]);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    setError(null);
    try {
      const res = await cachedFetch("/api/breezy/companies", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load Supabase position groups."
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
    const queryKey = `${target}::${jobCompanyFilter.trim().toLowerCase()}::${priority}::${externalFilter}::${search.toLowerCase()}`;
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
      const externalQuery = externalFilter ? `&external=${encodeURIComponent(externalFilter)}` : "";
      const url = `/api/breezy/positions-cache?companyId=${encodeURIComponent(
        target
      )}&limit=50&offset=0${jobCompanyQuery}${priorityQuery}${externalQuery}${searchQuery}`;
      const res = await cachedFetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load positions from Supabase."
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
    const queryKey = `${target}::${jobCompanyFilter.trim().toLowerCase()}::${priority}::${externalFilter}::${search.toLowerCase()}`;
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
      const externalQuery = externalFilter ? `&external=${encodeURIComponent(externalFilter)}` : "";
      const url = `/api/breezy/positions-cache?companyId=${encodeURIComponent(
        target
      )}&limit=50&offset=${encodeURIComponent(String(positionsNextOffset))}${jobCompanyQuery}${priorityQuery}${externalQuery}${searchQuery}`;
      const res = await cachedFetch(url, { cache: "no-store" });
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
  }, [companyId, loadingPositions, loadingMorePositions, positionsNextOffset, serverFilter, openingTypeFilter, externalFilter, jobCompanyFilter, cachedFetch, positionsTotal]);

  const savePremiumDetails = async (positionId: string, value: JobPremiumDetails) => {
    const res = await cachedFetch(
      `/api/company/job-premium-details/${encodeURIComponent(positionId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        (data && typeof data?.error === "string" && data.error) ||
          "Failed to save premium job details."
      );
    }
    return normalizeJobPremiumDetails(data?.details);
  };

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
      const res = await cachedFetch("/api/breezy/positions", {
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

      const saveRes = await cachedFetch(
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

      await savePremiumDetails(createdId, createPremiumDetails);

      setCreateOpeningOpen(false);
      setCreateOpeningDraft({
        name: "",
        company: "",
        department: "",
        priority: "",
        location_name: "",
        benefit_tags: withRequiredBenefitTags([]),
        processable_country_codes: processableCountryCodes,
        summary: "",
        description: "",
        responsibilities: "",
        requirements: "",
        hidden: false,
        hero_image_url: "",
      });
      setCreatePremiumDetails(EMPTY_JOB_PREMIUM_DETAILS);
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
      const res = await cachedFetch("/api/job-assets/upload", { method: "POST", body: form });
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

  const uploadEditHeroImage = async (file: File) => {
    setEditUploadingHero(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await cachedFetch("/api/job-assets/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) || "Image upload failed."
        );
      }
      const url =
        data && typeof (data as { url?: unknown }).url === "string"
          ? (data as { url: string }).url
          : "";
      if (!url.trim()) throw new Error("Upload succeeded but no URL was returned.");
      setEditForm((prev) => ({ ...prev, hero_image_url: url.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setEditUploadingHero(false);
    }
  };

  const loadPositionDetails = useCallback(async (positionId: string, label?: string) => {
    const posId = positionId.trim();
    if (!posId) return;

    const targetCompanyId = companyId.trim();
    if (!targetCompanyId) return;

    const requestId = ++detailsRequestRef.current;
    setSelectedPositionId(posId);
    setSelectedPositionLabel((label ?? "").trim() || null);
    setDetailsLoading(true);
    setError(null);
    setWarning(null);
    setDetails(null);
    setPremiumDetails(EMPTY_JOB_PREMIUM_DETAILS);
    setDetailsOverrides({});
    setDetailsCompanyNames([]);
    setDetailsCompanyOpeningType("");
    setCanEdit(false);
    setEditing(false);
    setInlineEditField(null);

    try {
      const url = `/api/breezy/positions-cache/${encodeURIComponent(
        posId
      )}?companyId=${encodeURIComponent(targetCompanyId)}`;
      const [res, premiumRes] = await Promise.all([
        cachedFetch(url, { cache: "no-store" }),
        cachedFetch(`/api/company/job-premium-details/${encodeURIComponent(posId)}`, { cache: "no-store" }),
      ]);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load position details from Supabase."
        );
      }
      const parsed = isRecord(data) ? (data as CachedPositionDetailsResponse) : null;
      const premiumData = await premiumRes.json().catch(() => null);
      if (!premiumRes.ok) {
        throw new Error(
          (premiumData && typeof premiumData?.error === "string" && premiumData.error) ||
            "Failed to load premium job details."
        );
      }
      if (requestId !== detailsRequestRef.current) return;
      setPremiumDetails(normalizeJobPremiumDetails(premiumData?.details));
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
      const companyOpeningType = normalizePriorityKey(asString(meta.companyOpeningType));
      setDetails(nextDetails ?? { data });
      setDetailsCompanyNames(nextCompanyNames);
      setDetailsCompanyOpeningType(companyOpeningType);
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
        const rawDescription =
          pick("description") ||
          getFirstStringField(derived, [
            "description",
            "description_html",
            "description_text",
            "job_description",
            "content",
          ]);
        const editDescription = containsHtml(rawDescription)
          ? extractHeroImageFromSafeHtml(sanitizeHtml(rawDescription))
          : { heroSrc: "", bodyHtml: rawDescription };

        setEditForm({
          name: pick("name") || getFirstStringField(derived, ["name", "title"]),
          company: nextCompanyNames[0] ?? pick("company"),
          companies: nextCompanyNames,
          department: pick("department") || extractDepartment(derived),
          priority: normalizePriorityKey(pick("priority") || getFirstStringField(derived, ["priority"])),
          location_name:
            pick("location_name") ||
            getFirstStringField(derived, ["location_name", "locationName", "location_label"]),
          benefit_tags: extractBenefitTagsFromDetails(derived),
          processable_country_codes: extractProcessableCountryCodesFromDetails(derived),
          summary:
            pick("summary") ||
            getFirstStringField(derived, ["summary", "short_description", "description_summary"]),
          description: editDescription.bodyHtml,
          responsibilities:
            pick("responsibilities") ||
            getFirstStringField(derived, [
              "responsibilities",
              "responsibilities_html",
              "responsibilities_text",
            ]),
          requirements:
            pick("requirements") ||
            getFirstStringField(derived, [
              "requirements",
              "requirements_html",
              "requirements_text",
            ]),
          hero_image_url: editDescription.heroSrc,
          show_on_ismira_web:
            overrides.show_on_ismira_web === true || derived.show_on_ismira_web === true,
          ismira_web_title:
            pick("ismira_web_title") ||
            getFirstStringField(derived, ["ismira_web_title"]) ||
            DEFAULT_ISMIRA_WEB_TITLE,
        });
      }
    } catch (err) {
      if (requestId !== detailsRequestRef.current) return;
      setDetails(null);
      setDetailsCompanyOpeningType("");
      setSelectedPositionLabel((label ?? "").trim() || null);
      setError(
        err instanceof Error ? err.message : "Failed to load position details."
      );
    } finally {
      if (requestId === detailsRequestRef.current) setDetailsLoading(false);
    }
  }, [companyId, cachedFetch]);

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
        ? "bg-danger-muted text-destructive ring-1 ring-destructive/25"
        : stateNormalized === "published"
          ? "bg-success-muted text-success ring-1 ring-success/25"
          : "bg-muted text-muted-foreground ring-1 ring-ring";
      const statusLabel = hidden
        ? "Hidden"
        : asString(pos.state).trim() || "Draft";
      const showOnIsmiraWeb = pos.show_on_ismira_web === true;
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
            "group align-middle transition-colors",
            id ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-success/25" : "",
            active ? "bg-accent" : "hover:bg-muted/60",
          ].join(" ")}
          onClick={() => (id ? void loadPositionDetails(id, name) : undefined)}
          onKeyDown={(event) => {
            if (!id || event.target !== event.currentTarget) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            void loadPositionDetails(id, name);
          }}
        >
          <td className={tableStyles.companyCell}>
            <div className="flex items-center gap-3" title={company || "Position"}>
              <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white text-xs font-medium text-slate-600">
                {companyLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={companyLogoUrl}
                    alt={company || name}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  avatar
                )}
              </div>
              <span className="truncate text-sm font-medium text-foreground">{company || "Position"}</span>
            </div>
          </td>

          <td>
            <div title={name} className="truncate text-sm font-normal text-foreground">{name}</div>
          </td>
          <td>
            {priorityLabel ? <span className={tableStyles.tag} data-tone={getOpeningTypeColor(priorityKey, availablePriorityTypes)}>{priorityLabel}</span> : <span className="text-muted-foreground">—</span>}
          </td>

          <td className="whitespace-nowrap text-left">
            {showOnIsmiraWeb ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                title="Shown externally on Ismira Web"
              >
                <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="whitespace-nowrap">Ismira Web</span>
              </span>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">-</span>
            )}
          </td>

          <td className="whitespace-nowrap text-left">
            {department ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-normal text-muted-foreground">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="max-w-[170px] truncate whitespace-nowrap">{department}</span>
              </span>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">-</span>
            )}
          </td>

          <td className="whitespace-nowrap text-left">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-normal capitalize ${statusTone}`}
            >
              {statusLabel}
            </span>
          </td>

          <td className="whitespace-nowrap text-left">
            {id ? (
              <div className="relative inline-flex">
                <UiButton variant="ghost" size="icon"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={cardMenuOpenId === rowKey}
                  className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:text-foreground disabled:opacity-60"
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
                  aria-label={`Actions for ${name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </UiButton>

                {cardMenuOpenId === rowKey ? (
                  typeof document !== "undefined" && cardMenuAnchor
                    ? createPortal(
                        <div
                          ref={cardMenuRef}
                          role="menu"
                          className={[
                            "fixed z-[80] w-56 origin-bottom-right -translate-x-full rounded-panel border border-border bg-card shadow-xl",
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
                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                            onClick={() => void openPositionEditor(id, name)}
                            disabled={cardActionSavingId === id}
                          >
                            <PencilLine className="h-4 w-4" />
                            Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                            onClick={() => void duplicatePositionRecord(id)}
                            disabled={cardActionSavingId === id}
                          >
                            <Copy className="h-4 w-4" />
                            {cardActionSavingId === id ? "Duplicating..." : "Duplicate"}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                            onClick={() => void patchPositionHidden(id, !hidden)}
                            disabled={cardActionSavingId === id}
                          >
                            {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            {hidden ? "Unhide" : "Hide"}
                          </button>
                          <div className="border-t border-border" />
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-destructive hover:bg-danger-muted disabled:opacity-60"
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
		    duplicatePositionRecord,
		    openPositionEditor,
		    patchPositionHidden,
		    requestDeletePosition,
		    selectedPositionId,
		  ]);

  const loadPriorityTypes = async () => {
    try {
      const res = await cachedFetch("/api/breezy/priority-types", { cache: "no-store" });
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
    } catch {
      setPriorityTypes(DEFAULT_BREEZY_PRIORITY_TYPES);
      setPriorityDrafts(
        Object.fromEntries(
          DEFAULT_BREEZY_PRIORITY_TYPES.map((item) => [normalizePriorityKey(item.key), item.label])
        )
      );
    }
  };

  const loadManagedDepartments = async () => {
    try {
      const res = await cachedFetch("/api/company/job-departments", { cache: "no-store" });
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

  const moveOpeningType = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (prioritySaving || target < 0 || target >= availablePriorityTypes.length) return;
    const orderedKeys = availablePriorityTypes.map((type) => type.key);
    [orderedKeys[index], orderedKeys[target]] = [orderedKeys[target], orderedKeys[index]];
    setPrioritySaving(true);
    setError(null);
    try {
      const res = await cachedFetch("/api/breezy/priority-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedKeys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to reorder opening types.");
      setPriorityTypes(data.priorityTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder opening types.");
    } finally {
      setPrioritySaving(false);
    }
  };

  const createPriorityType = async () => {
    const label = newPriorityLabel.trim();
    if (!label) return;
    setPrioritySaving(true);
    setError(null);
    try {
      const res = await cachedFetch("/api/breezy/priority-types", {
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
    const label = (priorityDrafts[normalized] ?? priorityTypes.find((type) => type.key === normalized)?.label ?? "").trim();
    const visibilityOnly = typeof showOnFrontpage === "boolean";
    if (!normalized || (!visibilityOnly && !label)) return;
    setPrioritySaving(true);
    setError(null);
    try {
      const payload = visibilityOnly
        ? { key: normalized, showOnFrontpage }
        : {
            key: normalized,
            label,
            ...(tooltipDrafts[normalized] !== undefined ? { tooltip: tooltipDrafts[normalized] } : {}),
            ...(websiteTitleDrafts[normalized] !== undefined ? { websiteTitle: websiteTitleDrafts[normalized] } : {}),
          };
      const res = await cachedFetch("/api/breezy/priority-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as PriorityTypesResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update priority type.");
      }
      if (Array.isArray(data?.priorityTypes)) setPriorityTypes(data.priorityTypes);
      if (!visibilityOnly) {
        setWebsiteTitleDrafts(prev => {
          const next = { ...prev };
          delete next[normalized];
          return next;
        });
        await loadPriorityTypes();
      }
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
      const res = await cachedFetch("/api/breezy/priority-types", {
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
      const res = await cachedFetch(url, {
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
      const res = await cachedFetch(url, {
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

  async function duplicatePositionRecord(posId: string) {
    const target = posId.trim();
    if (!target) return;
    const targetCompanyId = companyId.trim();
    if (!targetCompanyId) return;

    setCardActionSavingId(target);
    setError(null);
    try {
      const url = `/api/breezy/positions-cache/${encodeURIComponent(
        target
      )}/duplicate?companyId=${encodeURIComponent(targetCompanyId)}`;
      const res = await cachedFetch(url, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to duplicate opening."
        );
      }

      const position = isRecord(data?.position) ? (data.position as BreezyPosition) : null;
      if (!position?.id) throw new Error("Duplicate response did not include an opening.");

      setPositions((prev) => {
        let inserted = false;
        const next = prev.flatMap((item) => {
          if (item.id !== target) return [item];
          inserted = true;
          return [item, position];
        });
        return inserted ? next : [position, ...prev];
      });
      setPriorityCountsRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate opening.");
    } finally {
      setCardActionSavingId(null);
      setCardMenuOpenId(null);
      setVisibilityMenuOpen(false);
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
      const res = await cachedFetch(url, { method: "DELETE" });
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
          if (key === "priority") {
            if (value === null) next.priority = null;
            else if (typeof value === "string" && value.trim()) next.priority = value.trim();
            else delete next.priority;
            continue;
          }
          if (key === "show_on_ismira_web") {
            if (value === true) next.show_on_ismira_web = true;
            else delete next.show_on_ismira_web;
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
          if (key === "priority") {
            if (value === null) delete next.priority;
            else if (typeof value === "string" && value.trim()) next.priority = value.trim();
            else if (detailsCompanyOpeningType) next.priority = detailsCompanyOpeningType;
            else delete next.priority;
            continue;
          }
          if (key === "show_on_ismira_web") {
            if (value === true) next.show_on_ismira_web = true;
            else delete next.show_on_ismira_web;
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
            next.priority =
              value === null
                ? undefined
                : priorityValue || detailsCompanyOpeningType || undefined;
          }
          if (Object.prototype.hasOwnProperty.call(sanitizedOverrides, "hidden")) {
            next.hidden = sanitizedOverrides.hidden === true;
            if (next.hidden) next.edited = true;
          }
          if (Object.prototype.hasOwnProperty.call(sanitizedOverrides, "show_on_ismira_web")) {
            next.show_on_ismira_web = sanitizedOverrides.show_on_ismira_web === true;
            next.edited = true;
          }
          return next;
        })
      );

      try {
        const url = `/api/breezy/positions-cache/${encodeURIComponent(
          posId
        )}?companyId=${encodeURIComponent(targetCompanyId)}`;
        const res = await cachedFetch(url, {
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
    [cachedFetch, companyId, details, detailsCompanyOpeningType, loadPositionDetails, selectedPositionId, selectedPositionLabel]
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
      const rawOverrides = {
        ...editForm,
        description: composeDescriptionWithHeroImage({
          heroImageUrl: editForm.hero_image_url,
          bodyHtml: editForm.description,
        }),
      } as Record<string, unknown>;
      delete rawOverrides.hero_image_url;
      const overrides = sanitizeOverrides(rawOverrides);
      const hasPriorityOverride = Object.prototype.hasOwnProperty.call(
        detailsOverrides,
        "priority"
      );
      const normalizedEditPriority = normalizePriorityKey(asString(overrides.priority));
      if (!hasPriorityOverride && normalizedEditPriority === detailsCompanyOpeningType) {
        delete overrides.priority;
      } else if (hasPriorityOverride && !normalizedEditPriority) {
        overrides.priority = null;
      }
      const res = await cachedFetch(url, {
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
      const savedPremiumDetails = await savePremiumDetails(posId, premiumDetails);
      setPremiumDetails(savedPremiumDetails);
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
      const res = await cachedFetch(url, {
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
  }, [companyId, cachedFetch]);

  useEffect(() => {
    if (!companyId) return;
    void loadPositions(companyId);
    setSelectedPositionId(null);
    setSelectedPositionLabel(null);
    setDetails(null);
    setDetailsOverrides({});
    setDetailsCompanyOpeningType("");
    setCanEdit(false);
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, cachedFetch]);

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
        const res = await cachedFetch(
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
  }, [cachedFetch, companyId, recordType]);

  useEffect(() => {
    const target = companyId.trim();
    if (!target) return;
    setPriorityCountsLoading(true);
    (async () => {
      try {
        const jobCompanyQuery = jobCompanyFilter.trim()
          ? `&jobCompany=${encodeURIComponent(jobCompanyFilter.trim())}`
          : "";
        const res = await cachedFetch(
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
  }, [cachedFetch, companyId, jobCompanyFilter, priorityCountsRefreshKey, recordType]);

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
  }, [jobCompanyFilter, openingTypeFilter, externalFilter, serverFilter]);

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
      const gap = 8;
      const max = 10;
      const computed = Math.max(1, Math.min(max, Math.floor((width + gap) / (tile + gap))));
      setCollapsedCompaniesLimit(computed);
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const loadCompanyLogos = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await cachedFetch("/api/company/job-companies", { cache: "no-store", signal });
      const data = (await res.json().catch(() => null)) as JobCompanyLogoResponse | null;
      if (!res.ok || !data?.companies || signal?.aborted) return;

      const nextBenefitOptions = normalizeBenefitOptions(data.benefitOptions);
      const availableBenefitTags = new Set(nextBenefitOptions.map((option) => option.tag));
      const nextList = data.companies
        .map((company) => ({
          id: asString(company?.id).trim(),
          name: asString(company?.name).trim(),
          logoUrl: asString(company?.logoUrl).trim(),
          openingType: normalizePriorityKey(asString(company?.openingType)),
          benefitTags: Array.isArray(company?.benefitTags)
            ? (company.benefitTags.filter(
                (tag): tag is BenefitTag =>
                  typeof tag === "string" && availableBenefitTags.has(tag as BenefitTag)
              ) as BenefitTag[])
            : [],
          countryCodes: normalizeCountryCodeList(company?.countryCodes),
        }))
        .filter((item) => item.name);

      const next = nextList.reduce<Record<string, string>>((acc, company) => {
        const name = company.name.trim().toLowerCase();
        const logoUrl = company.logoUrl.trim();
        if (!name || !logoUrl) return acc;
        acc[name] = logoUrl;
        return acc;
      }, {});

      setCompanyLogoByName(next);
      setJobCompanies(nextList);
      setBenefitOptions(nextBenefitOptions);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setCompanyLogoByName({});
      setJobCompanies([]);
      setBenefitOptions(DEFAULT_JOB_BENEFIT_OPTIONS);
    }
  }, [cachedFetch]);

  useEffect(() => {
    const controller = new AbortController();
    void loadCompanyLogos(controller.signal);
    return () => controller.abort();
  }, [loadCompanyLogos, requestCache]);

  useEffect(() => {
    return subscribeJobCompanyLogosChanged(() => {
      requestCache.clear();
      void loadCompanyLogos();
    });
  }, [loadCompanyLogos, requestCache]);


	  return (
	    <div className="mx-auto w-full">
	      {deleteConfirm && typeof document !== "undefined"
	        ? createPortal(
	            <div
	              className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
	              role="dialog"
	              aria-modal="true"
	              aria-label="Delete opening"
	              onClick={() => {
	                if (cardActionSavingId === deleteConfirm.positionId) return;
	                setDeleteConfirm(null);
	              }}
	            >
	              <div
	                className="w-full max-w-md rounded-panel border border-border bg-card p-6 shadow-2xl"
	                onClick={(event) => event.stopPropagation()}
	              >
	                <div className="flex items-start justify-between gap-4">
	                  <div>
	                    <div className="text-base font-semibold text-foreground">Delete opening?</div>
	                    <div className="mt-2 text-sm text-muted-foreground">
	                      This will remove{" "}
	                      <span className="font-semibold text-foreground">
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
	                  <UiButton variant="secondary" size="lg"
	                    type="button"
	                    className="h-11 transition disabled:opacity-60"
	                    onClick={() => setDeleteConfirm(null)}
	                    disabled={cardActionSavingId === deleteConfirm.positionId}
	                  >
	                    Cancel
	                  </UiButton>
	                  <UiButton variant="destructive" size="lg"
	                    type="button"
	                    className="inline-flex h-11 items-center justify-center gap-2 text-destructive-foreground transition disabled:opacity-60"
	                    onClick={async () => {
	                      const id = deleteConfirm.positionId;
	                      const ok = await performDeletePosition(id);
	                      if (ok) setDeleteConfirm(null);
	                    }}
	                    disabled={cardActionSavingId === deleteConfirm.positionId}
	                  >
	                    <Trash2 className="h-4 w-4" />
	                    {cardActionSavingId === deleteConfirm.positionId ? "Deleting…" : "Delete"}
	                  </UiButton>
	                </div>
	              </div>
	            </div>,
	            document.body
	          )
	        : null}
        {title || description ? (
          <div>
            {title ? (
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
            ) : null}
            {description ? (
              <p className={title ? "mt-2 text-sm text-muted-foreground" : "text-sm text-muted-foreground"}>
                {description}
              </p>
            ) : null}
          </div>
        ) : null}

        {(!companyId || loadingPositions) && positions.length === 0 && !error ? <PositionsPageSkeleton /> : null}
		      <div
            className={[
              (!companyId || loadingPositions) && positions.length === 0 && !error ? "hidden" : "",
              title || description ? "mt-8" : "mt-0",
              "rounded-panel border border-border bg-card p-6 shadow-sm",
            ].join(" ")}
          >
		        <div className="grid gap-4">

		          <div>
		            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
		              Search
	            </div>
		            <div className="mt-2 flex items-center gap-2 rounded-panel border border-border bg-card px-4">
		              <Search className="h-4 w-4 text-muted-foreground" />
		              <UiInput
		                className="h-11 w-full"
		                placeholder="Search openings…"
		                value={filter}
		                onChange={(event) => setFilter(event.target.value)}
		              />
                  <span className="shrink-0 whitespace-nowrap border-l border-border pl-3 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {filteredPositions.length.toLocaleString()}
                    </span>{" "}
                    {recordType === "pool" ? "pools" : "positions"}
                    {typeof positionsTotal === "number" ? (
                      <span className="ml-1 text-muted-foreground">
                        / {positionsTotal.toLocaleString()}
                      </span>
                    ) : null}
                  </span>
		            </div>
		          </div>


	        </div>

        {error ? (
          <div className="mt-4 rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {warning ? (
          <div className="mt-4 rounded-panel border border-warning/25 bg-warning-muted px-4 py-3 text-sm text-warning">
            {warning}
          </div>
        ) : null}

	        <div className="mt-5">
	          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Companies
            </div>

            {showAllCompanies ? (
              <div className="mt-2 grid gap-2 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
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
                        "flex h-10 min-w-0 items-center gap-2 rounded-md border px-2.5 text-left transition-colors hover:bg-muted",
                        active
                          ? "border-ring bg-accent text-foreground"
                          : "border-border bg-card text-foreground",
                      ].join(" ")}
                      onClick={() =>
                        setJobCompanyFilter((prev) =>
                          prev.trim().toLowerCase() === item.name.trim().toLowerCase()
                            ? ""
                            : item.name
                        )
                      }
                      title={active ? `${item.name} — click to clear` : item.name}
                      aria-pressed={active}
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded border border-border bg-white text-xs font-medium text-slate-600">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoUrl}
                            alt={item.name}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          initial
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-label={companyCountsLoading ? "Loading count" : `${item.count ?? 0} openings`}>
                        {companyCountsLoading ? "…" : item.count ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div ref={collapsedCompaniesRowRef} className="mt-2 flex gap-2">
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
                        "flex h-10 min-w-0 flex-1 basis-[180px] items-center gap-2 rounded-md border px-2.5 text-left transition-colors hover:bg-muted",
                        active
                          ? "border-ring bg-accent text-foreground"
                          : "border-border bg-card text-foreground",
                      ].join(" ")}
                      onClick={() =>
                        setJobCompanyFilter((prev) =>
                          prev.trim().toLowerCase() === item.name.trim().toLowerCase()
                            ? ""
                            : item.name
                        )
                      }
                      title={active ? `${item.name} — click to clear` : item.name}
                      aria-pressed={active}
                    >
                      <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded border border-border bg-white text-xs font-medium text-slate-600">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={logoUrl}
                            alt={item.name}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          initial
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-label={companyCountsLoading ? "Loading count" : `${item.count ?? 0} openings`}>
                        {companyCountsLoading ? "…" : item.count ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              {jobCompanyFilter.trim() ? (
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
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
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => setShowAllCompanies((prev) => !prev)}
                >
                  {showAllCompanies ? "Show less" : "Show all"}
                </button>
              ) : null}
            </div>
          </div>

          {recordType === "position" ? (
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-medium text-muted-foreground">
                  Opening type
                </div>
                {openingTypeFilter ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                    onClick={() => setOpeningTypeFilter("")}
                  >
                    Clear type
                  </button>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {priorityCountsLoading && openingTypeFilterOptions.length === 0 ? (
                  <span className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground">
                    Loading types…
                  </span>
                ) : (
                  openingTypeFilterOptions.map((item) => {
                    const active = normalizePriorityKey(openingTypeFilter) === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        aria-pressed={active}
                        data-tone={getOpeningTypeColor(item.key, availablePriorityTypes)}
                        className={`${tableStyles.tag} ${tableStyles.filterTag}`}
                        onClick={() =>
                          setOpeningTypeFilter((prev) =>
                            normalizePriorityKey(prev) === item.key ? "" : item.key
                          )
                        }
                      >
                        <span>{item.label}</span>
                        <span className="ml-1.5 border-l border-current/20 pl-1.5 tabular-nums opacity-80">
                          {item.count}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              </div>
                <div className="min-w-0" role="group" aria-label="External filter">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-muted-foreground">External</div>
                    {externalFilter ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => setExternalFilter("")}
                      >
                        Clear external
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-pressed={externalFilter === "ismira-web"}
                      data-tone="sky"
                      className={`${tableStyles.tag} ${tableStyles.filterTag}`}
                      onClick={() => setExternalFilter(prev => prev === "ismira-web" ? "" : "ismira-web")}
                    >
                      <Globe2 className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      Ismira Web
                    </button>
                    <button
                      type="button"
                      aria-pressed={externalFilter === "none"}
                      className={`${tableStyles.tag} ${tableStyles.filterTag}`}
                      onClick={() => setExternalFilter(prev => prev === "none" ? "" : "none")}
                    >
                      Not external
                    </button>
                  </div>
                </div>
              </div>
              <UiButton variant="primary" size="lg"
		                type="button"
	                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 transition disabled:opacity-60"
	                onClick={() => {
	                  setCreateOpeningError(null);
	                  setCreateOpeningDraft({
	                    name: "",
	                    company: "",
	                    department: "",
	                    priority: "",
	                    location_name: "",
	                    benefit_tags: withRequiredBenefitTags([]),
	                    processable_country_codes: processableCountryCodes,
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
	              </UiButton>
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto" role="region" aria-label="Positions table" tabIndex={0}>
              <table className={tableStyles.table}>
                <caption className="sr-only">{recordType === "pool" ? "Candidate pools" : "Job openings"}</caption>
                <colgroup>
                  <col style={{width: 220}}/><col style={{width: 360}}/><col style={{width: 180}}/>
                  <col style={{width: 140}}/><col style={{width: 220}}/><col style={{width: 120}}/><col style={{width: 72}}/>
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col"><span><Building2/>Company</span></th>
                    <th scope="col"><span><FileText/>Position</span></th>
                    <th scope="col"><span><FolderKanban/>Opening type</span></th>
                    <th scope="col"><span><Globe2/>External</span></th>
                    <th scope="col"><span><Layers/>Department</span></th>
                    <th scope="col"><span><CheckCircle2/>Status</span></th>
                    <th scope="col"><span className="sr-only">Actions</span><MoreHorizontal className="mx-auto h-4 w-4"/></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingPositions ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="bg-card px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        Loading positions…
                      </td>
                    </tr>
                  ) : filteredPositions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="bg-card px-4 py-10 text-center text-sm text-muted-foreground"
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
                <div className="mt-3 text-center text-sm text-muted-foreground">
                  Loading more…
                </div>
              ) : null}
              {!loadingMorePositions && positionsNextOffset === null && positionsTotal !== null ? (
                <div className="mt-3 text-center text-xs text-muted-foreground">
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
            <HeroCoverImage
              src={editing ? editForm.hero_image_url : modalDescription.heroSrc}
              bottomActions={
                editing && canEdit ? (
                  <>
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-white/40 bg-overlay px-4 text-xs font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black/70 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                      {editUploadingHero ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {editUploadingHero
                        ? "Uploading..."
                        : editForm.hero_image_url
                          ? "Replace banner"
                          : "Upload banner"}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={savingEdits || editUploadingHero}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          void uploadEditHeroImage(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {editForm.hero_image_url ? (
                      <button
                        type="button"
                        aria-label="Remove banner image"
                        title="Remove banner image"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-card/90 text-destructive shadow-lg backdrop-blur transition hover:bg-danger-muted disabled:opacity-60"
                        disabled={savingEdits || editUploadingHero}
                        onClick={() => setEditForm((prev) => ({ ...prev, hero_image_url: "" }))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </>
                ) : null
              }
            />
          }
          heroActions={
            <>
	              {!editing && canEdit ? (
	                <button
	                  type="button"
	                  className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-lg ring-1 ring-white/20 focus:outline-none focus:ring-2 focus:ring-ring/60 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-70"
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
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-card/85 text-foreground shadow-sm backdrop-blur hover:bg-card disabled:opacity-60"
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
                    <div className="absolute right-0 top-12 w-48 overflow-hidden rounded-panel border border-border bg-card shadow-xl">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                        onClick={() =>
                          selectedPositionId && void duplicatePositionRecord(selectedPositionId)
                        }
                        disabled={
                          visibilitySaving ||
                          cardActionSavingId === (selectedPositionId ?? "").trim()
                        }
                      >
                        <Copy className="h-4 w-4" />
                        {cardActionSavingId === (selectedPositionId ?? "").trim()
                          ? "Duplicating..."
                          : "Duplicate"}
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                        onClick={() => void setHiddenOverride(!isHidden)}
                        disabled={visibilitySaving}
                      >
                        {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        {isHidden ? "Unhide" : "Hide"}
                      </button>
                      <div className="px-4 pb-3 text-[11px] leading-4 text-muted-foreground">
                        Hidden jobs stay off the HR portal unless Ismira Web is enabled.
                      </div>
                      <div className="border-t border-border" />
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-destructive hover:bg-danger-muted disabled:opacity-60"
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
	            <div className="border-b border-border/80 bg-card/95 px-6 pb-5 pt-6 backdrop-blur">
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
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            {logoSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={logoSrc}
                                alt={primaryCompany}
                                className="h-8 w-8 flex-none rounded-full bg-card object-cover shadow-sm ring-1 ring-ring"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : null}

                            {canEdit && editing ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-left text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
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
                                <PencilLine className="h-4 w-4 text-muted-foreground" />
                              </button>
                            ) : (
                              <span className="max-w-[340px] whitespace-nowrap text-sm font-semibold text-foreground truncate">
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
                          className="h-12 w-full rounded-panel border border-border bg-card px-4 text-lg font-extrabold text-foreground shadow-sm outline-none transition focus:border-success/25 focus:ring-2 focus:ring-success/25 sm:text-2xl"
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
                              className="min-w-0 text-left text-xl font-extrabold leading-tight text-foreground break-words transition hover:text-foreground disabled:opacity-60 sm:text-2xl"
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
                              className="min-w-0 text-xl font-extrabold leading-tight text-foreground break-words sm:text-2xl"
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
                              className="mt-1 inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition hover:bg-muted disabled:opacity-60"
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

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
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
                                    <Layers className="h-3.5 w-3.5 text-warning" />
                                  ) : (
                                    <MapPin className="h-3.5 w-3.5 text-foreground" />
                                  )}
                                  <span className="min-w-0 max-w-[320px] whitespace-nowrap truncate">
                                    {badge.label}
                                  </span>
                                  {canEdit && editing && badge.key === "department" ? (
                                    <PencilLine className="h-3.5 w-3.5 text-warning" />
                                  ) : null}
                                </>
                              );

                              const className = [
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm",
                                badge.key === "department"
                                  ? "border-border bg-muted text-foreground"
                                  : "border-border bg-muted text-foreground",
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
                            const overrideRecord = detailsOverrides as Record<string, unknown>;
                            const showOnIsmiraWeb =
                              editing
                                ? editForm.show_on_ismira_web
                                : overrideRecord.show_on_ismira_web === true ||
                                  (details as Record<string, unknown> | null)?.show_on_ismira_web === true;
                            const title = showOnIsmiraWeb
                              ? "Shown on Ismira website under its opening type"
                              : "Not shown on Ismira website";
                            return canEdit && editing ? (
                              <button
                                type="button"
                                className={[
                                  "relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm transition hover:brightness-[0.98] disabled:opacity-60",
                                  showOnIsmiraWeb
                                    ? "border-border bg-primary text-primary-foreground"
                                    : "border-border bg-muted text-foreground",
                                ].join(" ")}
                                title={title}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setIsmiraWebPickerOpen(true);
                                }}
                                disabled={detailsLoading || savingEdits}
                              >
                                {showOnIsmiraWeb ? (
                                  <span className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-white bg-emerald-500 text-white shadow-sm">
                                    <Check className="h-2.5 w-2.5" />
                                  </span>
                                ) : null}
                                <Globe2
                                  className={[
                                    "h-3.5 w-3.5",
                                    showOnIsmiraWeb ? "text-primary-foreground" : "text-fuchsia-600",
                                  ].join(" ")}
                                />
                                <span className="whitespace-nowrap">Ismira Web</span>
                                <PencilLine
                                  className={[
                                    "h-3.5 w-3.5",
                                    showOnIsmiraWeb ? "text-primary-foreground" : "text-fuchsia-700",
                                  ].join(" ")}
                                />
                              </button>
                            ) : (
                              <span
                                className={[
                                  "relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm",
                                  showOnIsmiraWeb
                                    ? "border-border bg-primary text-primary-foreground"
                                    : "border-border bg-muted text-foreground",
                                ].join(" ")}
                                title={title}
                              >
                                {showOnIsmiraWeb ? (
                                  <span className="absolute -left-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-white bg-emerald-500 text-white shadow-sm">
                                    <Check className="h-2.5 w-2.5" />
                                  </span>
                                ) : null}
                                <Globe2
                                  className={[
                                    "h-3.5 w-3.5",
                                    showOnIsmiraWeb ? "text-primary-foreground" : "text-fuchsia-600",
                                  ].join(" ")}
                                />
                                <span className="whitespace-nowrap">Ismira Web</span>
                              </span>
                            );
                          })()}

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
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold shadow-sm ${getPriorityBadgeClass(priorityKey, availablePriorityTypes) || "bg-muted text-muted-foreground"}`}
                                title="Opening type"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpeningTypePickerOpen(true);
                                }}
                                disabled={detailsLoading || savingEdits}
                              >
                                <FolderKanban className="h-3.5 w-3.5" />
                                <span className="min-w-0 max-w-[240px] whitespace-nowrap truncate">
                                  {label}
                                </span>
                                <PencilLine className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold shadow-sm ${getPriorityBadgeClass(priorityKey, availablePriorityTypes) || "bg-muted text-muted-foreground"}`}>
                                <FolderKanban className="h-3.5 w-3.5" />
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
                                  ? "border-destructive/25 bg-danger-muted text-destructive shadow-rose-200/40"
                                  : "border-success/25 bg-success-muted text-success shadow-emerald-200/40",
                              ].join(" ")}
                              title="Active status"
                              onClick={(event) => {
                                event.stopPropagation();
                                setStatusPickerOpen(true);
                              }}
                              disabled={detailsLoading || visibilitySaving}
                            >
                              {isHidden ? (
                                <EyeOff className="h-3.5 w-3.5 text-destructive" />
                              ) : (
                                <Eye className="h-3.5 w-3.5 text-success" />
                              )}
                              <span className="whitespace-nowrap">
                                {isHidden ? "Not active" : "Active"}
                              </span>
                              <PencilLine
                                className={[
                                  "h-3.5 w-3.5",
                                  isHidden ? "text-destructive" : "text-success",
                                ].join(" ")}
                              />
                            </button>
                          ) : (
                            <span
                              className={[
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold shadow-sm",
                                isHidden
                                  ? "border-destructive/25 bg-danger-muted text-destructive shadow-rose-200/40"
                                  : "border-success/25 bg-success-muted text-success shadow-emerald-200/40",
                              ].join(" ")}
                            >
                              {isHidden ? (
                                <EyeOff className="h-3.5 w-3.5 text-destructive" />
                              ) : (
                                <Eye className="h-3.5 w-3.5 text-success" />
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
                    <div className="mt-3 text-[11px] text-muted-foreground">
                      Editing is disabled:{" "}
                      {isPositionsTableMissing
                        ? "apply `supabase/breezy_positions.sql` in Supabase to enable caching/overrides."
                        : "your user must be `Admin` or `Member Premium` in `company_members`."}
                    </div>
                  ) : null}
                </div>

	              </div>
	            </div>
	          }
          footer={
            <>
              {editing ? (
                <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 px-6 py-4 backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-destructive/25 bg-danger-muted px-4 py-2 text-xs font-semibold text-destructive transition hover:bg-danger-muted disabled:opacity-60"
                      onClick={() => void resetEdits()}
                      disabled={savingEdits}
                    >
                      Reset edits
                    </button>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
                        onClick={() => {
                          setEditing(false);
                          setInlineEditField(null);
                          setStatusPickerOpen(false);
                          setOpeningTypePickerOpen(false);
                          setIsmiraWebPickerOpen(false);
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
                        className="inline-flex items-center gap-2 rounded-full border border-input bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary disabled:opacity-60"
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
                  className="absolute inset-0 z-40 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
                  onClick={() => setPriorityTypesModalOpen(false)}
                >
                  <div
                    className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-panel border border-border bg-card p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Priority types</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Use the arrows to reorder types on the jobs page and Ismira website. Order changes save automatically.
                        </div>
                      </div>
                      <ModalCloseButton onClick={() => setPriorityTypesModalOpen(false)} />
                    </div>

                    <div className="mt-4 grid gap-3">
                      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                      {availablePriorityTypes.map((type, index) => {
                        const key = normalizePriorityKey(type.key);
                        return (
                          <div
                            key={key}
                            className="grid gap-2 rounded-panel border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                          >
                            <OpeningTypeOrderControls
                              label={type.label}
                              index={index}
                              count={availablePriorityTypes.length}
                              disabled={prioritySaving}
                              onMove={(direction) => void moveOpeningType(index, direction)}
                            />
                            <input
                              className="h-11 w-full rounded-panel border border-border bg-card px-4 text-sm text-foreground outline-none focus:border-success/25 focus:ring-2 focus:ring-success/25 disabled:opacity-60"
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
                                "inline-flex h-11 items-center justify-center gap-2 rounded-panel border px-4 text-xs font-semibold transition disabled:opacity-60",
                                type.showOnFrontpage
                                  ? "border-input bg-accent text-foreground hover:bg-accent"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted",
                              ].join(" ")}
                              onClick={() => void updatePriorityType(key, !type.showOnFrontpage)}
                              aria-pressed={type.showOnFrontpage}
                              aria-label={`${type.showOnFrontpage ? "Hide" : "Show"} ${type.label} in job filters`}
                              disabled={prioritySaving}
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
                              className="h-11 rounded-panel border border-border bg-card px-4 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
                              onClick={() => void updatePriorityType(key)}
                              disabled={prioritySaving || !(priorityDrafts[key] ?? type.label).trim()}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-panel border border-destructive/25 bg-danger-muted px-4 text-xs font-semibold text-destructive transition hover:bg-danger-muted disabled:opacity-60"
                              onClick={() => void deletePriorityType(key)}
                              disabled={prioritySaving}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                      <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:col-span-4">
                        Website section heading
                        <input
                          className="h-11 w-full rounded-panel border border-border bg-card px-4 text-sm text-foreground"
                          value={websiteTitleDrafts[key] ?? type.websiteTitle ?? ""}
                          placeholder={getPriorityWebsiteTitle({ label: type.label })}
                          maxLength={200}
                          disabled={prioritySaving}
                          onChange={event => setWebsiteTitleDrafts(prev => ({ ...prev, [key]: event.target.value }))}
                        />
                        <span className="font-normal">Leave blank to use the opening type’s default heading.</span>
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:col-span-4">
                        Tooltip explanation
                        <textarea
                          className="w-full rounded-md border border-border bg-card p-3 text-sm text-foreground focus:border-input focus:outline-none"
                          value={tooltipDrafts[key] ?? getPriorityTooltip(type)}
                          onChange={event => setTooltipDrafts(prev => ({ ...prev, [key]: event.target.value }))}
                          maxLength={500}
                          rows={2}
                          disabled={prioritySaving}
                          placeholder="Explain this opening type. Leave blank to hide the tooltip."
                        />
                      </label>
                          </div>
                        );
                      })}

                      <div className="grid gap-2 rounded-panel border border-dashed border-input p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          className="h-11 w-full rounded-panel border border-border bg-card px-4 text-sm text-foreground outline-none focus:border-success/25 focus:ring-2 focus:ring-success/25 disabled:opacity-60"
                          placeholder="New type label"
                          value={newPriorityLabel}
                          disabled={prioritySaving}
                          onChange={(event) => setNewPriorityLabel(event.target.value)}
                        />
                        <button
                          type="button"
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-panel border border-input bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary disabled:opacity-60"
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
                  className="absolute inset-0 z-20 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
                  onClick={() => {
                    setCompanyPickerOpen(false);
                    setDepartmentPickerOpen(false);
                    setPickerQuery("");
                  }}
                >
                  <div
                    className="w-full max-w-lg rounded-panel border border-border bg-card p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {companyPickerOpen ? "Companies" : "Departments"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
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
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          className="h-11 w-full rounded-panel border border-border bg-card pl-11 pr-4 text-sm text-foreground outline-none focus:border-success/25 focus:ring-2 focus:ring-success/25"
                          value={pickerQuery}
                          onChange={(event) => setPickerQuery(event.target.value)}
                          placeholder={`Search ${companyPickerOpen ? "companies" : "departments"}...`}
                        />
                      </div>

                      <div className="mt-4 max-h-[320px] overflow-auto rounded-panel border border-border">
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
                                      ? "bg-success-muted text-success"
                                      : "text-foreground hover:bg-muted",
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
                                      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-card text-xs font-bold text-muted-foreground ring-1 ring-ring">
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
                                    <span className="inline-flex items-center gap-1 text-success">
                                      <Check className="h-4 w-4" />
                                      Selected
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">Select</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-sm text-muted-foreground">No matches found.</div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
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
                            className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
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
                              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary disabled:opacity-60"
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
                                const nextCountryCodes = selectedEditCompany?.countryCodes.length
                                  ? selectedEditCompany.countryCodes
                                  : editForm.processable_country_codes;

                                setEditForm((prev) => ({
                                  ...prev,
                                  company: primary,
                                  department: keepDept ? prev.department : "",
                                  processable_country_codes: nextCountryCodes,
                                }));
                                setDetailsCompanyNames(selectedCompanies);
                                void saveQuickOverride(
                                  {
                                    company: primary,
                                    department: keepDept ? editForm.department : "",
                                    processable_country_codes: nextCountryCodes,
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
                  className="absolute inset-0 z-20 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
                  onClick={() => setStatusPickerOpen(false)}
                >
                  <div
                    className="w-full max-w-md rounded-panel border border-border bg-card p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Opening status</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Active openings are visible on the public jobs page.
                        </div>
                      </div>
                      <ModalCloseButton onClick={() => setStatusPickerOpen(false)} />
                    </div>

                    <div className="mt-4 grid gap-2">
                      <button
                        type="button"
                        className={[
                          "flex w-full items-center justify-between gap-3 rounded-panel border px-4 py-3 text-left text-sm font-semibold transition hover:bg-muted disabled:opacity-60",
                          !isHidden ? "border-success/25 bg-success-muted" : "border-border",
                        ].join(" ")}
                        onClick={() => {
                          void setHiddenOverride(false);
                          setStatusPickerOpen(false);
                        }}
                        disabled={visibilitySaving || detailsLoading}
                      >
                        <span className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-success" />
                          Active
                        </span>
                        {!isHidden ? <span className="text-success">Selected</span> : null}
                      </button>
                      <button
                        type="button"
                        className={[
                          "flex w-full items-center justify-between gap-3 rounded-panel border px-4 py-3 text-left text-sm font-semibold transition hover:bg-muted disabled:opacity-60",
                          isHidden ? "border-destructive/25 bg-danger-muted" : "border-border",
                        ].join(" ")}
                        onClick={() => {
                          void setHiddenOverride(true);
                          setStatusPickerOpen(false);
                        }}
                        disabled={visibilitySaving || detailsLoading}
                      >
                        <span className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4 text-destructive" />
                          Not active
                        </span>
                        {isHidden ? <span className="text-destructive">Selected</span> : null}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {ismiraWebPickerOpen ? (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
                  onClick={() => setIsmiraWebPickerOpen(false)}
                >
                  <div
                    className="w-full max-w-md rounded-panel border border-border bg-card p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Ismira Web</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Choose whether this opening appears on the Ismira website under its opening type.
                        </div>
                      </div>
                      <ModalCloseButton onClick={() => setIsmiraWebPickerOpen(false)} />
                    </div>

                    <div className="mt-4 grid gap-4">
                      <button
                        type="button"
                        className={[
                          "flex w-full items-center justify-between gap-3 rounded-panel border px-4 py-3 text-left transition hover:bg-muted disabled:opacity-60",
                          editForm.show_on_ismira_web
                            ? "border-input bg-accent/70"
                            : "border-border bg-card",
                        ].join(" ")}
                        onClick={() => {
                          const next = !editForm.show_on_ismira_web;
                          setEditForm((prev) => ({
                            ...prev,
                            show_on_ismira_web: next,
                          }));
                          void saveQuickOverride({
                            show_on_ismira_web: next,
                          });
                        }}
                        disabled={savingEdits || detailsLoading}
                      >
                        <span>
                          <span className="block text-sm font-semibold text-foreground">
                            Show on Ismira website
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Published JDs appear under their opening type’s section heading.
                          </span>
                        </span>
                        <span
                          className={[
                            "relative h-7 w-12 rounded-full transition",
                            editForm.show_on_ismira_web ? "bg-cyan-500" : "bg-accent",
                          ].join(" ")}
                          aria-hidden="true"
                        >
                          <span
                            className={[
                              "absolute top-1 h-5 w-5 rounded-full bg-card shadow-sm transition",
                              editForm.show_on_ismira_web ? "left-6" : "left-1",
                            ].join(" ")}
                          />
                        </span>
                      </button>

                      <p className="text-xs text-muted-foreground">
                        Website section headings and their order are managed in Opening types.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

                  {openingTypePickerOpen ? (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm"
                  onClick={() => setOpeningTypePickerOpen(false)}
                >
                  <div
                    className="w-full max-w-lg rounded-panel border border-border bg-card p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Opening type</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Choose a label for this opening, or create a new one.
                        </div>
                      </div>
                      <ModalCloseButton onClick={() => setOpeningTypePickerOpen(false)} />
                    </div>

                    {(() => {
                      const overrideRecord = detailsOverrides as Record<string, unknown>;
                      const hasPriorityOverride = Object.prototype.hasOwnProperty.call(
                        overrideRecord,
                        "priority"
                      );
                      const overridePriority =
                        typeof overrideRecord.priority === "string"
                          ? normalizePriorityKey(asString(overrideRecord.priority))
                          : "";
                      const inheritedPriority = normalizePriorityKey(detailsCompanyOpeningType);
                      const activeKey = hasPriorityOverride
                        ? overrideRecord.priority === null
                          ? "__none__"
                          : overridePriority || "__none__"
                        : inheritedPriority
                          ? "__inherit__"
                          : "__none__";

                      const options: Array<{ key: string; label: string; value: string | null }> = [
                        ...(inheritedPriority
                          ? [
                              {
                                key: "__inherit__",
                                label: `Company default (${getPriorityLabel(
                                  inheritedPriority,
                                  availablePriorityTypes
                                )})`,
                                value: "",
                              },
                            ]
                          : []),
                        { key: "__none__", label: "None", value: null },
                        ...availablePriorityTypes.map((t) => ({
                          key: normalizePriorityKey(t.key),
                          label: t.label,
                          value: normalizePriorityKey(t.key),
                        })),
                      ];

                      return (
                        <>
                          <div className="mt-4 max-h-[320px] overflow-auto rounded-panel border border-border">
                            <div className="divide-y divide-slate-100">
                              {options.map((opt) => {
                                const selected = opt.key === activeKey;
                                return (
                                  <button
                                    key={opt.key}
                                    type="button"
                                    className={[
                                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold transition hover:bg-muted disabled:opacity-60",
                                      selected ? "bg-accent" : "bg-card",
                                    ].join(" ")}
                                    onClick={() => {
                                      const nextPriority =
                                        opt.value === null
                                          ? ""
                                          : opt.value || inheritedPriority || "";
                                      setEditForm((prev) => ({ ...prev, priority: nextPriority }));
                                      setDetailsOverrides((prev) => {
                                        const next = { ...prev };
                                        if (opt.key === "__inherit__") delete next.priority;
                                        else next.priority = opt.value;
                                        return next;
                                      });
                                      void saveQuickOverride({ priority: opt.value });
                                      setOpeningTypePickerOpen(false);
                                    }}
                                    disabled={savingEdits || detailsLoading}
                                  >
                                    <span className="min-w-0 truncate">{opt.label}</span>
                                    {selected ? (
                                      <span className="text-foreground">Selected</span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-border bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg transition disabled:opacity-60"
                              onClick={() => { setOpeningTypePickerOpen(false); setPriorityTypesModalOpen(true); }}
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
                <PositionDetailsSkeleton />
              ) : details ? (
                <div className="grid gap-4">
                  {(() => {
                    const state = getFirstStringField(details, ["state", "status"]);
                    const summary = getFirstStringField(details, [
                      "summary",
                      "short_description",
                      "description_summary",
                    ]);
                    const description = pickPositionDescription(details);
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
                      return (
                        <div className="grid gap-4">
                          <div className="grid gap-3">
                            <div className="grid gap-3 rounded-panel border border-border bg-muted/60 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Company benefits
                                  </div>
                                </div>
                                <UiButton variant="secondary" size="sm"
                                  type="button"
                                  className="transition disabled:opacity-60"
                                  disabled={savingEdits}
                                  onClick={() =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      benefit_tags:
                                        selectedEditCompany?.benefitTags.length
                                          ? withRequiredBenefitTags(selectedEditCompany.benefitTags)
                                          : withRequiredBenefitTags(benefitOptionTags.slice(0, 6)),
                                    }))
                                  }
                                >
                                  Use company defaults
                                </UiButton>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {benefitOptions.map((option) => {
                                  const tag = option.tag;
                                  const selected = editForm.benefit_tags.includes(tag);
                                  const required = REQUIRED_BENEFIT_TAGS.includes(tag);
                                  const Icon = getBenefitIcon(tag);
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      className={[
                                        "flex items-center gap-3 rounded-panel border px-3 py-2 text-left text-sm transition disabled:opacity-60",
                                        selected
                                          ? "border-input bg-accent text-foreground shadow-sm ring-2 ring-ring"
                                          : "border-border bg-card/70 text-muted-foreground hover:border-input hover:bg-card",
                                      ].join(" ")}
                                      disabled={savingEdits}
                                      onClick={() =>
                                        setEditForm((prev) => ({
                                          ...prev,
                                          benefit_tags: withRequiredBenefitTags(
                                            selected && !required
                                              ? prev.benefit_tags.filter((item) => item !== tag)
                                              : [...prev.benefit_tags, tag]
                                          ),
                                        }))
                                      }
                                    >
                                      <span
                                        className={[
                                          "grid h-9 w-9 shrink-0 place-items-center rounded-full border",
                                          selected
                                            ? "border-input bg-sky-600 text-white"
                                            : "border-border bg-muted text-muted-foreground",
                                        ].join(" ")}
                                      >
                                        <Icon className="h-4 w-4" />
                                      </span>
                                      <span className="min-w-0 flex-1 font-semibold">
                                        {option.label || BENEFIT_TAG_LABELS[tag] || tag}
                                      </span>
                                      {selected ? (
                                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-600 text-white">
                                          <Check className="h-4 w-4" />
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="grid gap-3 rounded-panel border border-border bg-card p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Nationalities we process
                                </div>
                                <UiButton variant="secondary" size="sm"
                                  type="button"
                                  className="transition disabled:opacity-60"
                                  disabled={savingEdits}
                                  onClick={() =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      processable_country_codes:
                                        editableCountryCodes.every((code) => prev.processable_country_codes.includes(code))
                                          ? []
                                          : editableCountryCodes,
                                    }))
                                  }
                                >
                                  {allEditableCountriesSelected
                                    ? "Clear all"
                                    : "Select all"}
                                </UiButton>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {editableCountries.map((country) => {
                                  const selected =
                                    editForm.processable_country_codes.includes(country.code);
                                  return (
                                    <button
                                      key={country.code}
                                      type="button"
                                      className={[
                                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
                                        selected
                                          ? "border-input bg-sky-600 text-white shadow-sm"
                                          : "border-border bg-card text-muted-foreground hover:border-input hover:bg-muted",
                                      ].join(" ")}
                                      disabled={savingEdits}
                                      onClick={() =>
                                        setEditForm((prev) => ({
                                          ...prev,
                                          processable_country_codes: selected
                                            ? prev.processable_country_codes.filter(
                                                (item) => item !== country.code
                                              )
                                            : [...prev.processable_country_codes, country.code],
                                        }))
                                      }
                                    >
                                      <span>{renderCountryFlag(country.code)}</span>
                                      <span>{getCountryLabel(country.code, country.name)}</span>
                                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <PremiumDetailsFields
                              value={premiumDetails}
                              onChange={setPremiumDetails}
                              disabled={savingEdits}
                            />

                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Summary
                              </div>
                              <UiTextarea
                                className="min-h-[90px] w-full disabled:opacity-60"
                                value={editForm.summary}
                                disabled={savingEdits}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, summary: event.target.value }))
                                }
                                placeholder={summary || ""}
                              />
                            </div>

                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Description
                              </div>
                              <WysiwygEditor
                                value={editForm.description}
                                disabled={savingEdits}
                                placeholder="Write the full description…"
                                minHeightClassName="min-h-[220px]"
                                onChange={(next) =>
                                  setEditForm((prev) => ({ ...prev, description: next }))
                                }
                              />
                            </div>

                            <div className="grid gap-1">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                            <div className="text-xs text-muted-foreground">
                              State: <span className="font-semibold text-foreground">{state || "—"}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <>
                        <PremiumDetailsPreview details={premiumDetails} />

                        {(() => {
                          const selectedBenefits = extractBenefitTagsFromDetails(details);
                          if (selectedBenefits.length === 0) return null;

                          return (
                            <div className="rounded-panel border border-border bg-card p-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Company benefits
                              </div>
                              <div className="mt-2">
                                <BenefitChips
                                  tags={selectedBenefits}
                                  options={benefitOptions}
                                />
                              </div>
                            </div>
                          );
                        })()}

                        {(() => {
                          const selectedCodes = extractProcessableCountryCodesFromDetails(details);
                          if (selectedCodes.length === 0) return null;
                          const optionByCode = new Map(
                            processableCountries.map((country) => [country.code, country] as const)
                          );
                          const countries = selectedCodes.map((code, index) => {
                            const option = optionByCode.get(code);
                            return (
                              option ?? {
                                code,
                                name: code,
                                enabled: true,
                                sortOrder: processableCountries.length + index,
                              }
                            );
                          });

                          return (
                            <div className="rounded-panel border border-border bg-card p-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Nationalities we process
                              </div>
                              <div className="mt-2">
                                <CountryChips countries={countries} />
                              </div>
                            </div>
                          );
                        })()}

                        {description ? (
                          <div className="rounded-panel border border-border bg-card p-4 sm:p-6 xl:p-8">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Description
                            </div>
                            <div className="mt-4">
                              {modalDescription.bodyHtml ? (
                                <RichText content={modalDescription.bodyHtml} />
                              ) : (
                                <div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                                  {modalDescription.bodyText || description}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}

                        {responsibilities ? (
                          <div className="rounded-panel border border-border bg-card p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Responsibilities
                            </div>
                            <div className="mt-2">
                              <RichText content={responsibilities} />
                            </div>
                          </div>
                        ) : null}

                        {requirements ? (
                          <div className="rounded-panel border border-border bg-card p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Requirements
                            </div>
                            <div className="mt-2">
                              <RichText content={requirements} />
                            </div>
                          </div>
                        ) : null}

                        {!description && !responsibilities && !requirements && details.jd_content_missing === true ? (
                          <div className="rounded-panel border border-warning/25 bg-warning-muted p-4 text-sm leading-6 text-warning">
                            JD content is not saved in Supabase for this opening.
                          </div>
                        ) : null}
                      </>
                    );
                  })()}

                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No details returned.</div>
              )}

	        </DetailsModalShell>
	      ) : null}

      {createOpeningOpen ? (
        <div
          className="fixed inset-0 z-[12000] flex items-end justify-center bg-overlay p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Create job opening"
          onClick={() => {
            if (createOpeningSaving) return;
            setCreateOpeningOpen(false);
          }}
        >
          <div
            className="flex max-h-[calc(100svh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-panel border border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-foreground">Create job opening</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  This creates a new position in Supabase for the selected company.
                </div>
              </div>
              <ModalCloseButton
                onClick={() => setCreateOpeningOpen(false)}
                disabled={createOpeningSaving}
              />
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Job title
                </div>
                <UiInput
                  className="mt-2 h-11 w-full disabled:opacity-60"
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Company
                  </div>
                  <div className="relative mt-2">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between gap-3 rounded-panel border border-border bg-card px-3 text-left text-sm text-foreground shadow-sm outline-none transition hover:bg-muted focus:border-input focus:ring-2 focus:ring-ring disabled:opacity-60"
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
                            className="h-7 w-7 shrink-0 rounded-full border border-border bg-card object-contain"
                          />
                        ) : (
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-muted text-xs font-bold text-muted-foreground">
                            {createOpeningDraft.company.trim() ? (
                              createOpeningDraft.company.trim().slice(0, 1).toUpperCase()
                            ) : (
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            )}
                          </span>
                        )}
                        <span
                          className={
                            createOpeningDraft.company.trim()
                              ? "min-w-0 truncate font-semibold"
                              : "min-w-0 truncate text-muted-foreground"
                          }
                        >
                          {createOpeningDraft.company.trim() || "Select company..."}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>

                    {createCompanyPickerOpen ? (
                      <div className="absolute left-0 right-0 top-full z-[13000] mt-2 overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
                        <div className="border-b border-border p-3">
                          <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3">
                            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <UiInput
                              className="h-full min-w-0 flex-1"
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
                                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                                    active
                                      ? "bg-accent text-foreground"
                                      : "text-foreground hover:bg-muted",
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
                                          ? withRequiredBenefitTags(item.benefitTags)
                                          : prev.benefit_tags,
                                      processable_country_codes:
                                        item.countryCodes.length > 0
                                          ? item.countryCodes
                                          : prev.processable_country_codes,
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
                                      className="h-9 w-9 shrink-0 rounded-full border border-border bg-card object-contain shadow-sm"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-muted text-xs font-bold text-muted-foreground">
                                      {initial}
                                    </span>
                                  )}
                                  <span className="min-w-0 flex-1 truncate font-semibold">
                                    {item.name}
                                  </span>
                                  {typeof item.count === "number" && item.count > 0 ? (
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                      {item.count}
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                              No companies found.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Department
                  </div>
                  <div className="relative mt-2">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between gap-3 rounded-panel border border-border bg-card px-3 text-left text-sm text-foreground shadow-sm outline-none transition hover:bg-muted focus:border-input focus:ring-2 focus:ring-ring disabled:opacity-60"
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
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-input bg-accent text-foreground">
                          <Layers className="h-4 w-4" />
                        </span>
                        <span
                          className={
                            createOpeningDraft.department.trim()
                              ? "min-w-0 truncate font-semibold"
                              : "min-w-0 truncate text-muted-foreground"
                          }
                        >
                          {createOpeningDraft.department.trim() || "Select department..."}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>

                    {createDepartmentPickerOpen ? (
                      <div className="absolute left-0 right-0 top-full z-[13000] mt-2 overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
                        <div className="border-b border-border p-3">
                          <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3">
                            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <UiInput
                              className="h-full min-w-0 flex-1"
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
                                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                                    active
                                      ? "bg-accent text-foreground"
                                      : "text-foreground hover:bg-muted",
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
                                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-input bg-accent text-foreground">
                                    <Layers className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-semibold">
                                    {isCustom ? `Use “${label}”` : label}
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                  </div>
                  <UiInput
                    className="mt-2 h-11 w-full disabled:opacity-60"
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Opening type
                  </div>
                  <div className="relative mt-2">
                    <button
                      type="button"
                      className="flex h-11 w-full items-center justify-between gap-3 rounded-panel border border-border bg-card px-3 text-left text-sm text-foreground shadow-sm outline-none transition hover:bg-muted focus:border-input focus:ring-2 focus:ring-ring disabled:opacity-60"
                      onClick={() => setCreatePriorityPickerOpen((open) => !open)}
                      disabled={createOpeningSaving}
                      aria-haspopup="listbox"
                      aria-expanded={createPriorityPickerOpen}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-input bg-accent text-foreground">
                          <FolderKanban className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 truncate font-semibold">
                          {selectedCreatePriorityLabel}
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>

                    {createPriorityPickerOpen ? (
                      <div className="absolute left-0 right-0 top-full z-[13000] mt-2 overflow-hidden rounded-panel border border-border bg-card shadow-2xl">
                        <div className="border-b border-border p-3">
                          <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3">
                            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <UiInput
                              className="h-full min-w-0 flex-1"
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
                            const inheritedKey = normalizePriorityKey(selectedCreateCompany?.openingType ?? "");
                            const active =
                              type.key === "__inherit__"
                                ? !normalizePriorityKey(createOpeningDraft.priority) && Boolean(inheritedKey)
                                : key === normalizePriorityKey(createOpeningDraft.priority);
                            return (
                              <button
                                key={type.key || "none"}
                                type="button"
                                className={[
                                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                                  active
                                    ? "bg-accent text-foreground"
                                    : "text-foreground hover:bg-muted",
                                ].join(" ")}
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setCreateOpeningDraft((prev) => ({
                                    ...prev,
                                    priority: type.key === "__inherit__" ? "" : key,
                                  }));
                                  setCreatePriorityQuery("");
                                  setCreatePriorityPickerOpen(false);
                                }}
                              >
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-input bg-accent text-foreground">
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

              <div className="grid gap-3 rounded-panel border border-border bg-muted/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Company benefits
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Select the cards that should appear in the job modal.
                    </div>
                  </div>
                  <UiButton variant="secondary" size="sm"
                    type="button"
                    className="transition disabled:opacity-60"
                    disabled={createOpeningSaving}
                    onClick={() =>
                      setCreateOpeningDraft((prev) => ({
                        ...prev,
                        benefit_tags:
                          selectedCreateCompany?.benefitTags.length
                            ? withRequiredBenefitTags(selectedCreateCompany.benefitTags)
                            : withRequiredBenefitTags(benefitOptionTags.slice(0, 6)),
                      }))
                    }
                  >
                    Use company defaults
                  </UiButton>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {benefitOptions.map((option) => {
                    const tag = option.tag;
                    const selected = createOpeningDraft.benefit_tags.includes(tag);
                    const required = REQUIRED_BENEFIT_TAGS.includes(tag);
                    const Icon = getBenefitIcon(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={[
                          "flex items-center gap-3 rounded-panel border px-3 py-2 text-left text-sm transition disabled:opacity-60",
                          selected
                            ? "border-input bg-accent text-foreground shadow-sm ring-2 ring-ring"
                            : "border-border bg-card/70 text-muted-foreground hover:border-input hover:bg-card",
                        ].join(" ")}
                        disabled={createOpeningSaving}
                        onClick={() =>
                          setCreateOpeningDraft((prev) => ({
                            ...prev,
                            benefit_tags: withRequiredBenefitTags(
                              selected && !required
                                ? prev.benefit_tags.filter((item) => item !== tag)
                                : [...prev.benefit_tags, tag]
                            ),
                          }))
                        }
                      >
                        <span
                          className={[
                            "grid h-9 w-9 shrink-0 place-items-center rounded-full border",
                            selected
                              ? "border-input bg-sky-600 text-white"
                              : "border-border bg-muted text-muted-foreground",
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 font-semibold">
                          {option.label || BENEFIT_TAG_LABELS[tag] || tag}
                        </span>
                        {selected ? (
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-600 text-white">
                            <Check className="h-4 w-4" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 rounded-panel border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Nationalities we process
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      These chips appear above the description in the public job modal.
                    </div>
                  </div>
                  <UiButton variant="secondary" size="sm"
                    type="button"
                    className="transition disabled:opacity-60"
                    disabled={createOpeningSaving}
                    onClick={() =>
                      setCreateOpeningDraft((prev) => ({
                        ...prev,
                        processable_country_codes:
                          prev.processable_country_codes.length ===
                          processableCountryCodes.length
                            ? []
                            : processableCountryCodes,
                      }))
                    }
                  >
                    {createOpeningDraft.processable_country_codes.length ===
                    processableCountryCodes.length
                      ? "Clear all"
                      : "Select all"}
                  </UiButton>
                </div>
                <div className="flex flex-wrap gap-2">
                  {processableCountries.map((country) => {
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
                            ? "border-input bg-sky-600 text-white shadow-sm"
                            : "border-border bg-card text-muted-foreground hover:border-input hover:bg-muted",
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
                        <span>{renderCountryFlag(country.code)}</span>
                        <span>{getCountryLabel(country.code, country.name)}</span>
                        {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <PremiumDetailsFields
                value={createPremiumDetails}
                onChange={setCreatePremiumDetails}
                disabled={createOpeningSaving}
              />

              <div className="grid gap-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Hero image (optional)
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm text-foreground file:mr-3 file:rounded-panel file:border file:border-border file:bg-card file:px-4 file:py-2 file:text-xs file:font-semibold file:text-foreground hover:file:bg-muted disabled:opacity-60 sm:w-auto"
                    disabled={createOpeningSaving || createOpeningUploadingHero}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void uploadCreateHeroImage(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  {createOpeningUploadingHero ? (
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Uploading…
                    </span>
                  ) : createOpeningDraft.hero_image_url ? (
                    <a
                      href={createOpeningDraft.hero_image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-foreground underline underline-offset-2"
                    >
                      View uploaded image
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Uploads to a public bucket and will be shown at the top of the description.
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Summary
                </div>
                <UiTextarea
                  className="min-h-[90px] w-full disabled:opacity-60"
                  value={createOpeningDraft.summary}
                  disabled={createOpeningSaving}
                  onChange={(event) =>
                    setCreateOpeningDraft((prev) => ({ ...prev, summary: event.target.value }))
                  }
                  placeholder="Short summary shown in lists…"
                />
              </div>

              <div className="grid gap-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

              <label className="flex items-center justify-between gap-3 rounded-panel border border-border bg-muted px-4 py-3">
                <span className="text-sm font-semibold text-foreground">Active</span>
                <button
                  type="button"
                  className={[
                    "inline-flex h-10 items-center rounded-full border px-4 text-xs font-semibold transition",
                    createOpeningDraft.hidden
                      ? "border-destructive/25 bg-danger-muted text-destructive hover:bg-danger-muted"
                      : "border-success/25 bg-success-muted text-success hover:bg-success-muted",
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
                <div className="rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-sm text-destructive">
                  {createOpeningError}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-5 py-4">
              <UiButton variant="secondary" size="sm"
                type="button"
                className="inline-flex items-center gap-2 transition disabled:opacity-60"
                onClick={() => setCreateOpeningOpen(false)}
                disabled={createOpeningSaving}
              >
                Cancel
              </UiButton>
              <UiButton variant="primary" size="sm"
                type="button"
                className="inline-flex items-center gap-2 transition disabled:opacity-60"
                onClick={() => void createOpening()}
                disabled={createOpeningSaving || !companyId.trim()}
              >
                {createOpeningSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {createOpeningSaving ? "Creating…" : "Create"}
              </UiButton>
            </div>
          </div>
        </div>
      ) : null}
	    </div>
	  );
}
