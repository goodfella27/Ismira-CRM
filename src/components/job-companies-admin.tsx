"use client";

import { useWorkspaceRequests } from "@/components/workspace-data-provider";
import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { NativeSelect as UiSelect } from "@/components/ui/select";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { OpeningTypeOrderControls } from "@/components/opening-type-order-controls";
import { getPriorityTooltip, getPriorityWebsiteTitle } from "@/lib/breezy-priority-types";
import { getPriorityBadgeClass } from "@/lib/opening-type-colors";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FolderKanban,
  GitMerge,
  PencilLine,
  Plus,
  Save,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";

import { BENEFIT_TAG_LABELS, type BenefitTag } from "@/lib/job-benefits";
import { toFlagEmoji } from "@/lib/country";
import {
  DEFAULT_JOB_BENEFIT_OPTIONS,
  normalizeBenefitOptions,
  type JobBenefitOption,
} from "@/lib/job-benefit-options";
import {
  DEFAULT_BREEZY_PRIORITY_TYPES,
  getPriorityLabel,
  normalizePriorityKey,
  type BreezyPriorityType,
} from "@/lib/breezy-priority-types";
import {
  DEFAULT_JOB_COUNTRY_OPTIONS,
  normalizeCountryCode,
  normalizeCountryOptions,
  type JobCountryOption,
} from "@/lib/job-country-options";
import {
  JOB_SHIP_TYPE_LABELS,
  JOB_SHIP_TYPES,
  normalizeJobShipType,
  normalizeJobShipTypes,
  type JobShipType,
} from "@/lib/job-ship-types";
import { notifyJobCompanyLogosChanged } from "@/lib/job-company-logo-events";

type JobCompanyAdminItem = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  logoUrl: string | null;
  shipType: JobShipType | "";
  shipTypes: JobShipType[];
  openingType: string;
  benefitTags: BenefitTag[];
  countryCodes: string[];
  positionsCount: number;
};

type JobCompanyMergeItem = {
  id: string;
  sourceCompanyId: string;
  targetCompanyId: string;
  sourceName: string;
  targetName: string;
  positionsMoved: number;
  benefitsCopied: number;
  createdAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const normalizeBenefitTagList = (value: BenefitTag[]) =>
  [...new Set(value)].sort((a, b) => a.localeCompare(b));

const sameBenefitTagSelection = (left: BenefitTag[], right: BenefitTag[]) =>
  JSON.stringify(normalizeBenefitTagList(left)) === JSON.stringify(normalizeBenefitTagList(right));

const sameJobShipTypeSelection = (left: JobShipType[], right: JobShipType[]) =>
  JSON.stringify(normalizeJobShipTypes(left)) === JSON.stringify(normalizeJobShipTypes(right));

const normalizeCountryCodeList = (value: string[]) =>
  [...new Set(value.map((code) => normalizeCountryCode(code)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

const sameCountryCodeSelection = (left: string[], right: string[]) =>
  JSON.stringify(normalizeCountryCodeList(left)) === JSON.stringify(normalizeCountryCodeList(right));

const sameCountryOptions = (left: JobCountryOption[], right: JobCountryOption[]) =>
  JSON.stringify(normalizeCountryOptions(left)) === JSON.stringify(normalizeCountryOptions(right));

export default function JobCompaniesAdmin() {
  const { request: workspaceFetch } = useWorkspaceRequests();
  const [jobCompanies, setJobCompanies] = useState<JobCompanyAdminItem[]>([]);
  const [jobCompaniesLoading, setJobCompaniesLoading] = useState(false);
  const [jobCompaniesSyncing, setJobCompaniesSyncing] = useState(false);
  const [jobCompaniesError, setJobCompaniesError] = useState<string | null>(null);
  const [jobCompaniesActionId, setJobCompaniesActionId] = useState<string | null>(null);
  const [expandedJobCompanyId, setExpandedJobCompanyId] = useState<string | null>(null);
  const [newJobCompanyName, setNewJobCompanyName] = useState("");
  const [jobCompanyMergeTargets, setJobCompanyMergeTargets] = useState<Record<string, string>>({});
  const [recentJobCompanyMerges, setRecentJobCompanyMerges] = useState<JobCompanyMergeItem[]>([]);
  const [lastJobCompanyMerge, setLastJobCompanyMerge] = useState<JobCompanyMergeItem | null>(null);
  const [mergeHistoryOpen, setMergeHistoryOpen] = useState(false);
  const [jobCompanyNameDrafts, setJobCompanyNameDrafts] = useState<Record<string, string>>({});
  const [jobCompanyShipTypeDrafts, setJobCompanyShipTypeDrafts] = useState<Record<string, JobShipType[]>>({});
  const [jobCompanyOpeningTypeDrafts, setJobCompanyOpeningTypeDrafts] = useState<Record<string, string>>({});
  const [jobCompanyBenefitDrafts, setJobCompanyBenefitDrafts] = useState<Record<string, BenefitTag[]>>({});
  const [jobCompanyCountryDrafts, setJobCompanyCountryDrafts] = useState<Record<string, string[]>>({});
  const [jobBenefitOptions, setJobBenefitOptions] = useState<JobBenefitOption[]>(
    DEFAULT_JOB_BENEFIT_OPTIONS
  );
  const [jobBenefitOptionsDraft, setJobBenefitOptionsDraft] = useState<JobBenefitOption[]>(
    DEFAULT_JOB_BENEFIT_OPTIONS
  );
  const [newJobBenefitLabel, setNewJobBenefitLabel] = useState("");
  const [jobBenefitOptionsSaving, setJobBenefitOptionsSaving] = useState(false);
  const [benefitOptionsModalOpen, setBenefitOptionsModalOpen] = useState(false);
  const [jobCountryOptions, setJobCountryOptions] = useState<JobCountryOption[]>(
    DEFAULT_JOB_COUNTRY_OPTIONS
  );
  const [jobCountryOptionsDraft, setJobCountryOptionsDraft] = useState<JobCountryOption[]>(
    DEFAULT_JOB_COUNTRY_OPTIONS
  );
  const [newJobCountryCode, setNewJobCountryCode] = useState("");
  const [newJobCountryName, setNewJobCountryName] = useState("");
  const [jobCountryOptionsSaving, setJobCountryOptionsSaving] = useState(false);
  const [countryOptionsModalOpen, setCountryOptionsModalOpen] = useState(false);
  const [openingTypes, setOpeningTypes] = useState<BreezyPriorityType[]>(
    DEFAULT_BREEZY_PRIORITY_TYPES
  );
  const [openingTypesModalOpen, setOpeningTypesModalOpen] = useState(false);
  const [tooltipDrafts, setTooltipDrafts] = useState<Record<string, string>>({});
  const [websiteTitleDrafts, setWebsiteTitleDrafts] = useState<Record<string, string>>({});
  const [openingTypeDrafts, setOpeningTypeDrafts] = useState<Record<string, string>>({});
  const [newOpeningTypeLabel, setNewOpeningTypeLabel] = useState("");
  const [openingTypeSaving, setOpeningTypeSaving] = useState(false);

  const loadOpeningTypes = useCallback(async () => {
    try {
      const res = await workspaceFetch("/api/breezy/priority-types", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data?.priorityTypes)
        ? (data.priorityTypes as BreezyPriorityType[])
        : DEFAULT_BREEZY_PRIORITY_TYPES;
      if (!res.ok) throw new Error(data?.error ?? "Failed to load opening types.");
      setOpeningTypes(list);
      setOpeningTypeDrafts(
        Object.fromEntries(list.map((item) => [normalizePriorityKey(item.key), item.label]))
      );
    } catch {
      setOpeningTypes(DEFAULT_BREEZY_PRIORITY_TYPES);
      setOpeningTypeDrafts(
        Object.fromEntries(
          DEFAULT_BREEZY_PRIORITY_TYPES.map((item) => [
            normalizePriorityKey(item.key),
            item.label,
          ])
        )
      );
    }
  }, []);

  const loadJobCompanies = useCallback(async () => {
    setJobCompaniesLoading(true);
    setJobCompaniesError(null);
    try {
      const res = await workspaceFetch("/api/company/job-companies", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load job companies.");
      }
      const nextBenefitOptions = normalizeBenefitOptions(data?.benefitOptions);
      const availableBenefitTags = new Set(nextBenefitOptions.map((option) => option.tag));
      setJobBenefitOptions(nextBenefitOptions);
      setJobBenefitOptionsDraft(nextBenefitOptions);
      const nextCountryOptions = normalizeCountryOptions(data?.countryOptions);
      setJobCountryOptions(nextCountryOptions);
      setJobCountryOptionsDraft(nextCountryOptions);
      const list: unknown[] = Array.isArray(data?.companies) ? (data.companies as unknown[]) : [];
      const nextCompanies = list.map((item) => {
          const row = isRecord(item) ? item : {};
          const positionsCount = row.positionsCount;
          const benefitTagsRaw = Array.isArray(row.benefitTags) ? row.benefitTags : [];
          const countryCodesRaw = Array.isArray(row.countryCodes) ? row.countryCodes : [];
          return {
            id: typeof row.id === "string" ? row.id : "",
            name: typeof row.name === "string" ? row.name : "Company",
            slug: typeof row.slug === "string" ? row.slug : "",
            website: typeof row.website === "string" ? row.website : null,
            logoUrl: typeof row.logoUrl === "string" ? row.logoUrl : null,
            shipType: normalizeJobShipType(row.shipType),
            shipTypes: normalizeJobShipTypes(row.shipTypes ?? row.shipType),
            openingType: normalizePriorityKey(
              typeof row.openingType === "string" ? row.openingType : ""
            ),
            benefitTags: benefitTagsRaw.filter(
              (tag): tag is BenefitTag =>
                typeof tag === "string" && availableBenefitTags.has(tag as BenefitTag)
            ),
            countryCodes: countryCodesRaw
              .map((code) => normalizeCountryCode(code))
              .filter(Boolean),
            positionsCount:
              typeof positionsCount === "number" && Number.isFinite(positionsCount)
                ? positionsCount
                : 0,
          };
        });
      setJobCompanies(nextCompanies);

      const mergeList: unknown[] = Array.isArray(data?.recentMerges)
        ? (data.recentMerges as unknown[])
        : [];
      setRecentJobCompanyMerges(
        mergeList
          .map((item) => {
            const row = isRecord(item) ? item : {};
            const positionsMoved = row.positionsMoved;
            const benefitsCopied = row.benefitsCopied;
            return {
              id: typeof row.id === "string" ? row.id : "",
              sourceCompanyId:
                typeof row.sourceCompanyId === "string" ? row.sourceCompanyId : "",
              targetCompanyId:
                typeof row.targetCompanyId === "string" ? row.targetCompanyId : "",
              sourceName:
                typeof row.sourceName === "string" ? row.sourceName : "Merged company",
              targetName:
                typeof row.targetName === "string" ? row.targetName : "Target company",
              positionsMoved:
                typeof positionsMoved === "number" && Number.isFinite(positionsMoved)
                  ? positionsMoved
                  : 0,
              benefitsCopied:
                typeof benefitsCopied === "number" && Number.isFinite(benefitsCopied)
                  ? benefitsCopied
                  : 0,
              createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
            } satisfies JobCompanyMergeItem;
          })
          .filter((item) => item.id)
      );

      setJobCompanyMergeTargets((prev) => {
        const companyIds = new Set(nextCompanies.map((item) => item.id));
        const next: Record<string, string> = {};
        for (const item of nextCompanies) {
          const existing = prev[item.id];
          if (existing && existing !== item.id && companyIds.has(existing)) {
            next[item.id] = existing;
            continue;
          }
          next[item.id] = nextCompanies.find((candidate) => candidate.id !== item.id)?.id ?? "";
        }
        return next;
      });
      setJobCompanyNameDrafts(
        Object.fromEntries(
          list.map((item) => {
            const row = isRecord(item) ? item : {};
            return [
              typeof row.id === "string" ? row.id : "",
              typeof row.name === "string" ? row.name : "Company",
            ];
          })
        )
      );
      setJobCompanyBenefitDrafts(
        Object.fromEntries(
          list.map((item) => {
            const row = isRecord(item) ? item : {};
            const tags = Array.isArray(row.benefitTags)
              ? row.benefitTags.filter(
                  (tag): tag is BenefitTag =>
                    typeof tag === "string" &&
                    availableBenefitTags.has(tag as BenefitTag)
                )
              : [];
            return [typeof row.id === "string" ? row.id : "", tags];
          })
        )
      );
      setJobCompanyShipTypeDrafts(
        Object.fromEntries(
          list.map((item) => {
            const row = isRecord(item) ? item : {};
            return [
              typeof row.id === "string" ? row.id : "",
              normalizeJobShipTypes(row.shipTypes ?? row.shipType),
            ];
          })
        )
      );
      setJobCompanyOpeningTypeDrafts(
        Object.fromEntries(
          list.map((item) => {
            const row = isRecord(item) ? item : {};
            return [
              typeof row.id === "string" ? row.id : "",
              typeof row.openingType === "string" ? normalizePriorityKey(row.openingType) : "",
            ];
          })
        )
      );
      setJobCompanyCountryDrafts(
        Object.fromEntries(
          list.map((item) => {
            const row = isRecord(item) ? item : {};
            const codes = Array.isArray(row.countryCodes)
              ? row.countryCodes.map((code) => normalizeCountryCode(code)).filter(Boolean)
              : [];
            return [typeof row.id === "string" ? row.id : "", codes];
          })
        )
      );
    } catch (err) {
      setJobCompaniesError(
        err instanceof Error ? err.message : "Failed to load job companies."
      );
    } finally {
      setJobCompaniesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobCompanies();
  }, [loadJobCompanies]);

  useEffect(() => {
    void loadOpeningTypes();
  }, [loadOpeningTypes]);

  const handleSyncJobCompanies = useCallback(async () => {
    setJobCompaniesSyncing(true);
    setJobCompaniesError(null);
    try {
      const res = await workspaceFetch("/api/company/job-companies/sync", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to sync job companies.");
      }
      await loadJobCompanies();
    } catch (err) {
      setJobCompaniesError(
        err instanceof Error ? err.message : "Failed to sync job companies."
      );
    } finally {
      setJobCompaniesSyncing(false);
    }
  }, [loadJobCompanies]);

  const handleAddJobCompany = useCallback(async () => {
    const name = newJobCompanyName.trim();
    if (!name) {
      setJobCompaniesError("Company name is required.");
      return;
    }

    setJobCompaniesActionId("new");
    setJobCompaniesError(null);
    try {
      const res = await workspaceFetch("/api/company/job-companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to add job company.");
      }
      setNewJobCompanyName("");
      setExpandedJobCompanyId(null);
      await loadJobCompanies();
    } catch (err) {
      setJobCompaniesError(
        err instanceof Error ? err.message : "Failed to add job company."
      );
    } finally {
      setJobCompaniesActionId(null);
    }
  }, [loadJobCompanies, newJobCompanyName]);

  const handleDeleteJobCompany = useCallback(
    async (jobCompanyId: string, name: string) => {
      if (!jobCompanyId) return;
      const confirmed = window.confirm(
        `Delete "${name}" from this company list? This will not delete Breezy positions.`
      );
      if (!confirmed) return;

      setJobCompaniesActionId(jobCompanyId);
      setJobCompaniesError(null);
      try {
        const res = await workspaceFetch(`/api/company/job-companies/${encodeURIComponent(jobCompanyId)}`, {
          method: "DELETE",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to delete job company.");
        }
        await loadJobCompanies();
      } catch (err) {
        setJobCompaniesError(
          err instanceof Error ? err.message : "Failed to delete job company."
        );
      } finally {
        setJobCompaniesActionId(null);
      }
    },
    [loadJobCompanies]
  );

  const handleMergeJobCompany = useCallback(
    async (sourceCompanyId: string) => {
      const source = jobCompanies.find((item) => item.id === sourceCompanyId);
      const targetCompanyId = jobCompanyMergeTargets[sourceCompanyId] ?? "";
      const target = jobCompanies.find((item) => item.id === targetCompanyId);
      if (!source || !target || source.id === target.id) {
        setJobCompaniesError("Choose a different target company to merge into.");
        return;
      }

      const confirmed = window.confirm(
        `Merge "${source.name}" into "${target.name}"? This will move ${source.positionsCount} positions and can be undone from Recent merges.`
      );
      if (!confirmed) return;

      setJobCompaniesActionId(sourceCompanyId);
      setJobCompaniesError(null);
      try {
        const res = await workspaceFetch("/api/company/job-companies/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceCompanyId, targetCompanyId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (data && typeof data?.error === "string" && data.error) ||
              "Failed to merge job companies."
          );
        }

        const merge = isRecord(data?.merge) ? data.merge : {};
        const positionsMoved = merge.positionsMoved;
        const benefitsCopied = merge.benefitsCopied;
        setLastJobCompanyMerge({
          id: typeof merge.mergeId === "string" ? merge.mergeId : "",
          sourceCompanyId,
          targetCompanyId,
          sourceName: typeof merge.sourceName === "string" ? merge.sourceName : source.name,
          targetName: typeof merge.targetName === "string" ? merge.targetName : target.name,
          positionsMoved:
            typeof positionsMoved === "number" && Number.isFinite(positionsMoved)
              ? positionsMoved
              : source.positionsCount,
          benefitsCopied:
            typeof benefitsCopied === "number" && Number.isFinite(benefitsCopied)
              ? benefitsCopied
              : 0,
          createdAt: new Date().toISOString(),
        });
        setExpandedJobCompanyId(targetCompanyId);
        await loadJobCompanies();
      } catch (err) {
        setJobCompaniesError(
          err instanceof Error ? err.message : "Failed to merge job companies."
        );
      } finally {
        setJobCompaniesActionId(null);
      }
    },
    [jobCompanies, jobCompanyMergeTargets, loadJobCompanies]
  );

  const handleUndoJobCompanyMerge = useCallback(
    async (mergeId: string) => {
      if (!mergeId) return;
      setJobCompaniesActionId(`undo:${mergeId}`);
      setJobCompaniesError(null);
      try {
        const res = await workspaceFetch(
          `/api/company/job-companies/merge/${encodeURIComponent(mergeId)}/undo`,
          { method: "POST" }
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (data && typeof data?.error === "string" && data.error) ||
              "Failed to undo job company merge."
          );
        }
        setLastJobCompanyMerge(null);
        await loadJobCompanies();
      } catch (err) {
        setJobCompaniesError(
          err instanceof Error ? err.message : "Failed to undo job company merge."
        );
      } finally {
        setJobCompaniesActionId(null);
      }
    },
    [loadJobCompanies]
  );

  const handleUploadJobCompanyLogo = useCallback(
    async (jobCompanyId: string, file: File | null) => {
      if (!jobCompanyId || !file) return;
      setJobCompaniesActionId(jobCompanyId);
      setJobCompaniesError(null);
      try {
        const form = new FormData();
        form.set("logo", file);
        const res = await workspaceFetch(`/api/company/job-companies/${encodeURIComponent(jobCompanyId)}`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to upload job company logo.");
        }
        await loadJobCompanies();
        notifyJobCompanyLogosChanged();
      } catch (err) {
        setJobCompaniesError(
          err instanceof Error ? err.message : "Failed to upload job company logo."
        );
      } finally {
        setJobCompaniesActionId(null);
      }
    },
    [loadJobCompanies]
  );

  const handleRemoveJobCompanyLogo = useCallback(
    async (jobCompanyId: string) => {
      if (!jobCompanyId) return;
      setJobCompaniesActionId(jobCompanyId);
      setJobCompaniesError(null);
      try {
        const form = new FormData();
        form.set("removeLogo", "1");
        const res = await workspaceFetch(`/api/company/job-companies/${encodeURIComponent(jobCompanyId)}`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to remove job company logo.");
        }
        await loadJobCompanies();
        notifyJobCompanyLogosChanged();
      } catch (err) {
        setJobCompaniesError(
          err instanceof Error ? err.message : "Failed to remove job company logo."
        );
      } finally {
        setJobCompaniesActionId(null);
      }
    },
    [loadJobCompanies]
  );

  const handleAddJobBenefitOption = useCallback((jobCompanyId?: string) => {
    const label = newJobBenefitLabel.replace(/\s+/g, " ").trim();
    if (!label) return;
    const tag = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    if (!tag) return;

    setJobBenefitOptionsDraft((prev) => {
      if (prev.some((option) => option.tag === tag)) return prev;
      return [...prev, { tag, label, sortOrder: prev.length, enabled: true }];
    });
    if (jobCompanyId) {
      setJobCompanyBenefitDrafts((prev) => {
        const current = prev[jobCompanyId] ?? [];
        if (current.includes(tag)) return prev;
        return { ...prev, [jobCompanyId]: [...current, tag] };
      });
    }
    setNewJobBenefitLabel("");
  }, [newJobBenefitLabel]);

  const saveJobBenefitOptions = useCallback(async (draft: JobBenefitOption[]) => {
    setJobBenefitOptionsSaving(true);
    setJobCompaniesError(null);
    try {
      const benefits = normalizeBenefitOptions(draft);
      const res = await workspaceFetch("/api/company/job-benefits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benefits }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save benefit names.");
      }
      const saved = normalizeBenefitOptions(data?.benefits);
      setJobBenefitOptions(saved);
      setJobBenefitOptionsDraft(saved);
      await loadJobCompanies();
    } catch (err) {
      setJobCompaniesError(err instanceof Error ? err.message : "Failed to save benefit names.");
    } finally {
      setJobBenefitOptionsSaving(false);
    }
  }, [loadJobCompanies]);

  const handleSaveJobBenefitOptions = useCallback(async () => {
    await saveJobBenefitOptions(jobBenefitOptionsDraft);
  }, [jobBenefitOptionsDraft, saveJobBenefitOptions]);

  const handleAddJobCountryOption = useCallback(() => {
    const code = normalizeCountryCode(newJobCountryCode || newJobCountryName);
    const name = newJobCountryName.replace(/\s+/g, " ").trim();
    if (!code || !name) return;
    setJobCountryOptionsDraft((prev) => {
      if (prev.some((option) => option.code === code)) return prev;
      return [...prev, { code, name, sortOrder: prev.length, enabled: true }];
    });
    setNewJobCountryCode("");
    setNewJobCountryName("");
  }, [newJobCountryCode, newJobCountryName]);

  const handleSaveJobCountryOptions = useCallback(async () => {
    setJobCountryOptionsSaving(true);
    setJobCompaniesError(null);
    try {
      const countries = normalizeCountryOptions(jobCountryOptionsDraft);
      const res = await workspaceFetch("/api/company/job-countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countries }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save country list.");
      }
      const saved = normalizeCountryOptions(data?.countries);
      setJobCountryOptions(saved);
      setJobCountryOptionsDraft(saved);
      setJobCompanyCountryDrafts((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([companyId, codes]) => [
            companyId,
            normalizeCountryCodeList(codes).filter((code) =>
              saved.some((country) => country.code === code)
            ),
          ])
        )
      );
    } catch (err) {
      setJobCompaniesError(err instanceof Error ? err.message : "Failed to save country list.");
    } finally {
      setJobCountryOptionsSaving(false);
    }
  }, [jobCountryOptionsDraft]);

  const moveOpeningType = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (openingTypeSaving || target < 0 || target >= openingTypes.length) return;
    const orderedKeys = openingTypes.map((type) => type.key);
    [orderedKeys[index], orderedKeys[target]] = [orderedKeys[target], orderedKeys[index]];
    setOpeningTypeSaving(true);
    setJobCompaniesError(null);
    try {
      const res = await workspaceFetch("/api/breezy/priority-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedKeys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to reorder opening types.");
      setOpeningTypes(data.priorityTypes);
    } catch (err) {
      setJobCompaniesError(err instanceof Error ? err.message : "Failed to reorder opening types.");
    } finally {
      setOpeningTypeSaving(false);
    }
  };

  const createOpeningType = async () => {
    const label = newOpeningTypeLabel.trim();
    if (!label) return;
    setOpeningTypeSaving(true);
    setJobCompaniesError(null);
    try {
      const res = await workspaceFetch("/api/breezy/priority-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to create opening type.");
      }
      setNewOpeningTypeLabel("");
      await loadOpeningTypes();
    } catch (err) {
      setJobCompaniesError(err instanceof Error ? err.message : "Failed to create opening type.");
    } finally {
      setOpeningTypeSaving(false);
    }
  };

  const updateOpeningType = async (key: string, showOnFrontpage?: boolean) => {
    const normalized = normalizePriorityKey(key);
    const label = (openingTypeDrafts[normalized] ?? openingTypes.find((type) => type.key === normalized)?.label ?? "").trim();
    const visibilityOnly = typeof showOnFrontpage === "boolean";
    if (!normalized || (!visibilityOnly && !label)) return;
    setOpeningTypeSaving(true);
    setJobCompaniesError(null);
    try {
      const payload = visibilityOnly
        ? { key: normalized, showOnFrontpage }
        : {
            key: normalized,
            label,
            ...(tooltipDrafts[normalized] !== undefined ? { tooltip: tooltipDrafts[normalized] } : {}),
            ...(websiteTitleDrafts[normalized] !== undefined ? { websiteTitle: websiteTitleDrafts[normalized] } : {}),
          };
      const res = await workspaceFetch("/api/breezy/priority-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to update opening type.");
      }
      if (Array.isArray(data?.priorityTypes)) setOpeningTypes(data.priorityTypes);
      if (!visibilityOnly) {
        setWebsiteTitleDrafts(prev => {
          const next = { ...prev };
          delete next[normalized];
          return next;
        });
        await loadOpeningTypes();
      }
    } catch (err) {
      setJobCompaniesError(err instanceof Error ? err.message : "Failed to update opening type.");
    } finally {
      setOpeningTypeSaving(false);
    }
  };

  const deleteOpeningType = async (key: string) => {
    const normalized = normalizePriorityKey(key);
    if (!normalized) return;
    setOpeningTypeSaving(true);
    setJobCompaniesError(null);
    try {
      const res = await workspaceFetch("/api/breezy/priority-types", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: normalized }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to delete opening type.");
      }
      setJobCompanyOpeningTypeDrafts((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([companyId, value]) => [
            companyId,
            normalizePriorityKey(value) === normalized ? "" : value,
          ])
        )
      );
      await loadOpeningTypes();
      await loadJobCompanies();
    } catch (err) {
      setJobCompaniesError(err instanceof Error ? err.message : "Failed to delete opening type.");
    } finally {
      setOpeningTypeSaving(false);
    }
  };

  const handleSaveJobCompany = useCallback(
    async (jobCompanyId: string) => {
      const name = (jobCompanyNameDrafts[jobCompanyId] ?? "").trim();
      const benefitTags = normalizeBenefitTagList(jobCompanyBenefitDrafts[jobCompanyId] ?? []);
      const countryCodes = normalizeCountryCodeList(jobCompanyCountryDrafts[jobCompanyId] ?? []);
      const shipTypes = normalizeJobShipTypes(jobCompanyShipTypeDrafts[jobCompanyId] ?? []);
      const shipType = shipTypes[0] ?? "";
      const openingType = normalizePriorityKey(jobCompanyOpeningTypeDrafts[jobCompanyId] ?? "");
      if (!jobCompanyId) return;
      if (!name) {
        setJobCompaniesError("Company name is required.");
        return;
      }

      setJobCompaniesActionId(jobCompanyId);
      setJobCompaniesError(null);
      try {
        const form = new FormData();
        form.set("name", name);
        form.set("benefitTags", JSON.stringify(benefitTags));
        form.set("benefitOptions", JSON.stringify(jobBenefitOptionsDraft));
        form.set("countryCodes", JSON.stringify(countryCodes));
        form.set("shipType", shipType);
        form.set("shipTypes", JSON.stringify(shipTypes));
        form.set("openingType", openingType);
        const res = await workspaceFetch(`/api/company/job-companies/${encodeURIComponent(jobCompanyId)}`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to update job company.");
        }

        await loadJobCompanies();
      } catch (err) {
        setJobCompaniesError(
          err instanceof Error ? err.message : "Failed to update job company."
        );
      } finally {
        setJobCompaniesActionId(null);
      }
    },
    [
      jobCompanyBenefitDrafts,
      jobCompanyCountryDrafts,
      jobCompanyNameDrafts,
      jobCompanyOpeningTypeDrafts,
      jobCompanyShipTypeDrafts,
      jobBenefitOptionsDraft,
      loadJobCompanies,
    ]
  );

  const mergeHistoryItems = [
    ...(lastJobCompanyMerge ? [lastJobCompanyMerge] : []),
    ...recentJobCompanyMerges.filter((merge) => merge.id !== lastJobCompanyMerge?.id),
  ];
  const benefitOptionsChanged =
    JSON.stringify(normalizeBenefitOptions(jobBenefitOptionsDraft)) !==
    JSON.stringify(normalizeBenefitOptions(jobBenefitOptions));
  const countryOptionsChanged = !sameCountryOptions(jobCountryOptionsDraft, jobCountryOptions);

  return (
    <section className="mt-8 rounded-panel border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Job company display
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage company names, logos, ship type, and benefits used on the public jobs board.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mergeHistoryItems.length > 0 ? (
            <UiButton variant="secondary" size="md"
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 transition"
              onClick={() => setMergeHistoryOpen(true)}
            >
              <Undo2 className="h-4 w-4" />
              Merge history
            </UiButton>
          ) : null}
          <UiButton variant="primary" size="md"
            type="button"
            className="h-10 disabled:opacity-60"
            onClick={handleSyncJobCompanies}
            disabled={jobCompaniesSyncing}
          >
            {jobCompaniesSyncing ? "Syncing..." : "Sync companies"}
          </UiButton>
        </div>
      </div>

      <div className="mt-5 rounded-panel border border-border bg-muted/70 p-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <UiInput
            type="text"
            value={newJobCompanyName}
            onChange={(event) => setNewJobCompanyName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void handleAddJobCompany();
            }}
            placeholder="Add a company manually"
            className="h-11 min-w-0 flex-1"
          />
          <UiButton variant="primary" size="lg"
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 transition hover:brightness-105 disabled:opacity-60"
            onClick={() => void handleAddJobCompany()}
            disabled={jobCompaniesActionId === "new"}
          >
            <Plus className="h-4 w-4" />
            {jobCompaniesActionId === "new" ? "Adding..." : "Add company"}
          </UiButton>
        </div>
      </div>

      {jobCompaniesError ? (
        <div className="mt-4 rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-sm text-destructive">
          {jobCompaniesError}
        </div>
      ) : null}

      {jobCompaniesLoading ? (
        <div className="mt-4 rounded-panel border border-border bg-muted px-4 py-6 text-sm text-muted-foreground">
          Loading companies...
        </div>
      ) : jobCompanies.length === 0 ? (
        <div className="mt-4 rounded-panel border border-dashed border-border bg-muted px-4 py-6 text-sm text-muted-foreground">
          No extracted job companies yet. Run Sync companies after Breezy positions are cached.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {jobCompanies.map((item) => {
            const isBusy = jobCompaniesActionId === item.id;
            const isExpanded = expandedJobCompanyId === item.id;
            const draftName = jobCompanyNameDrafts[item.id] ?? item.name;
            const draftShipTypes = normalizeJobShipTypes(
              jobCompanyShipTypeDrafts[item.id] ?? item.shipTypes
            );
            const draftOpeningType = normalizePriorityKey(
              jobCompanyOpeningTypeDrafts[item.id] ?? item.openingType
            );
            const draftBenefitTags = jobCompanyBenefitDrafts[item.id] ?? [];
            const draftCountryCodes = normalizeCountryCodeList(
              jobCompanyCountryDrafts[item.id] ?? item.countryCodes
            );
            const mergeTargetId = jobCompanyMergeTargets[item.id] ?? "";
            const mergeTarget = jobCompanies.find((candidate) => candidate.id === mergeTargetId);
            const hasChanges =
              draftName.trim() !== item.name.trim() ||
              !sameJobShipTypeSelection(draftShipTypes, item.shipTypes) ||
              draftOpeningType !== normalizePriorityKey(item.openingType) ||
              !sameBenefitTagSelection(draftBenefitTags, item.benefitTags) ||
              !sameCountryCodeSelection(draftCountryCodes, item.countryCodes);
            const shipTypeLabels =
              draftShipTypes.length > 0
                ? draftShipTypes.map((type) => JOB_SHIP_TYPE_LABELS[type])
                : ["Auto / Unknown"];
            const openingTypeLabel =
              getPriorityLabel(draftOpeningType, openingTypes) || "No opening type";

            return (
              <div
                key={item.id}
                className={[
                  "overflow-hidden rounded-panel border bg-card transition",
                  isExpanded || hasChanges
                    ? "border-input shadow-sm shadow-sky-100/70"
                    : "border-border hover:border-input",
                ].join(" ")}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-muted/70"
                  onClick={() =>
                    setExpandedJobCompanyId((current) => (current === item.id ? null : item.id))
                  }
                  aria-expanded={isExpanded}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-panel border border-border bg-muted">
                    {item.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.logoUrl}
                        alt={item.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-muted-foreground">
                        {item.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-extrabold uppercase tracking-wide text-foreground">
                        {draftName || item.name}
                      </div>
                      {hasChanges ? (
                        <span className="rounded-full bg-warning-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                          Unsaved
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                      <span className="rounded-full bg-muted px-2.5 py-1">
                        {item.positionsCount} {item.positionsCount === 1 ? "position" : "positions"}
                      </span>
                      {shipTypeLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full bg-accent px-2.5 py-1 text-foreground"
                        >
                          {label}
                        </span>
                      ))}
                      <span className={`rounded-full px-2.5 py-1 ${getPriorityBadgeClass(draftOpeningType, openingTypes) || "bg-muted text-muted-foreground"}`}>
                        {openingTypeLabel}
                      </span>
                      <span className="rounded-full bg-accent px-2.5 py-1 text-foreground">
                        {draftBenefitTags.length} benefits
                      </span>
                      <span className="rounded-full bg-success-muted px-2.5 py-1 text-success">
                        {draftCountryCodes.length} countries
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={[
                      "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                      isExpanded ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>

                {isExpanded ? (
                  <div className="border-t border-border bg-muted px-4 pb-4 pt-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                      <div className="space-y-4">
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            Company name
                          </label>
                          <UiInput
                            type="text"
                            value={draftName}
                            disabled={isBusy}
                            onChange={(event) =>
                              setJobCompanyNameDrafts((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            className="mt-2 h-12 w-full uppercase tracking-wide"
                          />
                        </div>

                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            Ship type
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                setJobCompanyShipTypeDrafts((prev) => ({ ...prev, [item.id]: [] }))
                              }
                              className={[
                                "rounded-full border px-4 py-2 text-xs font-bold transition",
                                draftShipTypes.length === 0
                                  ? "border-input bg-primary text-primary-foreground"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted",
                              ].join(" ")}
                            >
                              Auto / Unknown
                            </button>
                            {JOB_SHIP_TYPES.map((shipType) => {
                              const active = draftShipTypes.includes(shipType);
                              return (
                                <button
                                  key={shipType}
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    setJobCompanyShipTypeDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: active
                                        ? draftShipTypes.filter((type) => type !== shipType)
                                        : normalizeJobShipTypes([...draftShipTypes, shipType]),
                                    }))
                                  }
                                  className={[
                                    "rounded-full border px-4 py-2 text-xs font-bold transition",
                                    active
                                      ? "border-input bg-accent text-foreground ring-2 ring-ring"
                                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                                  ].join(" ")}
                                >
                                  {JOB_SHIP_TYPE_LABELS[shipType]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            Opening type
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                setJobCompanyOpeningTypeDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: "",
                                }))
                              }
                              className={[
                                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition",
                                !draftOpeningType
                                  ? "border-input bg-primary text-primary-foreground"
                                  : "border-border bg-card text-muted-foreground hover:bg-muted",
                              ].join(" ")}
                            >
                              <FolderKanban className="h-3.5 w-3.5" />
                              None
                            </button>
                            {openingTypes.map((type) => {
                              const key = normalizePriorityKey(type.key);
                              if (!key) return null;
                              const active = draftOpeningType === key;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    setJobCompanyOpeningTypeDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: active ? "" : key,
                                    }))
                                  }
                                  className={[
                                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition",
                                    active
                                      ? "border-input bg-accent text-foreground ring-2 ring-ring"
                                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                                  ].join(" ")}
                                >
                                  {active ? <Check className="h-3.5 w-3.5" /> : null}
                                  <span>{type.label}</span>
                                </button>
                              );
                            })}
                            <UiButton variant="primary" size="sm"
                              type="button"
                              className="inline-flex items-center gap-2 transition disabled:opacity-60"
                              onClick={() => setOpeningTypesModalOpen(true)}
                              disabled={isBusy}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add / Remove
                            </UiButton>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                              Benefits shown on cards
                            </div>
                            <div className="text-xs font-semibold text-muted-foreground">
                              {draftBenefitTags.length} selected
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {jobBenefitOptionsDraft.map((option) => {
                              const tag = option.tag;
                              const active = draftBenefitTags.includes(tag);
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    setJobCompanyBenefitDrafts((prev) => {
                                      const current = prev[item.id] ?? [];
                                      const next = current.includes(tag)
                                        ? current.filter((itemTag) => itemTag !== tag)
                                        : [...current, tag];
                                      return { ...prev, [item.id]: next };
                                    })
                                  }
                                  className={[
                                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition",
                                    active
                                      ? "border-input bg-accent text-foreground ring-2 ring-ring"
                                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                                  ].join(" ")}
                                >
                                  <span>{option.label || BENEFIT_TAG_LABELS[tag] || tag}</span>
                                  {active ? <Check className="h-3.5 w-3.5 opacity-70" aria-hidden="true" /> : null}
                                </button>
                              );
                            })}
                            <UiButton variant="primary" size="sm"
                              type="button"
                              className="inline-flex h-9 items-center justify-center gap-2 transition"
                              onClick={() => setBenefitOptionsModalOpen(true)}
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                              Add / manage benefits
                            </UiButton>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                              Nationalities we process
                            </div>
                            <UiButton variant="secondary" size="sm"
                              type="button"
                              className="transition disabled:opacity-60"
                              disabled={isBusy}
                              onClick={() =>
                                setJobCompanyCountryDrafts((prev) => ({
                                  ...prev,
                                  [item.id]:
                                    draftCountryCodes.length === jobCountryOptionsDraft.length
                                      ? []
                                      : jobCountryOptionsDraft.map((country) => country.code),
                                }))
                              }
                            >
                              {draftCountryCodes.length === jobCountryOptionsDraft.length
                                ? "Clear all"
                                : "Select all"}
                            </UiButton>
                          </div>
                          <div className="mt-2 rounded-panel border border-border bg-card p-3">
                            <div className="flex flex-wrap gap-2">
                              {jobCountryOptionsDraft.map((country) => {
                                const selected = draftCountryCodes.includes(country.code);
                                return (
                                  <button
                                    key={country.code}
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() =>
                                      setJobCompanyCountryDrafts((prev) => {
                                        const current = normalizeCountryCodeList(
                                          prev[item.id] ?? item.countryCodes
                                        );
                                        return {
                                          ...prev,
                                          [item.id]: selected
                                            ? current.filter((code) => code !== country.code)
                                            : [...current, country.code],
                                        };
                                      })
                                    }
                                    className={[
                                      "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition",
                                      selected
                                        ? "border-success/25 bg-success-muted text-success ring-2 ring-success/25"
                                        : "border-border bg-card text-muted-foreground hover:bg-muted",
                                    ].join(" ")}
                                  >
                                    <span aria-hidden="true">{toFlagEmoji(country.code)}</span>
                                    <span>{country.name}</span>
                                  </button>
                                );
                              })}
                              <UiButton variant="primary" size="sm"
                                type="button"
                                className="inline-flex h-9 items-center justify-center gap-2 transition"
                                onClick={() => setCountryOptionsModalOpen(true)}
                              >
                                <PencilLine className="h-3.5 w-3.5" />
                                Add / manage countries
                              </UiButton>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-panel border border-border bg-card p-3">
                        <button
                          type="button"
                          className={[
                            "inline-flex h-12 w-full items-center justify-center gap-2 rounded-panel text-sm font-extrabold transition disabled:cursor-not-allowed",
                            hasChanges
                              ? "bg-primary text-primary-foreground shadow-lg hover:brightness-105"
                              : "bg-muted text-muted-foreground",
                          ].join(" ")}
                          onClick={() => void handleSaveJobCompany(item.id)}
                          disabled={isBusy || !hasChanges}
                        >
                          <Save className="h-4 w-4" />
                          {isBusy ? "Saving..." : hasChanges ? "Save changes" : "Saved"}
                        </button>
                        {hasChanges ? (
                          <div className="rounded-panel bg-warning-muted px-3 py-2 text-xs font-semibold text-warning">
                            Changes are local until you save.
                          </div>
                        ) : null}
                        <label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-panel border border-border bg-card px-4 text-xs font-bold text-foreground transition hover:bg-muted">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={isBusy}
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              void handleUploadJobCompanyLogo(item.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                          <Upload className="h-4 w-4" />
                          {isBusy ? "Uploading..." : "Upload logo"}
                        </label>
                        {item.logoUrl ? (
                          <button
                            type="button"
                            className="h-11 w-full rounded-panel border border-border bg-card px-4 text-xs font-bold text-foreground transition hover:bg-muted disabled:opacity-60"
                            onClick={() => void handleRemoveJobCompanyLogo(item.id)}
                            disabled={isBusy}
                          >
                            Remove logo
                          </button>
                        ) : null}
                        {jobCompanies.length > 1 ? (
                          <div className="rounded-panel border border-warning/25 bg-warning-muted p-3">
                            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-warning">
                              <GitMerge className="h-3.5 w-3.5" />
                              Merge company
                            </div>
                            <UiSelect
                              value={mergeTargetId}
                              disabled={isBusy}
                              onChange={(event) =>
                                setJobCompanyMergeTargets((prev) => ({
                                  ...prev,
                                  [item.id]: event.target.value,
                                }))
                              }
                              className="mt-2 h-10 w-full"
                            >
                              {jobCompanies
                                .filter((candidate) => candidate.id !== item.id)
                                .map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.name}
                                  </option>
                                ))}
                            </UiSelect>
                            <div className="mt-2 text-[11px] font-semibold leading-5 text-warning">
                              Move {item.positionsCount} positions
                              {mergeTarget ? ` into ${mergeTarget.name}` : ""}. Undo is available from Recent merges.
                            </div>
                            <button
                              type="button"
                              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-warning/25 bg-card px-3 text-xs font-bold text-warning transition hover:bg-warning-muted disabled:opacity-60"
                              onClick={() => void handleMergeJobCompany(item.id)}
                              disabled={isBusy || !mergeTargetId}
                            >
                              <GitMerge className="h-4 w-4" />
                              {isBusy ? "Merging..." : "Merge into selected"}
                            </button>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-panel border border-destructive/25 bg-card px-4 text-xs font-bold text-destructive transition hover:bg-danger-muted disabled:opacity-60"
                          onClick={() => void handleDeleteJobCompany(item.id, item.name)}
                          disabled={isBusy}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete company
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {benefitOptionsModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-4"
          onClick={() => setBenefitOptionsModalOpen(false)}
        >
          <div
            className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-panel bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <div className="text-sm font-extrabold text-foreground">Manage benefits</div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">
                  Add, rename, or remove benefit options used on job company cards.
                </div>
              </div>
              <UiButton variant="secondary" size="md"
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center transition"
                aria-label="Close benefits"
                onClick={() => setBenefitOptionsModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </UiButton>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <div className="flex flex-col gap-2 rounded-panel border border-input bg-accent/70 p-2 sm:flex-row">
                <UiInput
                  type="text"
                  value={newJobBenefitLabel}
                  onChange={(event) => setNewJobBenefitLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    handleAddJobBenefitOption();
                  }}
                  placeholder="Add new benefit"
                  className="h-10 min-w-0 flex-1"
                />
                <UiButton variant="primary" size="sm"
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 transition disabled:opacity-60"
                  onClick={() => handleAddJobBenefitOption()}
                  disabled={jobBenefitOptionsSaving || !newJobBenefitLabel.trim()}
                >
                  <Plus className="h-4 w-4" />
                  Add benefit
                </UiButton>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {jobBenefitOptionsDraft.map((option) => (
                  <div
                    key={option.tag}
                    className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card p-1.5"
                  >
                    <UiInput
                      type="text"
                      value={option.label}
                      disabled={jobBenefitOptionsSaving}
                      onChange={(event) =>
                        setJobBenefitOptionsDraft((prev) =>
                          prev.map((benefit) =>
                            benefit.tag === option.tag
                              ? { ...benefit, label: event.target.value }
                              : benefit
                          )
                        )
                      }
                      className="h-8 min-w-0 flex-1"
                    />
                    <UiButton variant="secondary" size="md"
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-destructive transition disabled:opacity-50"
                      aria-label={`Remove ${option.label}`}
                      disabled={jobBenefitOptionsSaving || jobBenefitOptionsDraft.length <= 1}
                      onClick={() => {
                        setJobBenefitOptionsDraft((prev) =>
                          prev
                            .filter((benefit) => benefit.tag !== option.tag)
                            .map((benefit, sortOrder) => ({ ...benefit, sortOrder }))
                        );
                        setJobCompanyBenefitDrafts((prev) =>
                          Object.fromEntries(
                            Object.entries(prev).map(([companyId, tags]) => [
                              companyId,
                              tags.filter((tag) => tag !== option.tag),
                            ])
                          )
                        );
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </UiButton>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <div className="text-xs font-semibold text-muted-foreground">
                {benefitOptionsChanged ? "Benefit option changes are not saved yet." : "Benefit options are saved."}
              </div>
              <div className="flex items-center gap-2">
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="h-10 transition"
                  onClick={() => setBenefitOptionsModalOpen(false)}
                >
                  Close
                </UiButton>
                <UiButton variant="primary" size="sm"
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 transition disabled:opacity-60"
                  onClick={() => void handleSaveJobBenefitOptions()}
                  disabled={jobBenefitOptionsSaving || !benefitOptionsChanged}
                >
                  <Save className="h-4 w-4" />
                  {jobBenefitOptionsSaving ? "Saving..." : "Save benefits"}
                </UiButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {countryOptionsModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-4"
          onClick={() => setCountryOptionsModalOpen(false)}
        >
          <div
            className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-panel bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <div className="text-sm font-extrabold text-foreground">Manage countries</div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">
                  Add, rename, or remove country options used by company nationality filters.
                </div>
              </div>
              <UiButton variant="secondary" size="md"
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center transition"
                aria-label="Close countries"
                onClick={() => setCountryOptionsModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </UiButton>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <div className="grid gap-2 rounded-panel border border-input bg-accent/70 p-2 md:grid-cols-[92px_minmax(0,1fr)_auto]">
                <UiInput
                  type="text"
                  value={newJobCountryCode}
                  onChange={(event) => setNewJobCountryCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    handleAddJobCountryOption();
                  }}
                  placeholder="Code"
                  maxLength={2}
                  className="h-10 uppercase tracking-wide"
                />
                <UiInput
                  type="text"
                  value={newJobCountryName}
                  onChange={(event) => setNewJobCountryName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    handleAddJobCountryOption();
                  }}
                  placeholder="Country name"
                  className="h-10 min-w-0"
                />
                <UiButton variant="primary" size="sm"
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 transition disabled:opacity-60"
                  onClick={handleAddJobCountryOption}
                  disabled={
                    jobCountryOptionsSaving ||
                    !normalizeCountryCode(newJobCountryCode || newJobCountryName) ||
                    !newJobCountryName.trim()
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add country
                </UiButton>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {jobCountryOptionsDraft.map((country) => (
                  <div
                    key={country.code}
                    className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card p-1.5"
                  >
                    <div className="flex h-8 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                      {toFlagEmoji(country.code) || country.code}
                    </div>
                    <UiInput
                      type="text"
                      value={country.name}
                      disabled={jobCountryOptionsSaving}
                      onChange={(event) =>
                        setJobCountryOptionsDraft((prev) =>
                          prev.map((option) =>
                            option.code === country.code
                              ? { ...option, name: event.target.value }
                              : option
                          )
                        )
                      }
                      className="h-8 min-w-0 flex-1"
                    />
                    <div className="shrink-0 rounded-lg bg-muted px-2 py-1 text-[10px] font-extrabold text-muted-foreground">
                      {country.code}
                    </div>
                    <UiButton variant="secondary" size="md"
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-destructive transition disabled:opacity-50"
                      aria-label={`Remove ${country.name}`}
                      disabled={jobCountryOptionsSaving || jobCountryOptionsDraft.length <= 1}
                      onClick={() => {
                        setJobCountryOptionsDraft((prev) =>
                          prev
                            .filter((option) => option.code !== country.code)
                            .map((option, sortOrder) => ({ ...option, sortOrder }))
                        );
                        setJobCompanyCountryDrafts((prev) =>
                          Object.fromEntries(
                            Object.entries(prev).map(([companyId, codes]) => [
                              companyId,
                              codes.filter((code) => code !== country.code),
                            ])
                          )
                        );
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </UiButton>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <div className="text-xs font-semibold text-muted-foreground">
                {countryOptionsChanged ? "Country option changes are not saved yet." : "Country options are saved."}
              </div>
              <div className="flex items-center gap-2">
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="h-10 transition"
                  onClick={() => setCountryOptionsModalOpen(false)}
                >
                  Close
                </UiButton>
                <UiButton variant="primary" size="sm"
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 transition disabled:opacity-60"
                  onClick={() => void handleSaveJobCountryOptions()}
                  disabled={jobCountryOptionsSaving || !countryOptionsChanged}
                >
                  <Save className="h-4 w-4" />
                  {jobCountryOptionsSaving ? "Saving..." : "Save countries"}
                </UiButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {openingTypesModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-4"
          onClick={() => setOpeningTypesModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-panel bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <div className="text-sm font-extrabold text-foreground">Opening types</div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">
                  Use the arrows to reorder types on the jobs page and Ismira website. Order changes save automatically.
                </div>
              </div>
              <UiButton variant="secondary" size="md"
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center transition disabled:opacity-60"
                onClick={() => setOpeningTypesModalOpen(false)}
                disabled={openingTypeSaving}
                aria-label="Close opening types"
              >
                <X className="h-4 w-4" />
              </UiButton>
            </div>

            <div className="max-h-[70vh] overflow-auto px-5 py-4">
              <div className="grid gap-3">
                {jobCompaniesError ? <p role="alert" className="text-sm text-destructive">{jobCompaniesError}</p> : null}
                {openingTypes.map((type, index) => {
                  const key = normalizePriorityKey(type.key);
                  return (
                    <div
                      key={key}
                      className="grid gap-2 rounded-panel border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    >
                      <OpeningTypeOrderControls
                        label={type.label}
                        index={index}
                        count={openingTypes.length}
                        disabled={openingTypeSaving}
                        onMove={(direction) => void moveOpeningType(index, direction)}
                      />
                      <UiInput
                        className="h-11 w-full disabled:opacity-60"
                        value={openingTypeDrafts[key] ?? type.label}
                        disabled={openingTypeSaving}
                        onChange={(event) =>
                          setOpeningTypeDrafts((prev) => ({
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
                        onClick={() => void updateOpeningType(key, !type.showOnFrontpage)}
                        aria-pressed={type.showOnFrontpage}
                        aria-label={`${type.showOnFrontpage ? "Hide" : "Show"} ${type.label} in job filters`}
                        disabled={openingTypeSaving}
                      >
                        {type.showOnFrontpage ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                        {type.showOnFrontpage ? "Frontpage" : "Hidden"}
                      </button>
                      <UiButton variant="secondary" size="sm"
                        type="button"
                        className="h-11 transition disabled:opacity-60"
                        onClick={() => void updateOpeningType(key)}
                        disabled={openingTypeSaving || !(openingTypeDrafts[key] ?? type.label).trim()}
                      >
                        Save
                      </UiButton>
                      <UiButton variant="secondary" size="sm"
                        type="button"
                        className="inline-flex h-11 items-center justify-center gap-2 text-destructive transition disabled:opacity-60"
                        onClick={() => void deleteOpeningType(key)}
                        disabled={openingTypeSaving}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </UiButton>
                      <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:col-span-4">
                        Website section heading
                        <UiInput
                          className="h-11 w-full rounded-panel border border-border bg-card px-4 text-sm text-foreground"
                          value={websiteTitleDrafts[key] ?? type.websiteTitle ?? ""}
                          placeholder={getPriorityWebsiteTitle({ label: type.label })}
                          maxLength={200}
                          disabled={openingTypeSaving}
                          onChange={event => setWebsiteTitleDrafts(prev => ({ ...prev, [key]: event.target.value }))}
                        />
                        <span className="font-normal">Leave blank to use the opening type’s default heading.</span>
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:col-span-4">
                        Tooltip explanation
                        <UiTextarea
                          className="w-full"
                          value={tooltipDrafts[key] ?? getPriorityTooltip(type)}
                          onChange={event => setTooltipDrafts(prev => ({ ...prev, [key]: event.target.value }))}
                          maxLength={500}
                          rows={2}
                          disabled={openingTypeSaving}
                          placeholder="Explain this opening type. Leave blank to hide the tooltip."
                        />
                      </label>
                    </div>
                  );
                })}

                <div className="grid gap-2 rounded-panel border border-dashed border-input p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <UiInput
                    className="h-11 w-full disabled:opacity-60"
                    placeholder="New type label"
                    value={newOpeningTypeLabel}
                    disabled={openingTypeSaving}
                    onChange={(event) => setNewOpeningTypeLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      void createOpeningType();
                    }}
                  />
                  <UiButton variant="primary" size="sm"
                    type="button"
                    className="inline-flex h-11 items-center justify-center gap-2 transition disabled:opacity-60"
                    onClick={() => void createOpeningType()}
                    disabled={openingTypeSaving || !newOpeningTypeLabel.trim()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add type
                  </UiButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {mergeHistoryOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-4"
          onClick={() => setMergeHistoryOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-panel bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <div className="text-sm font-extrabold text-foreground">Merge history</div>
                <div className="mt-1 text-xs font-semibold text-muted-foreground">
                  Undo recent company merges from this list.
                </div>
              </div>
              <UiButton variant="secondary" size="sm"
                type="button"
                className="h-9 transition"
                onClick={() => setMergeHistoryOpen(false)}
              >
                Close
              </UiButton>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-auto px-5 py-4">
              {mergeHistoryItems.length === 0 ? (
                <div className="rounded-panel border border-dashed border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
                  No recent merges.
                </div>
              ) : (
                mergeHistoryItems.map((merge) => (
                  <div
                    key={merge.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-muted px-4 py-3"
                  >
                    <div className="min-w-0 text-xs font-semibold text-foreground">
                      <span className="font-extrabold text-foreground">{merge.sourceName}</span>
                      {" into "}
                      <span className="font-extrabold text-foreground">{merge.targetName}</span>
                      {" · "}
                      {merge.positionsMoved} positions
                    </div>
                    <UiButton variant="secondary" size="sm"
                      type="button"
                      className="inline-flex h-8 items-center justify-center gap-1.5 transition disabled:opacity-60"
                      onClick={() => void handleUndoJobCompanyMerge(merge.id)}
                      disabled={jobCompaniesActionId === `undo:${merge.id}`}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      {jobCompaniesActionId === `undo:${merge.id}` ? "Undoing..." : "Undo"}
                    </UiButton>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
