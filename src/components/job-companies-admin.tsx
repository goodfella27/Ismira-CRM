"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, GitMerge, PencilLine, Plus, Save, Trash2, Undo2, Upload } from "lucide-react";

import { AVAILABLE_BENEFIT_TAGS, BENEFIT_TAG_LABELS, type BenefitTag } from "@/lib/job-benefits";
import { toFlagEmoji } from "@/lib/country";
import {
  DEFAULT_JOB_BENEFIT_OPTIONS,
  normalizeBenefitOptions,
  type JobBenefitOption,
} from "@/lib/job-benefit-options";
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

type JobCompanyAdminItem = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  logoUrl: string | null;
  shipType: JobShipType | "";
  shipTypes: JobShipType[];
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

export default function JobCompaniesAdmin() {
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
  const [jobCountryOptions, setJobCountryOptions] = useState<JobCountryOption[]>(
    DEFAULT_JOB_COUNTRY_OPTIONS
  );
  const [jobCountryOptionsDraft, setJobCountryOptionsDraft] = useState<JobCountryOption[]>(
    DEFAULT_JOB_COUNTRY_OPTIONS
  );
  const [newJobCountryCode, setNewJobCountryCode] = useState("");
  const [newJobCountryName, setNewJobCountryName] = useState("");
  const [jobCountryOptionsSaving, setJobCountryOptionsSaving] = useState(false);
  const [editingJobBenefit, setEditingJobBenefit] = useState<{
    jobCompanyId: string;
    tag: BenefitTag;
  } | null>(null);
  const [editingJobBenefitLabel, setEditingJobBenefitLabel] = useState("");

  const loadJobCompanies = useCallback(async () => {
    setJobCompaniesLoading(true);
    setJobCompaniesError(null);
    try {
      const res = await fetch("/api/company/job-companies", { cache: "no-store" });
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

  const handleSyncJobCompanies = useCallback(async () => {
    setJobCompaniesSyncing(true);
    setJobCompaniesError(null);
    try {
      const res = await fetch("/api/company/job-companies/sync", { method: "POST" });
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
      const res = await fetch("/api/company/job-companies", {
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
        const res = await fetch(`/api/company/job-companies/${encodeURIComponent(jobCompanyId)}`, {
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
        const res = await fetch("/api/company/job-companies/merge", {
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
        const res = await fetch(
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
        const res = await fetch(`/api/company/job-companies/${encodeURIComponent(jobCompanyId)}`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to upload job company logo.");
        }
        await loadJobCompanies();
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
        const res = await fetch(`/api/company/job-companies/${encodeURIComponent(jobCompanyId)}`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to remove job company logo.");
        }
        await loadJobCompanies();
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
      const res = await fetch("/api/company/job-benefits", {
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
      const res = await fetch("/api/company/job-countries", {
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

  const handleOpenJobBenefitEditor = useCallback(
    (jobCompanyId: string, option: JobBenefitOption) => {
      setEditingJobBenefit({ jobCompanyId, tag: option.tag });
      setEditingJobBenefitLabel(option.label);
    },
    []
  );

  const handleCloseJobBenefitEditor = useCallback(() => {
    setEditingJobBenefit(null);
    setEditingJobBenefitLabel("");
  }, []);

  const handleSaveJobCompany = useCallback(
    async (jobCompanyId: string) => {
      const name = (jobCompanyNameDrafts[jobCompanyId] ?? "").trim();
      const benefitTags = normalizeBenefitTagList(jobCompanyBenefitDrafts[jobCompanyId] ?? []);
      const countryCodes = normalizeCountryCodeList(jobCompanyCountryDrafts[jobCompanyId] ?? []);
      const shipTypes = normalizeJobShipTypes(jobCompanyShipTypeDrafts[jobCompanyId] ?? []);
      const shipType = shipTypes[0] ?? "";
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
        form.set("countryCodes", JSON.stringify(countryCodes));
        form.set("shipType", shipType);
        form.set("shipTypes", JSON.stringify(shipTypes));
        const res = await fetch(`/api/company/job-companies/${encodeURIComponent(jobCompanyId)}`, {
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
      jobCompanyShipTypeDrafts,
      loadJobCompanies,
    ]
  );

  const editingBenefitOption = editingJobBenefit
    ? jobBenefitOptionsDraft.find((option) => option.tag === editingJobBenefit.tag) ?? null
    : null;
  const editingBenefitCompany = editingJobBenefit
    ? jobCompanies.find((company) => company.id === editingJobBenefit.jobCompanyId) ?? null
    : null;
  const editingBenefitSelected =
    editingJobBenefit && jobCompanyBenefitDrafts[editingJobBenefit.jobCompanyId]
      ? jobCompanyBenefitDrafts[editingJobBenefit.jobCompanyId]!.includes(editingJobBenefit.tag)
      : false;
  const mergeHistoryItems = [
    ...(lastJobCompanyMerge ? [lastJobCompanyMerge] : []),
    ...recentJobCompanyMerges.filter((merge) => merge.id !== lastJobCompanyMerge?.id),
  ];

  const handleSaveEditingBenefit = async () => {
    if (!editingJobBenefit || !editingBenefitOption) return;
    const label = editingJobBenefitLabel.replace(/\s+/g, " ").trim();
    if (!label) {
      setJobCompaniesError("Benefit name is required.");
      return;
    }
    const nextOptions = normalizeBenefitOptions(
      jobBenefitOptionsDraft.map((option) =>
        option.tag === editingJobBenefit.tag ? { ...option, label } : option
      )
    );
    setJobBenefitOptionsDraft(nextOptions);
    await saveJobBenefitOptions(nextOptions);
    handleCloseJobBenefitEditor();
  };

  const handleDeleteEditingBenefit = async () => {
    if (!editingJobBenefit || !editingBenefitOption) return;
    const confirmed = window.confirm(
      `Remove "${editingBenefitOption.label}" from benefit names and all company selections?`
    );
    if (!confirmed) return;
    const nextOptions = normalizeBenefitOptions(
      jobBenefitOptionsDraft.filter((option) => option.tag !== editingJobBenefit.tag)
    );
    setJobBenefitOptionsDraft(nextOptions);
    setJobCompanyBenefitDrafts((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([companyId, tags]) => [
          companyId,
          tags.filter((tag) => tag !== editingJobBenefit.tag),
        ])
      )
    );
    await saveJobBenefitOptions(nextOptions);
    handleCloseJobBenefitEditor();
  };

  const handleToggleEditingBenefitSelection = () => {
    if (!editingJobBenefit) return;
    setJobCompanyBenefitDrafts((prev) => {
      const current = prev[editingJobBenefit.jobCompanyId] ?? [];
      const next = current.includes(editingJobBenefit.tag)
        ? current.filter((tag) => tag !== editingJobBenefit.tag)
        : [...current, editingJobBenefit.tag];
      return { ...prev, [editingJobBenefit.jobCompanyId]: next };
    });
  };

  return (
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Job company display
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Manage company names, logos, ship type, and benefits used on the public jobs board.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mergeHistoryItems.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={() => setMergeHistoryOpen(true)}
            >
              <Undo2 className="h-4 w-4" />
              Merge history
            </button>
          ) : null}
          <button
            type="button"
            className="h-10 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
            onClick={handleSyncJobCompanies}
            disabled={jobCompaniesSyncing}
          >
            {jobCompaniesSyncing ? "Syncing..." : "Sync companies"}
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newJobCompanyName}
            onChange={(event) => setNewJobCompanyName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void handleAddJobCompany();
            }}
            placeholder="Add a company manually"
            className="h-11 min-w-0 flex-1 rounded-2xl border border-transparent bg-white px-4 text-sm font-semibold text-slate-900 outline-none shadow-sm shadow-slate-200/60 focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2f7de1] to-[#64c8ff] px-5 text-sm font-bold text-white shadow-lg shadow-sky-200/70 transition hover:brightness-105 disabled:opacity-60"
            onClick={() => void handleAddJobCompany()}
            disabled={jobCompaniesActionId === "new"}
          >
            <Plus className="h-4 w-4" />
            {jobCompaniesActionId === "new" ? "Adding..." : "Add company"}
          </button>
        </div>
      </div>

      {jobCompaniesError ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {jobCompaniesError}
        </div>
      ) : null}

      {jobCompaniesLoading ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Loading companies...
        </div>
      ) : jobCompanies.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
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
            const draftBenefitTags = jobCompanyBenefitDrafts[item.id] ?? [];
            const draftCountryCodes = normalizeCountryCodeList(
              jobCompanyCountryDrafts[item.id] ?? item.countryCodes
            );
            const mergeTargetId = jobCompanyMergeTargets[item.id] ?? "";
            const mergeTarget = jobCompanies.find((candidate) => candidate.id === mergeTargetId);
            const hasChanges =
              draftName.trim() !== item.name.trim() ||
              !sameJobShipTypeSelection(draftShipTypes, item.shipTypes) ||
              !sameBenefitTagSelection(draftBenefitTags, item.benefitTags) ||
              !sameCountryCodeSelection(draftCountryCodes, item.countryCodes);
            const shipTypeLabels =
              draftShipTypes.length > 0
                ? draftShipTypes.map((type) => JOB_SHIP_TYPE_LABELS[type])
                : ["Auto / Unknown"];

            return (
              <div
                key={item.id}
                className={[
                  "overflow-hidden rounded-3xl border bg-white transition",
                  isExpanded || hasChanges
                    ? "border-sky-200 shadow-sm shadow-sky-100/70"
                    : "border-slate-200 hover:border-slate-300",
                ].join(" ")}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-slate-50/70"
                  onClick={() =>
                    setExpandedJobCompanyId((current) => (current === item.id ? null : item.id))
                  }
                  aria-expanded={isExpanded}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {item.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.logoUrl}
                        alt={item.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-slate-400">
                        {item.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-extrabold uppercase tracking-wide text-slate-950">
                        {draftName || item.name}
                      </div>
                      {hasChanges ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          Unsaved
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">
                        {item.positionsCount} {item.positionsCount === 1 ? "position" : "positions"}
                      </span>
                      {shipTypeLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-800"
                        >
                          {label}
                        </span>
                      ))}
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800">
                        {draftBenefitTags.length} benefits
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
                        {draftCountryCodes.length} countries
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={[
                      "h-5 w-5 shrink-0 text-slate-400 transition-transform",
                      isExpanded ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>

                {isExpanded ? (
                  <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/70 to-white px-4 pb-4 pt-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                      <div className="space-y-4">
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                            Company name
                          </label>
                          <input
                            type="text"
                            value={draftName}
                            disabled={isBusy}
                            onChange={(event) =>
                              setJobCompanyNameDrafts((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-extrabold uppercase tracking-wide text-slate-950 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                          />
                        </div>

                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
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
                                  ? "border-slate-950 bg-slate-950 text-white"
                                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
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
                                      ? "border-cyan-300 bg-cyan-50 text-cyan-900 ring-2 ring-cyan-100"
                                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                                  ].join(" ")}
                                >
                                  {JOB_SHIP_TYPE_LABELS[shipType]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                              Benefits shown on cards
                            </div>
                            <div className="text-xs font-semibold text-slate-500">
                              {draftBenefitTags.length} selected
                            </div>
                          </div>
                          <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50/70 p-2 sm:flex-row">
                            <input
                              type="text"
                              value={newJobBenefitLabel}
                              onChange={(event) => setNewJobBenefitLabel(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.preventDefault();
                                handleAddJobBenefitOption(item.id);
                              }}
                              placeholder="Add new benefit here"
                              className="h-10 min-w-0 flex-1 rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            />
                            <button
                              type="button"
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-bold text-white transition hover:bg-sky-700 disabled:opacity-60"
                              onClick={() => handleAddJobBenefitOption(item.id)}
                              disabled={jobBenefitOptionsSaving || !newJobBenefitLabel.trim()}
                            >
                              <Plus className="h-4 w-4" />
                              Add and select
                            </button>
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
                                  onClick={() => handleOpenJobBenefitEditor(item.id, option)}
                                  className={[
                                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition",
                                    active
                                      ? "border-sky-300 bg-sky-50 text-sky-800 ring-2 ring-sky-100"
                                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                                  ].join(" ")}
                                >
                                  <span>{option.label || BENEFIT_TAG_LABELS[tag] || tag}</span>
                                  <PencilLine className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                              Nationalities we process
                            </div>
                            <button
                              type="button"
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
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
                            </button>
                          </div>
                          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
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
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100"
                                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                                    ].join(" ")}
                                  >
                                    <span aria-hidden="true">{toFlagEmoji(country.code)}</span>
                                    <span>{country.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                Add, rename, or remove countries
                              </div>
                              <button
                                type="button"
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                                onClick={() => void handleSaveJobCountryOptions()}
                                disabled={
                                  jobCountryOptionsSaving ||
                                  JSON.stringify(normalizeCountryOptions(jobCountryOptionsDraft)) ===
                                    JSON.stringify(normalizeCountryOptions(jobCountryOptions))
                                }
                              >
                                <Save className="h-3.5 w-3.5" />
                                {jobCountryOptionsSaving ? "Saving..." : "Save countries"}
                              </button>
                            </div>

                            <div className="mt-2 grid gap-2 md:grid-cols-[92px_minmax(0,1fr)_auto]">
                              <input
                                type="text"
                                value={newJobCountryCode}
                                onChange={(event) =>
                                  setNewJobCountryCode(event.target.value.toUpperCase())
                                }
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return;
                                  event.preventDefault();
                                  handleAddJobCountryOption();
                                }}
                                placeholder="Code"
                                maxLength={2}
                                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-extrabold uppercase tracking-wide text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                              />
                              <input
                                type="text"
                                value={newJobCountryName}
                                onChange={(event) => setNewJobCountryName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return;
                                  event.preventDefault();
                                  handleAddJobCountryOption();
                                }}
                                placeholder="Country name"
                                className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                              />
                              <button
                                type="button"
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-bold text-white transition hover:bg-sky-700 disabled:opacity-60"
                                onClick={handleAddJobCountryOption}
                                disabled={
                                  jobCountryOptionsSaving ||
                                  !normalizeCountryCode(newJobCountryCode || newJobCountryName) ||
                                  !newJobCountryName.trim()
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Add country
                              </button>
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {jobCountryOptionsDraft.map((country) => (
                                <div
                                  key={country.code}
                                  className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5"
                                >
                                  <div className="flex h-8 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-lg">
                                    {toFlagEmoji(country.code) || country.code}
                                  </div>
                                  <input
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
                                    className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                                  />
                                  <div className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-extrabold text-slate-500">
                                    {country.code}
                                  </div>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                                    aria-label={`Remove ${country.name}`}
                                    disabled={
                                      jobCountryOptionsSaving || jobCountryOptionsDraft.length <= 1
                                    }
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
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-3xl border border-slate-200 bg-white p-3">
                        <button
                          type="button"
                          className={[
                            "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-extrabold transition disabled:cursor-not-allowed",
                            hasChanges
                              ? "bg-gradient-to-r from-[#2f7de1] to-[#64c8ff] text-white shadow-lg shadow-sky-200/70 hover:brightness-105"
                              : "bg-slate-100 text-slate-400",
                          ].join(" ")}
                          onClick={() => void handleSaveJobCompany(item.id)}
                          disabled={isBusy || !hasChanges}
                        >
                          <Save className="h-4 w-4" />
                          {isBusy ? "Saving..." : hasChanges ? "Save changes" : "Saved"}
                        </button>
                        {hasChanges ? (
                          <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                            Changes are local until you save.
                          </div>
                        ) : null}
                        <label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
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
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                            onClick={() => void handleRemoveJobCompanyLogo(item.id)}
                            disabled={isBusy}
                          >
                            Remove logo
                          </button>
                        ) : null}
                        {jobCompanies.length > 1 ? (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
                              <GitMerge className="h-3.5 w-3.5" />
                              Merge company
                            </div>
                            <select
                              value={mergeTargetId}
                              disabled={isBusy}
                              onChange={(event) =>
                                setJobCompanyMergeTargets((prev) => ({
                                  ...prev,
                                  [item.id]: event.target.value,
                                }))
                              }
                              className="mt-2 h-10 w-full rounded-xl border border-amber-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                            >
                              {jobCompanies
                                .filter((candidate) => candidate.id !== item.id)
                                .map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.name}
                                  </option>
                                ))}
                            </select>
                            <div className="mt-2 text-[11px] font-semibold leading-5 text-amber-800">
                              Move {item.positionsCount} positions
                              {mergeTarget ? ` into ${mergeTarget.name}` : ""}. Undo is available from Recent merges.
                            </div>
                            <button
                              type="button"
                              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
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
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
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
      {mergeHistoryOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setMergeHistoryOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-sm font-extrabold text-slate-950">Merge history</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  Undo recent company merges from this list.
                </div>
              </div>
              <button
                type="button"
                className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                onClick={() => setMergeHistoryOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-auto px-5 py-4">
              {mergeHistoryItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No recent merges.
                </div>
              ) : (
                mergeHistoryItems.map((merge) => (
                  <div
                    key={merge.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="min-w-0 text-xs font-semibold text-slate-700">
                      <span className="font-extrabold text-slate-950">{merge.sourceName}</span>
                      {" into "}
                      <span className="font-extrabold text-slate-950">{merge.targetName}</span>
                      {" · "}
                      {merge.positionsMoved} positions
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                      onClick={() => void handleUndoJobCompanyMerge(merge.id)}
                      disabled={jobCompaniesActionId === `undo:${merge.id}`}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      {jobCompaniesActionId === `undo:${merge.id}` ? "Undoing..." : "Undo"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
      {editingJobBenefit && editingBenefitOption ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"
          onClick={handleCloseJobBenefitEditor}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-sm font-extrabold text-slate-950">Edit benefit</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">
                {editingBenefitCompany?.name ?? "Company benefit"}
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Benefit name
                </label>
                <input
                  type="text"
                  value={editingJobBenefitLabel}
                  onChange={(event) => setEditingJobBenefitLabel(event.target.value)}
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-950 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                />
              </div>
              <button
                type="button"
                className={[
                  "inline-flex h-11 w-full items-center justify-center rounded-2xl border px-4 text-sm font-bold transition",
                  editingBenefitSelected
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                ].join(" ")}
                onClick={handleToggleEditingBenefitSelection}
              >
                {editingBenefitSelected ? "Selected for this company" : "Not selected for this company"}
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                onClick={() => void handleDeleteEditingBenefit()}
                disabled={jobBenefitOptionsSaving || jobBenefitOptionsDraft.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                  onClick={handleCloseJobBenefitEditor}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  onClick={() => void handleSaveEditingBenefit()}
                  disabled={jobBenefitOptionsSaving}
                >
                  <Save className="h-4 w-4" />
                  {jobBenefitOptionsSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
