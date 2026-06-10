"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, GitMerge, Plus, Save, Trash2, Undo2, Upload } from "lucide-react";

import { AVAILABLE_BENEFIT_TAGS, BENEFIT_TAG_LABELS, type BenefitTag } from "@/lib/job-benefits";
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
  const [jobCompanyNameDrafts, setJobCompanyNameDrafts] = useState<Record<string, string>>({});
  const [jobCompanyShipTypeDrafts, setJobCompanyShipTypeDrafts] = useState<Record<string, JobShipType[]>>({});
  const [jobCompanyBenefitDrafts, setJobCompanyBenefitDrafts] = useState<Record<string, BenefitTag[]>>({});

  const loadJobCompanies = useCallback(async () => {
    setJobCompaniesLoading(true);
    setJobCompaniesError(null);
    try {
      const res = await fetch("/api/company/job-companies", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load job companies.");
      }
      const list: unknown[] = Array.isArray(data?.companies) ? (data.companies as unknown[]) : [];
      const nextCompanies = list.map((item) => {
          const row = isRecord(item) ? item : {};
          const positionsCount = row.positionsCount;
          const benefitTagsRaw = Array.isArray(row.benefitTags) ? row.benefitTags : [];
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
                typeof tag === "string" && AVAILABLE_BENEFIT_TAGS.includes(tag as BenefitTag)
            ),
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
                    AVAILABLE_BENEFIT_TAGS.includes(tag as BenefitTag)
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

  const handleSaveJobCompany = useCallback(
    async (jobCompanyId: string) => {
      const name = (jobCompanyNameDrafts[jobCompanyId] ?? "").trim();
      const benefitTags = normalizeBenefitTagList(jobCompanyBenefitDrafts[jobCompanyId] ?? []);
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
    [jobCompanyBenefitDrafts, jobCompanyNameDrafts, jobCompanyShipTypeDrafts, loadJobCompanies]
  );

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
        <button
          type="button"
          className="h-10 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
          onClick={handleSyncJobCompanies}
          disabled={jobCompaniesSyncing}
        >
          {jobCompaniesSyncing ? "Syncing..." : "Sync companies"}
        </button>
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

      {lastJobCompanyMerge ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold text-emerald-800">
            {lastJobCompanyMerge.sourceName} was merged into {lastJobCompanyMerge.targetName}.{" "}
            {lastJobCompanyMerge.positionsMoved} positions moved.
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60"
            onClick={() => void handleUndoJobCompanyMerge(lastJobCompanyMerge.id)}
            disabled={jobCompaniesActionId === `undo:${lastJobCompanyMerge.id}`}
          >
            <Undo2 className="h-4 w-4" />
            {jobCompaniesActionId === `undo:${lastJobCompanyMerge.id}` ? "Undoing..." : "Undo merge"}
          </button>
        </div>
      ) : recentJobCompanyMerges.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Recent merges
          </div>
          <div className="mt-2 space-y-2">
            {recentJobCompanyMerges.map((merge) => (
              <div
                key={merge.id}
                className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600"
              >
                <span>
                  {merge.sourceName} into {merge.targetName} · {merge.positionsMoved} positions
                </span>
                <button
                  type="button"
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] font-bold text-slate-700 transition hover:bg-white disabled:opacity-60"
                  onClick={() => void handleUndoJobCompanyMerge(merge.id)}
                  disabled={jobCompaniesActionId === `undo:${merge.id}`}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {jobCompaniesActionId === `undo:${merge.id}` ? "Undoing..." : "Undo"}
                </button>
              </div>
            ))}
          </div>
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
            const mergeTargetId = jobCompanyMergeTargets[item.id] ?? "";
            const mergeTarget = jobCompanies.find((candidate) => candidate.id === mergeTargetId);
            const hasChanges =
              draftName.trim() !== item.name.trim() ||
              !sameJobShipTypeSelection(draftShipTypes, item.shipTypes) ||
              !sameBenefitTagSelection(draftBenefitTags, item.benefitTags);
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
                          <div className="mt-2 flex flex-wrap gap-2">
                            {AVAILABLE_BENEFIT_TAGS.map((tag) => {
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
                                    "rounded-full border px-3.5 py-2 text-xs font-bold transition",
                                    active
                                      ? "border-sky-300 bg-sky-50 text-sky-800 ring-2 ring-sky-100"
                                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                                  ].join(" ")}
                                >
                                  {BENEFIT_TAG_LABELS[tag]}
                                </button>
                              );
                            })}
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
    </section>
  );
}
