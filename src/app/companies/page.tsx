"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ExternalLink, Plus, RefreshCw } from "lucide-react";

import type { Candidate, Pipeline, Stage } from "@/app/pipeline/types";
import { pools, stages as defaultStages } from "@/app/pipeline/data";
import CandidateDrawer from "@/app/pipeline/components/CandidateDrawer";
import { getAvatarClass } from "@/app/pipeline/components/CandidateCard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Skeleton from "@/components/Skeleton";
import AddCompanyModal, {
  type AddCompanyPayload,
  type CompanyOwner,
} from "./components/AddCompanyModal";

const PAGE_LIMIT = 100;
const COMPANIES_PIPELINE_ID = "companies";
const DEFAULT_STAGE_ID = defaultStages[0]?.id ?? "consultation";
const CACHE_KEY = "ismira:companies:list:v1";
const PIPELINE_READY_KEY = "ismira:companies:pipeline-ready:v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
const OPEN_PROFILE_EVENT = "pipeline-open-profile";

type CandidateRow = {
  id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  pool_id: string | null;
  status: string | null;
  order: number | null;
  created_at: string | null;
  updated_at: string | null;
  data: Record<string, unknown> | null;
};

type AdminUser = CompanyOwner & {
  role?: string;
  status?: string;
  created_at?: string | null;
  avatar_path?: string | null;
};

type PipelineRow = { id: string; name: string };
type PipelineStageRow = { pipeline_id: string; id: string; name: string; order: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

type CompaniesCache = {
  savedAt: number;
  page: number;
  hasMore: boolean;
  companies: Candidate[];
};

const readCompaniesCache = (): CompaniesCache | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  const parsed = safeJsonParse(raw);
  if (!isRecord(parsed)) return null;
  const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
  if (!savedAt || Date.now() - savedAt > CACHE_TTL_MS) return null;
  const companies = Array.isArray(parsed.companies) ? (parsed.companies as Candidate[]) : [];
  return {
    savedAt,
    page: typeof parsed.page === "number" ? parsed.page : 0,
    hasMore: typeof parsed.hasMore === "boolean" ? parsed.hasMore : true,
    companies,
  };
};

const writeCompaniesCache = (cache: Omit<CompaniesCache, "savedAt">) => {
  if (typeof window === "undefined") return;
  try {
    const payload: CompaniesCache = { ...cache, savedAt: Date.now() };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
};

const clearCompaniesCache = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
};

const toExternalHref = (raw?: string | null) => {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, "");
  if (!normalized) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized)) return normalized;
  return `https://${normalized.replace(/^\/+/, "")}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const initialsFor = (value?: string | null) => {
  const safe = (value ?? "").trim();
  if (!safe) return "?";
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
};

const cloneStages = (source: Stage[]) =>
  source.map((stage, index) => ({
    ...stage,
    order: Number.isFinite(stage.order) ? stage.order : index,
  }));

const companiesPipeline: Pipeline = {
  id: COMPANIES_PIPELINE_ID,
  name: "Companies",
  stages: cloneStages(defaultStages),
};

const mapCandidateRow = (row: CandidateRow): Candidate => {
  const data = (row.data ?? {}) as Partial<Candidate>;
  const safe = isRecord(data) ? data : {};
  return {
    ...(safe as Partial<Candidate>),
    id: row.id,
    name: typeof safe.name === "string" ? safe.name : "",
    email: typeof safe.email === "string" ? safe.email : "",
    pipeline_id: row.pipeline_id ?? safe.pipeline_id ?? COMPANIES_PIPELINE_ID,
    stage_id: row.stage_id ?? safe.stage_id ?? DEFAULT_STAGE_ID,
    pool_id: row.pool_id ?? safe.pool_id ?? pools[0]?.id ?? "roomy",
    status: (row.status as Candidate["status"]) ?? safe.status ?? "active",
    order: typeof row.order === "number" ? row.order : safe.order ?? 0,
    created_at: row.created_at ?? safe.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? safe.updated_at ?? new Date().toISOString(),
  };
};

const buildCandidateRow = (candidate: Candidate) => {
  const {
    id,
    pipeline_id,
    stage_id,
    pool_id,
    status,
    order,
    created_at,
    updated_at,
    ...data
  } = candidate;
  const sanitized = { ...(data as Record<string, unknown>) };
  delete sanitized.tasks;
  delete sanitized.work_history;
  delete sanitized.education;
  delete sanitized.attachments;
  delete sanitized.scorecard;
  delete sanitized.questionnaires_sent;
  return {
    id,
    pipeline_id,
    stage_id,
    pool_id,
    status,
    order,
    created_at,
    updated_at,
    data: sanitized,
  };
};

export default function CompaniesPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [companies, setCompanies] = useState<Candidate[]>([]);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number | null>>(
    {}
  );
  const [profileDrawerCandidate, setProfileDrawerCandidate] = useState<Candidate | null>(null);
  const [profileDrawerLoading, setProfileDrawerLoading] = useState(false);
  const [profileDrawerError, setProfileDrawerError] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [pipelinesError, setPipelinesError] = useState<string | null>(null);
  const pipelinesLoadedRef = useRef(false);
  const returnCompanyIdRef = useRef<string | null>(null);
  const switchingProfileRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [drawerCompanyId, setDrawerCompanyId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [owners, setOwners] = useState<AdminUser[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    id?: string;
    name?: string;
    email?: string;
    avatar_url?: string | null;
  } | null>(null);
  const pipelineEnsuredRef = useRef(false);

  const ownersById = useMemo(() => {
    const map = new Map<string, AdminUser>();
    owners.forEach((user) => {
      map.set(user.id, user);
    });
    return map;
  }, [owners]);

  const drawerCompany = useMemo(
    () => companies.find((company) => company.id === drawerCompanyId) ?? null,
    [companies, drawerCompanyId]
  );

  const profileDrawerPipelines = useMemo(() => {
    if (!profileDrawerCandidate) return pipelines;
    const hasPipeline = pipelines.some((pipeline) => pipeline.id === profileDrawerCandidate.pipeline_id);
    if (hasPipeline) return pipelines;
    return [
      ...pipelines,
      {
        id: profileDrawerCandidate.pipeline_id,
        name: profileDrawerCandidate.pipeline_id,
        stages: cloneStages(defaultStages),
      },
    ];
  }, [pipelines, profileDrawerCandidate]);

  const profileDrawerStages = useMemo(() => {
    if (!profileDrawerCandidate) return cloneStages(defaultStages);
    return (
      profileDrawerPipelines.find((pipeline) => pipeline.id === profileDrawerCandidate.pipeline_id)?.stages ??
      cloneStages(defaultStages)
    );
  }, [profileDrawerCandidate, profileDrawerPipelines]);

  const loadPipelinesOnce = useCallback(async () => {
    if (pipelinesLoadedRef.current) return;
    pipelinesLoadedRef.current = true;
    setPipelinesLoading(true);
    setPipelinesError(null);
    try {
      const [{ data: pipelineRows, error: pipelinesLoadError }, { data: stageRows, error: stagesLoadError }] =
        await Promise.all([
          supabase.from("pipelines").select("id,name").order("created_at", { ascending: true }),
          supabase.from("pipeline_stages").select("pipeline_id,id,name,order"),
        ]);
      if (pipelinesLoadError) throw new Error(pipelinesLoadError.message);
      if (stagesLoadError) throw new Error(stagesLoadError.message);

      const stageMap = new Map<string, Stage[]>();
      ((stageRows as PipelineStageRow[] | null) ?? []).forEach((row) => {
        const list = stageMap.get(row.pipeline_id) ?? [];
        list.push({
          id: row.id,
          name: row.name,
          order: row.order,
        });
        stageMap.set(row.pipeline_id, list);
      });
      const built = (((pipelineRows as PipelineRow[] | null) ?? [])).map((row) => {
        const stages = (stageMap.get(row.id) ?? []).slice().sort((a, b) => a.order - b.order);
        return {
          id: row.id,
          name: row.name,
          stages: stages.length > 0 ? stages : cloneStages(defaultStages),
        } satisfies Pipeline;
      });
      setPipelines(built);
    } catch (err) {
      pipelinesLoadedRef.current = false;
      setPipelinesError(err instanceof Error ? err.message : "Failed to load pipelines");
    } finally {
      setPipelinesLoading(false);
    }
  }, [supabase]);

  const openProfileDrawerById = useCallback(
    async (candidateId: string) => {
      const trimmed = candidateId.trim();
      if (!trimmed) return false;
      setProfileDrawerError(null);
      setProfileDrawerLoading(true);
      try {
        await loadPipelinesOnce();
        const { data, error: candidateLoadError } = await supabase
          .from("candidates")
          .select("id,pipeline_id,stage_id,pool_id,status,order,created_at,updated_at,data")
          .eq("id", trimmed)
          .maybeSingle();
        if (candidateLoadError) throw new Error(candidateLoadError.message);
        if (!data) throw new Error("Profile not found");
        setProfileDrawerCandidate(mapCandidateRow(data as CandidateRow));
        return true;
      } catch (err) {
        setProfileDrawerError(err instanceof Error ? err.message : "Failed to open profile");
        setProfileDrawerCandidate(null);
        return false;
      } finally {
        setProfileDrawerLoading(false);
      }
    },
    [loadPipelinesOnce, supabase]
  );

  const saveProfileCandidate = useCallback(
    async (candidate: Candidate) => {
      await supabase.from("candidates").upsert(buildCandidateRow(candidate), {
        onConflict: "id",
      });
    },
    [supabase]
  );

  const handleUpdateProfileCandidate = useCallback(
    (candidateId: string, updates: Partial<Candidate>) => {
      if (!candidateId) return;
      let updated: Candidate | null = null;
      setProfileDrawerCandidate((prev) => {
        if (!prev || prev.id !== candidateId) return prev;
        updated = { ...prev, ...updates, updated_at: new Date().toISOString() };
        return updated;
      });
      if (updated) {
        void saveProfileCandidate(updated);
      }
    },
    [saveProfileCandidate]
  );

  const handleHydrateProfileCandidate = useCallback(
    (candidateId: string, updates: Partial<Candidate>) => {
      if (!candidateId) return;
      setProfileDrawerCandidate((prev) => {
        if (!prev || prev.id !== candidateId) return prev;
        return { ...prev, ...updates };
      });
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ candidateId?: string }>).detail;
      const candidateId = detail?.candidateId?.trim();
      if (!candidateId) return;
      if (switchingProfileRef.current) return;
      switchingProfileRef.current = true;

      void (async () => {
        const closeDelayMs = 170;
        const openDelayMs = 40;
        const companyId = drawerCompanyId;

        if (companyId) {
          returnCompanyIdRef.current = companyId;
          setDrawerCompanyId(null);
          await new Promise((resolve) => window.setTimeout(resolve, closeDelayMs));
        } else {
          returnCompanyIdRef.current = null;
        }

        await new Promise((resolve) => window.setTimeout(resolve, openDelayMs));
        const ok = await openProfileDrawerById(candidateId);
        if (!ok && returnCompanyIdRef.current) {
          const fallbackCompanyId = returnCompanyIdRef.current;
          returnCompanyIdRef.current = null;
          setDrawerCompanyId(fallbackCompanyId);
        }
        switchingProfileRef.current = false;
      })();
    };
    window.addEventListener(OPEN_PROFILE_EVENT, handler as EventListener);
    return () => window.removeEventListener(OPEN_PROFILE_EVENT, handler as EventListener);
  }, [drawerCompanyId, openProfileDrawerById]);

  const ensureCompaniesPipeline = useCallback(async () => {
    await supabase
      .from("pipelines")
      .upsert(
        { id: companiesPipeline.id, name: companiesPipeline.name },
        { onConflict: "id" }
      );
    const stageRows = companiesPipeline.stages.map((stage) => ({
      pipeline_id: companiesPipeline.id,
      id: stage.id,
      name: stage.name,
      order: stage.order,
    }));
    if (stageRows.length > 0) {
      await supabase
        .from("pipeline_stages")
        .upsert(stageRows, { onConflict: "pipeline_id,id" });
    }
  }, [supabase]);

  const ensureCompaniesPipelineOnce = useCallback(async () => {
    if (pipelineEnsuredRef.current) return;
    pipelineEnsuredRef.current = true;
    if (typeof window !== "undefined") {
      const already = window.localStorage.getItem(PIPELINE_READY_KEY);
      if (already === "1") return;
    }
    try {
      await ensureCompaniesPipeline();
      if (typeof window !== "undefined") window.localStorage.setItem(PIPELINE_READY_KEY, "1");
    } catch {
      // ignore (pipeline is expected to exist via SQL migration)
    }
  }, [ensureCompaniesPipeline]);

  const saveCompany = useCallback(
    async (company: Candidate) => {
      await supabase.from("candidates").upsert(buildCandidateRow(company), {
        onConflict: "id",
      });
    },
    [supabase]
  );

  const loadAssignedCounts = useCallback(
    async (companyIds: string[], mode: "replace" | "merge") => {
      const ids = Array.from(
        new Set(companyIds.map((id) => id.trim()).filter(Boolean))
      );

      const pending: Record<string, number | null> = {};
      ids.forEach((id) => {
        pending[id] = null;
      });

      if (mode === "replace") {
        setAssignedCounts(pending);
      } else if (ids.length > 0) {
        setAssignedCounts((prev) => ({ ...prev, ...pending }));
      }

      if (ids.length === 0) return;

      try {
        const { data, error } = await supabase
          .from("candidates")
          .select("id,data")
          .neq("pipeline_id", COMPANIES_PIPELINE_ID)
          .in("data->>assigned_company_id", ids)
          .limit(10000);
        if (error) throw new Error(error.message);

        const counts: Record<string, number> = {};
        ids.forEach((id) => {
          counts[id] = 0;
        });

        (data ?? []).forEach((row) => {
          const payload =
            row && typeof row === "object" && "data" in row
              ? ((row as { data?: unknown }).data as unknown)
              : null;
          const record =
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? (payload as Record<string, unknown>)
              : null;
          const assignedId =
            record && typeof record.assigned_company_id === "string"
              ? record.assigned_company_id.trim()
              : "";
          if (!assignedId) return;
          if (!(assignedId in counts)) return;
          counts[assignedId] += 1;
        });

        setAssignedCounts((prev) => {
          const next: Record<string, number | null> =
            mode === "replace" ? {} : { ...prev };
          ids.forEach((id) => {
            next[id] = counts[id] ?? 0;
          });
          return next;
        });
      } catch {
        setAssignedCounts((prev) => {
          const next: Record<string, number | null> =
            mode === "replace" ? {} : { ...prev };
          ids.forEach((id) => {
            next[id] = 0;
          });
          return next;
        });
      }
    },
    [supabase]
  );

  const loadOwners = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      const list = Array.isArray(data?.users) ? (data.users as AdminUser[]) : [];
      setOwners(
        list.map((user) => ({
          id: user.id,
          name: user.name ?? "",
          email: user.email ?? "",
          avatar_url: user.avatar_url ?? null,
          role: user.role ?? undefined,
          status: user.status ?? undefined,
          created_at: user.created_at ?? null,
          avatar_path: user.avatar_path ?? null,
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;
      const metadata = (user.user_metadata as Record<string, unknown> | null) ?? {};
      const first = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
      const last = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
      const full = [first, last].filter(Boolean).join(" ").trim();
      const name =
        full ||
        (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
        user.email ||
        "Profile";
      setCurrentUser({
        id: user.id,
        name,
        email: user.email ?? undefined,
        avatar_url:
          typeof metadata.avatar_url === "string" ? (metadata.avatar_url as string) : null,
      });
    } catch {
      // ignore
    }
  }, [supabase]);

  const loadCompanies = useCallback(
    async (silent = false, options?: { page?: number; append?: boolean }) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const pageIndex =
          typeof options?.page === "number" && Number.isFinite(options.page)
            ? Math.max(0, Math.floor(options.page))
            : 0;
        const offset = pageIndex * PAGE_LIMIT;
        const append = options?.append === true;
        const { data, error } = await supabase
          .from("candidates")
          .select(
            "id,pipeline_id,stage_id,pool_id,status,order,created_at,updated_at,data"
          )
          .eq("pipeline_id", COMPANIES_PIPELINE_ID)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + PAGE_LIMIT - 1);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as CandidateRow[];
        const mapped = rows.map(mapCandidateRow);
        setHasMore(mapped.length === PAGE_LIMIT);
        setPage(pageIndex);
        void loadAssignedCounts(
          mapped.map((item) => item.id),
          append ? "merge" : "replace"
        );
        if (append) {
          setCompanies((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            const merged = [...prev];
            mapped.forEach((item) => {
              if (!seen.has(item.id)) merged.push(item);
            });
            writeCompaniesCache({
              companies: merged,
              page: pageIndex,
              hasMore: mapped.length === PAGE_LIMIT,
            });
            return merged;
          });
        } else {
          setCompanies(mapped);
          writeCompaniesCache({
            companies: mapped,
            page: pageIndex,
            hasMore: mapped.length === PAGE_LIMIT,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load companies");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [loadAssignedCounts, supabase]
  );

  useEffect(() => {
    const cached = readCompaniesCache();
    if (cached) {
      setCompanies(cached.companies);
      setPage(cached.page);
      setHasMore(cached.hasMore);
      void loadAssignedCounts(
        cached.companies.map((item) => item.id),
        "replace"
      );
      return;
    }
    void loadCompanies();
  }, [loadAssignedCounts, loadCompanies]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setHasMore(true);
    clearCompaniesCache();
    await loadCompanies(true, { page: 0, append: false });
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (loadingMore || loading || refreshing || !hasMore) return;
    setLoadingMore(true);
    try {
      await loadCompanies(true, { page: page + 1, append: true });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleUpdateCompany = useCallback(
    (companyId: string, updates: Partial<Candidate>) => {
      if (!companyId) return;
      let updated: Candidate | null = null;
      setCompanies((prev) =>
        prev.map((company) => {
          if (company.id !== companyId) return company;
          updated = {
            ...company,
            ...updates,
            updated_at: new Date().toISOString(),
          };
          return updated;
        })
      );
      if (updated) {
        void saveCompany(updated);
      }
    },
    [saveCompany]
  );

  const handleHydrateCompany = useCallback(
    (companyId: string, updates: Partial<Candidate>) => {
      if (!companyId) return;
      setCompanies((prev) =>
        prev.map((company) =>
          company.id === companyId ? { ...company, ...updates } : company
        )
      );
    },
    []
  );

  const handleAddCompany = useCallback(
    async (payload: AddCompanyPayload) => {
      const now = new Date().toISOString();
      const ownerMatch = payload.owner_id
        ? ownersById.get(payload.owner_id)
        : null;
      const next: Candidate = {
        id: crypto.randomUUID(),
        pipeline_id: COMPANIES_PIPELINE_ID,
        stage_id: DEFAULT_STAGE_ID,
        pool_id: pools[0]?.id ?? "roomy",
        status: "active",
        order: 0,
        created_at: now,
        updated_at: now,
        name: payload.name,
        email: "",
        website_url: payload.website_url,
        phone: payload.phone,
        country: payload.country,
        city: payload.city,
        industry: payload.industry,
        company_owner: payload.owner_name ?? ownerMatch?.name ?? undefined,
        company_owner_id: payload.owner_id ?? ownerMatch?.id ?? undefined,
      };

      setCompanies((prev) => {
        const merged = [next, ...prev];
        writeCompaniesCache({ companies: merged, page, hasMore });
        return merged;
      });
      try {
        await ensureCompaniesPipelineOnce();
        await saveCompany(next);
      } catch {
        // ignore
      }
    },
    [ensureCompaniesPipelineOnce, hasMore, ownersById, page, saveCompany]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200/70 px-6 py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">
                  Companies
                </h1>
                <p className="text-xs text-slate-500">
                  Manage company profiles and activity.
                </p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:mr-16">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={handleRefresh}
              disabled={refreshing || loading}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
              onClick={() => {
                setAddModalOpen(true);
                if (owners.length === 0) void loadOwners();
                if (!currentUser) void loadCurrentUser();
              }}
            >
              <Plus className="h-4 w-4" />
              Add company
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

	        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
	          <div className="overflow-auto">
	            <table className="w-full min-w-[920px] table-fixed border-collapse">
	              <colgroup>
	                <col className="w-[260px]" />
	                <col className="w-[90px]" />
	                <col className="w-[120px]" />
	                <col className="w-[120px]" />
	                <col className="w-[120px]" />
	                <col className="w-[120px]" />
	              </colgroup>
	              <thead className="bg-slate-50">
	                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
	                  <th className="px-4 py-3">Company name</th>
	                  <th className="px-4 py-3">Assigned</th>
	                  <th className="px-4 py-3">Create date</th>
	                  <th className="px-4 py-3">Phone number</th>
	                  <th className="px-4 py-3">City</th>
	                  <th className="px-4 py-3">Industry</th>
	                </tr>
	              </thead>
	              <tbody className="divide-y divide-slate-200">
	                {loading ? (
	                  Array.from({ length: 8 }).map((_, idx) => (
	                    <tr key={`sk-${idx}`}>
	                      <td className="px-4 py-3">
	                        <Skeleton className="h-4 w-48" />
	                      </td>
	                      <td className="px-4 py-3">
	                        <Skeleton className="h-4 w-10" />
	                      </td>
	                      <td className="px-4 py-3">
	                        <Skeleton className="h-4 w-28" />
	                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
	                      <td className="px-4 py-3">
	                        <Skeleton className="h-4 w-28" />
	                      </td>
	                      <td className="px-4 py-3">
	                        <Skeleton className="h-4 w-24" />
	                      </td>
	                    </tr>
	                  ))
	                ) : companies.length === 0 ? (
	                  <tr>
	                    <td
	                      colSpan={6}
	                      className="px-6 py-14 text-center text-sm text-slate-500"
	                    >
	                      No companies yet. Click “Add company” to create one.
	                    </td>
	                  </tr>
	                ) : (
	                  companies.map((company) => {
	                    const companyBadgeClass = getAvatarClass(company.name);
	                    const assigned = assignedCounts[company.id];
	                    return (
	                      <tr key={company.id} className="text-sm text-slate-700">
	                        <td className="px-4 py-3">
	                          <button
	                            type="button"
                            className="group flex w-full items-center gap-3 text-left"
                            onClick={() => setDrawerCompanyId(company.id)}
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold ring-1 ring-black/5 ${companyBadgeClass}`}
                            >
                              {company.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={company.avatar_url}
                                  alt={company.name || "Company"}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                initialsFor(company.name)
                              )}
                            </span>
                            <span className="min-w-0 overflow-hidden">
                              <span className="block truncate font-semibold text-emerald-700 group-hover:underline">
                                {company.name || "Untitled company"}
                              </span>
                              {company.website_url ? (
                                <a
                                  href={toExternalHref(company.website_url) ?? undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex max-w-full items-center gap-1 truncate text-sm text-slate-500 hover:text-emerald-700 hover:underline"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <span className="truncate">{company.website_url}</span>
                                  <ExternalLink className="h-4 w-4 shrink-0" />
                                </a>
                              ) : null}
	                            </span>
	                          </button>
	                        </td>
	                        <td className="px-4 py-3">
	                          {typeof assigned === "number" ? (
	                            <span
	                              className={`inline-flex min-w-[34px] justify-center rounded-full px-2 py-1 text-xs font-semibold ${
	                                assigned > 0
	                                  ? "bg-emerald-50 text-emerald-700"
	                                  : "bg-slate-100 text-slate-500"
	                              }`}
	                            >
	                              {assigned}
	                            </span>
	                          ) : (
	                            <span className="text-slate-400">…</span>
	                          )}
	                        </td>
	                        <td className="px-4 py-3 text-xs text-slate-500">
	                          {formatDateTime(company.created_at)}
	                        </td>
	                        <td className="px-4 py-3">
	                          {company.phone ? (
                            <span className="text-emerald-700">{company.phone}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{company.city || "—"}</td>
                        <td className="px-4 py-3">{company.industry || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {!loading && companies.length > 0 ? (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={handleLoadMore}
              disabled={!hasMore || loadingMore || loading || refreshing}
            >
              {loadingMore ? "Loading…" : hasMore ? "Load more" : "All loaded"}
            </button>
            <span className="text-xs text-slate-400">Showing {companies.length}</span>
          </div>
        ) : null}
      </div>

      <AddCompanyModal
        open={addModalOpen}
        owners={owners}
        defaultOwner={currentUser}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddCompany}
      />

      <CandidateDrawer
        open={!!drawerCompany}
        candidate={drawerCompany}
        sharePath={null}
        stages={companiesPipeline.stages}
        pipelines={[companiesPipeline]}
        requestedRightTab={null}
        onClose={() => setDrawerCompanyId(null)}
        onStageChange={(stageId) => {
          if (!drawerCompany) return;
          handleUpdateCompany(drawerCompany.id, { stage_id: stageId });
        }}
        onPipelineChange={() => {
          // keep companies in the Companies pipeline
        }}
        onUpdateCandidate={handleUpdateCompany}
        onHydrateCandidate={handleHydrateCompany}
        currentUser={currentUser}
      />

      <CandidateDrawer
        open={Boolean(profileDrawerCandidate)}
        candidate={profileDrawerCandidate}
        sharePath={null}
        stages={profileDrawerStages}
        pipelines={profileDrawerPipelines.length > 0 ? profileDrawerPipelines : []}
        requestedRightTab={null}
        onClose={() => {
          const reopenCompanyId = returnCompanyIdRef.current;
          returnCompanyIdRef.current = null;
          setProfileDrawerCandidate(null);
          if (reopenCompanyId) {
            window.setTimeout(() => {
              setDrawerCompanyId(reopenCompanyId);
            }, 170);
          }
        }}
        onStageChange={(stageId) => {
          if (!profileDrawerCandidate) return;
          handleUpdateProfileCandidate(profileDrawerCandidate.id, { stage_id: stageId });
        }}
        onPipelineChange={(pipelineId) => {
          if (!profileDrawerCandidate) return;
          const nextPipelineId = pipelineId.trim();
          if (!nextPipelineId) return;
          const nextStages =
            profileDrawerPipelines.find((p) => p.id === nextPipelineId)?.stages ??
            cloneStages(defaultStages);
          handleUpdateProfileCandidate(profileDrawerCandidate.id, {
            pipeline_id: nextPipelineId,
            stage_id: nextStages[0]?.id ?? profileDrawerCandidate.stage_id,
          });
        }}
        onUpdateCandidate={handleUpdateProfileCandidate}
        onHydrateCandidate={handleHydrateProfileCandidate}
        currentUser={currentUser}
      />
    </div>
  );
}
