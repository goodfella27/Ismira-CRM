"use client";

import { useWorkspaceRequests } from "@/components/workspace-data-provider";

import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { NativeSelect as UiSelect } from "@/components/ui/select";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  ClipboardList,
  Database,
  FileText,
  FolderKanban,
  GitMerge,
  ListTodo,
  PencilLine,
  Plus,
  Save,
  Shield,
  Trash2,
  Undo2,
  Upload,
  Users2,
  X,
} from "lucide-react";
import { stages } from "@/app/pipeline/data";
import type { Pipeline, Stage } from "@/app/pipeline/types";
import {
  buildQuestionnaireId,
  DEFAULT_QUESTIONNAIRES,
  type Questionnaire,
  type QuestionnaireStatus,
} from "@/lib/questionnaires";
import { AVAILABLE_BENEFIT_TAGS, BENEFIT_TAG_LABELS, type BenefitTag } from "@/lib/job-benefits";
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
import { toFlagEmoji } from "@/lib/country";
import {
  DEFAULT_JOB_COUNTRY_OPTIONS,
  normalizeCountryCode,
  normalizeCountryOptions,
  type JobCountryOption,
} from "@/lib/job-country-options";
import { JOB_SHIP_TYPE_LABELS, JOB_SHIP_TYPES, normalizeJobShipType, normalizeJobShipTypes, type JobShipType } from "@/lib/job-ship-types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureCompanyBootstrap } from "@/lib/company/bootstrap-client";
import {
  getCompanyBranding,
  invalidateCompanyBrandingCache,
} from "@/lib/company-branding-client";
import { notifyJobCompanyLogosChanged } from "@/lib/job-company-logo-events";

type SectionId =
  | "overview"
  | "users"
  | "tasks"
  | "positions"
  | "questionnaires"
  | "forms"
  | "permissions"
  | "integrations"
  | "notifications"
  | "storage";

type CompanyUserStatus = "active" | "pending";

type CompanyUser = {
  id: string;
  name: string;
  role: string;
  email: string;
  avatar_url: string | null;
  status: CompanyUserStatus;
  created_at?: string | null;
};

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

type JobsHeroLogoAdminItem = {
  id: string;
  label: string;
  logoUrl: string | null;
  sortOrder: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type PipelineRow = {
  id: string;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type StageRow = {
  pipeline_id: string;
  id: string;
  name: string;
  order: number;
  created_at?: string | null;
};

const sections = [
  {
    id: "overview",
    label: "Overview",
    description: "Company profile & branding",
    icon: Building2,
  },
  {
    id: "users",
    label: "Users",
    description: "Manage team members",
    icon: Users2,
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "Task watchers",
    icon: ListTodo,
  },
  {
    id: "positions",
    label: "Position",
    description: "Pipeline or Pool",
    icon: ClipboardList,
  },
  {
    id: "questionnaires",
    label: "Questionnaires",
    description: "Create and manage questionnaires",
    icon: ClipboardList,
  },
  {
    id: "forms",
    label: "Forms",
    description: "Intake forms & templates",
    icon: FileText,
  },
  {
    id: "permissions",
    label: "Permissions",
    description: "Roles and access control",
    icon: Shield,
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "External services",
    icon: Database,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Email & SMS settings",
    icon: Bell,
  },
  {
    id: "storage",
    label: "Storage",
    description: "Documents & retention",
    icon: Database,
  },
] as const;

const cloneStages = (source: Stage[]) =>
  source.map((stage, index) => ({
    ...stage,
    order: Number.isFinite(stage.order) ? stage.order : index,
  }));

const buildDefaultPipelines = (): Pipeline[] => [
  {
    id: "mailerlite",
    name: "MailerLite",
    stages: cloneStages(stages),
  },
  {
    id: "breezy",
    name: "Breezy",
    stages: cloneStages(stages),
  },
  {
    id: "companies",
    name: "Companies",
    stages: cloneStages(stages),
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const buildUniqueId = (base: string, existing: Set<string>) => {
  const normalized = slugify(base) || "pipeline";
  if (!existing.has(normalized)) return normalized;
  let index = 2;
  while (existing.has(`${normalized}-${index}`)) {
    index += 1;
  }
  return `${normalized}-${index}`;
};

const buildPipelinesFromRows = (
  pipelineRows: PipelineRow[],
  stageRows: StageRow[]
): Pipeline[] => {
  const pipelineMap = new Map<string, Pipeline>();
  pipelineRows.forEach((row) => {
    pipelineMap.set(row.id, {
      id: row.id,
      name: row.name,
      stages: [],
    });
  });
  stageRows.forEach((stage) => {
    const pipeline = pipelineMap.get(stage.pipeline_id);
    if (!pipeline) return;
    pipeline.stages.push({
      id: stage.id,
      name: stage.name,
      order: Number.isFinite(stage.order) ? stage.order : 0,
    });
  });
  return Array.from(pipelineMap.values()).map((pipeline) => ({
    ...pipeline,
    stages: [...pipeline.stages].sort((a, b) => a.order - b.order),
  }));
};

const getApiErrorMessage = (payload: unknown, fallback: string) => {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== "object") return fallback;

  const record = payload as Record<string, unknown>;
  const directMessage = record.message;
  if (typeof directMessage === "string" && directMessage.trim()) return directMessage.trim();

  const errorValue = record.error;
  if (typeof errorValue === "string" && errorValue.trim()) return errorValue.trim();
  if (errorValue && typeof errorValue === "object") {
    const nested = errorValue as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim();
    if (typeof nested.error === "string" && nested.error.trim()) return nested.error.trim();
  }

  return fallback;
};

const normalizeBenefitTagList = (value: BenefitTag[]) =>
  [...new Set(value)].sort((a, b) => a.localeCompare(b));

const sameBenefitTagSelection = (left: BenefitTag[], right: BenefitTag[]) =>
  JSON.stringify(normalizeBenefitTagList(left)) === JSON.stringify(normalizeBenefitTagList(right));

const sameJobShipTypeSelection = (left: JobShipType[], right: JobShipType[]) =>
  JSON.stringify(normalizeJobShipTypes(left)) === JSON.stringify(normalizeJobShipTypes(right));

const sameCountryOptions = (left: JobCountryOption[], right: JobCountryOption[]) =>
  JSON.stringify(normalizeCountryOptions(left)) === JSON.stringify(normalizeCountryOptions(right));

const normalizeCountryCodeList = (value: string[]) =>
  [...new Set(value.map((code) => normalizeCountryCode(code)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

const sameCountryCodeSelection = (left: string[], right: string[]) =>
  JSON.stringify(normalizeCountryCodeList(left)) === JSON.stringify(normalizeCountryCodeList(right));


export default function CompanyPage() {
  const { request: workspaceFetch } = useWorkspaceRequests();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [brandingTitle, setBrandingTitle] = useState("ISMIRA CRM");
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);
  const [brandingLogoFile, setBrandingLogoFile] = useState<File | null>(null);
  const [brandingLogoDraftUrl, setBrandingLogoDraftUrl] = useState<string | null>(
    null
  );
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [jobsHeroLogos, setJobsHeroLogos] = useState<JobsHeroLogoAdminItem[]>([]);
  const [jobsHeroLogosLoading, setJobsHeroLogosLoading] = useState(false);
  const [jobsHeroLogosError, setJobsHeroLogosError] = useState<string | null>(null);
  const [jobsHeroLogosActionId, setJobsHeroLogosActionId] = useState<string | null>(null);
  const [jobsHeroLogosReordering, setJobsHeroLogosReordering] = useState(false);
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
  const [jobCompanyOpeningTypeDrafts, setJobCompanyOpeningTypeDrafts] = useState<
    Record<string, string>
  >({});
  const [jobCompanyBenefitDrafts, setJobCompanyBenefitDrafts] = useState<
    Record<string, BenefitTag[]>
  >({});
  const [jobCompanyCountryDrafts, setJobCompanyCountryDrafts] = useState<
    Record<string, string[]>
  >({});
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
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineName, setPipelineName] = useState("");
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>(
    DEFAULT_QUESTIONNAIRES
  );
  const [isQuestionnaireModalOpen, setIsQuestionnaireModalOpen] =
    useState(false);
  const [questionnaireName, setQuestionnaireName] = useState("");
  const [questionnaireStatus, setQuestionnaireStatus] =
    useState<QuestionnaireStatus>("Draft");
  const [questionnaireError, setQuestionnaireError] = useState<string | null>(
    null
  );
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Member Basic");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [userActionId, setUserActionId] = useState<string | null>(null);
  const [taskWatchersCompanyId, setTaskWatchersCompanyId] = useState<string | null>(
    null
  );
  const [taskWatcherIds, setTaskWatcherIds] = useState<string[]>([]);
  const [taskWatcherSearch, setTaskWatcherSearch] = useState("");
  const [taskWatchersLoading, setTaskWatchersLoading] = useState(false);
  const [taskWatchersError, setTaskWatchersError] = useState<string | null>(null);
  const [taskWatchersSavingId, setTaskWatchersSavingId] = useState<string | null>(
    null
  );
  const [expandedPipelineId, setExpandedPipelineId] = useState<string | null>(
    null
  );
  const [stageDraftByPipeline, setStageDraftByPipeline] = useState<
    Record<string, string>
  >({});
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [draggingPipelineId, setDraggingPipelineId] = useState<string | null>(
    null
  );
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [integrationsWarning, setIntegrationsWarning] = useState<string | null>(
    null
  );
  const [mailerliteConfigured, setMailerLiteConfigured] = useState(false);
  const [mailerliteSource, setMailerLiteSource] = useState<"db" | "env" | "none">("none");
  const [mailerliteMasked, setMailerLiteMasked] = useState<string | null>(null);
  const [mailerliteCanEdit, setMailerLiteCanEdit] = useState(false);
  const [mailerliteDraftKey, setMailerLiteDraftKey] = useState("");
  const [mailerliteSaving, setMailerLiteSaving] = useState(false);
  const [sharedInboxConfigured, setSharedInboxConfigured] = useState(false);
  const [sharedInboxProvider, setSharedInboxProvider] = useState<string | null>(
    null
  );
  const [sharedInboxEmail, setSharedInboxEmail] = useState<string | null>(null);
  const [sharedInboxCanEdit, setSharedInboxCanEdit] = useState(false);
  const [sharedInboxSaving, setSharedInboxSaving] = useState(false);
  const [sharedInboxEmailDraft, setSharedInboxEmailDraft] = useState("");
  const [sharedInboxNameDraft, setSharedInboxNameDraft] = useState("");
  const [sharedInboxImapHost, setSharedInboxImapHost] = useState("");
  const [sharedInboxImapPort, setSharedInboxImapPort] = useState("");
  const [sharedInboxImapUser, setSharedInboxImapUser] = useState("");
  const [sharedInboxImapPassword, setSharedInboxImapPassword] = useState("");
  const [sharedInboxSmtpHost, setSharedInboxSmtpHost] = useState("");
  const [sharedInboxSmtpPort, setSharedInboxSmtpPort] = useState("");
  const [sharedInboxSmtpUser, setSharedInboxSmtpUser] = useState("");
  const [sharedInboxSmtpPassword, setSharedInboxSmtpPassword] = useState("");
  const active = useMemo(
    () => sections.find((item) => item.id === activeSection),
    [activeSection]
  );
  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => {
      return (
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query)
      );
    });
  }, [users, userSearch]);

  const adminUsers = useMemo(
    () => users.filter((user) => user.role.trim().toLowerCase() === "admin"),
    [users]
  );

  const filteredAdminUsersForTaskWatchers = useMemo(() => {
    const query = taskWatcherSearch.trim().toLowerCase();
    if (!query) return adminUsers;
    return adminUsers.filter((user) => {
      return (
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      );
    });
  }, [adminUsers, taskWatcherSearch]);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await workspaceFetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load users");
      }
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : "Failed to load users");
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadTaskWatchers = useCallback(async () => {
    setTaskWatchersLoading(true);
    setTaskWatchersError(null);
    try {
      const { data: companyRow, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (companyError) {
        throw new Error(companyError.message);
      }
      const companyId = (companyRow?.id as string | undefined) ?? null;
      if (!companyId) {
        throw new Error("Company not found.");
      }
      setTaskWatchersCompanyId(companyId);

      const { data: watcherRows, error: watchersError } = await supabase
        .from("company_task_watchers")
        .select("user_id")
        .eq("company_id", companyId);
      if (watchersError) {
        throw new Error(watchersError.message);
      }
      const ids = Array.isArray(watcherRows)
        ? watcherRows
            .map((row) => (row as { user_id?: string | null }).user_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        : [];
      setTaskWatcherIds(ids);
    } catch (err) {
      setTaskWatchersError(
        err instanceof Error ? err.message : "Failed to load task watchers."
      );
      setTaskWatcherIds([]);
      setTaskWatchersCompanyId(null);
    } finally {
      setTaskWatchersLoading(false);
    }
  }, [supabase]);

  const handleToggleTaskWatcher = useCallback(
    async (targetUserId: string) => {
      if (!targetUserId) return;
      setTaskWatchersSavingId(targetUserId);
      setTaskWatchersError(null);
      try {
        let companyId = taskWatchersCompanyId;
        if (!companyId) {
          const { data: companyRow, error: companyError } = await supabase
            .from("companies")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (companyError) throw new Error(companyError.message);
          companyId = (companyRow?.id as string | undefined) ?? null;
          if (!companyId) throw new Error("Company not found.");
          setTaskWatchersCompanyId(companyId);
        }
        const currentlyWatching = taskWatcherIds.includes(targetUserId);
        if (currentlyWatching) {
          const { error } = await supabase
            .from("company_task_watchers")
            .delete()
            .eq("company_id", companyId)
            .eq("user_id", targetUserId);
          if (error) throw new Error(error.message);
          setTaskWatcherIds((prev) => prev.filter((id) => id !== targetUserId));
        } else {
          const { error } = await supabase.from("company_task_watchers").insert({
            company_id: companyId,
            user_id: targetUserId,
          });
          if (error) throw new Error(error.message);
          setTaskWatcherIds((prev) => [...prev, targetUserId]);
        }
      } catch (err) {
        setTaskWatchersError(
          err instanceof Error ? err.message : "Failed to update task watcher."
        );
      } finally {
        setTaskWatchersSavingId(null);
      }
    },
    [supabase, taskWatcherIds, taskWatchersCompanyId]
  );

  const loadBranding = useCallback(async () => {
    setBrandingError(null);
    try {
      const branding = await getCompanyBranding();
      setBrandingTitle(branding.title || "ISMIRA CRM");
      setBrandingLogoUrl(branding.logoUrl ?? null);
    } catch (err) {
      setBrandingError(
        err instanceof Error ? err.message : "Failed to load branding."
      );
    }
  }, []);

  const handleSaveBranding = useCallback(async () => {
    setBrandingSaving(true);
    setBrandingError(null);
    try {
      const form = new FormData();
      form.set("title", brandingTitle);
      if (brandingLogoFile) form.set("logo", brandingLogoFile);

      const res = await workspaceFetch("/api/company/branding", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to update branding.");

      invalidateCompanyBrandingCache();
      window.dispatchEvent(new Event("company-branding-updated"));
      setBrandingLogoFile(null);
      await loadBranding();
    } catch (err) {
      setBrandingError(
        err instanceof Error ? err.message : "Failed to update branding."
      );
    } finally {
      setBrandingSaving(false);
    }
  }, [brandingLogoFile, brandingTitle, loadBranding]);

  const handleRemoveLogo = useCallback(async () => {
    setBrandingSaving(true);
    setBrandingError(null);
    try {
      const form = new FormData();
      form.set("title", brandingTitle);
      form.set("removeLogo", "1");

      const res = await workspaceFetch("/api/company/branding", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to remove logo.");

      invalidateCompanyBrandingCache();
      window.dispatchEvent(new Event("company-branding-updated"));
      setBrandingLogoFile(null);
      await loadBranding();
    } catch (err) {
      setBrandingError(
        err instanceof Error ? err.message : "Failed to remove logo."
      );
    } finally {
      setBrandingSaving(false);
    }
  }, [brandingTitle, loadBranding]);

  const loadOpeningTypes = useCallback(async () => {
    try {
      const res = await workspaceFetch("/api/breezy/priority-types", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data?.priorityTypes)
        ? (data.priorityTypes as BreezyPriorityType[])
        : DEFAULT_BREEZY_PRIORITY_TYPES;
      if (!res.ok) throw new Error(data?.error ?? "Failed to load opening types.");
      setOpeningTypes(list);
    } catch {
      setOpeningTypes(DEFAULT_BREEZY_PRIORITY_TYPES);
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
                typeof tag === "string" &&
                availableBenefitTags.has(tag as BenefitTag)
            ),
            countryCodes: countryCodesRaw
              .map((code) => normalizeCountryCode(code))
              .filter(Boolean),
            positionsCount:
              typeof positionsCount === "number" && Number.isFinite(positionsCount)
                ? positionsCount
                : 0,
          } satisfies JobCompanyAdminItem;
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
            const id = typeof row.id === "string" ? row.id : "";
            const name = typeof row.name === "string" ? row.name : "Company";
            return [id, name];
          })
        )
      );
      setJobCompanyBenefitDrafts(
        Object.fromEntries(
          list.map((item) => {
            const row = isRecord(item) ? item : {};
            const id = typeof row.id === "string" ? row.id : "";
            const tags = Array.isArray(row.benefitTags)
              ? row.benefitTags.filter(
                  (tag): tag is BenefitTag =>
                    typeof tag === "string" &&
                    availableBenefitTags.has(tag as BenefitTag)
                )
              : [];
            return [id, tags];
          })
        )
      );
      setJobCompanyShipTypeDrafts(
        Object.fromEntries(
          list.map((item) => {
            const row = isRecord(item) ? item : {};
            const id = typeof row.id === "string" ? row.id : "";
            return [id, normalizeJobShipTypes(row.shipTypes ?? row.shipType)];
          })
        )
      );
      setJobCompanyOpeningTypeDrafts(
        Object.fromEntries(
          list.map((item) => {
            const row = isRecord(item) ? item : {};
            const id = typeof row.id === "string" ? row.id : "";
            const openingType =
              typeof row.openingType === "string" ? normalizePriorityKey(row.openingType) : "";
            return [id, openingType];
          })
        )
      );
      setJobCompanyCountryDrafts(
        Object.fromEntries(
          list.map((item) => {
            const row = isRecord(item) ? item : {};
            const id = typeof row.id === "string" ? row.id : "";
            const codes = Array.isArray(row.countryCodes)
              ? row.countryCodes.map((code) => normalizeCountryCode(code)).filter(Boolean)
              : [];
            return [id, codes];
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

  const loadJobsHeroLogos = useCallback(async () => {
    setJobsHeroLogosLoading(true);
    setJobsHeroLogosError(null);
    try {
      const res = await workspaceFetch("/api/company/jobs-hero-logos", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, "Failed to load jobs hero logos."));
      }
      const list: unknown[] = Array.isArray(data?.logos) ? (data.logos as unknown[]) : [];
      setJobsHeroLogos(
        list.map((item) => {
          const row = isRecord(item) ? item : {};
          const sortOrder = row.sortOrder;
          return {
            id: typeof row.id === "string" ? row.id : "",
            label: typeof row.label === "string" ? row.label : "",
            logoUrl: typeof row.logoUrl === "string" ? row.logoUrl : null,
            sortOrder:
              typeof sortOrder === "number" && Number.isFinite(sortOrder) ? sortOrder : 0,
          } satisfies JobsHeroLogoAdminItem;
        })
      );
    } catch (err) {
      setJobsHeroLogosError(
        err instanceof Error ? err.message : "Failed to load jobs hero logos."
      );
    } finally {
      setJobsHeroLogosLoading(false);
    }
  }, []);

  const handleAddJobsHeroLogo = useCallback(async () => {
    setJobsHeroLogosError(null);
    setJobsHeroLogosReordering(false);
    try {
      const res = await workspaceFetch("/api/company/jobs-hero-logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, "Failed to add hero logo."));
      }
      await loadJobsHeroLogos();
    } catch (err) {
      setJobsHeroLogosError(
        err instanceof Error ? err.message : "Failed to add hero logo."
      );
    }
  }, [loadJobsHeroLogos]);

  const handleUpdateJobsHeroLogo = useCallback(
    async (heroLogoId: string, options: { file?: File | null; removeLogo?: boolean; label?: string }) => {
      if (!heroLogoId) return;
      if (!options.file && !options.removeLogo && options.label === undefined) return;

      setJobsHeroLogosActionId(heroLogoId);
      setJobsHeroLogosError(null);
      try {
        const form = new FormData();
        if (options.file) form.set("logo", options.file);
        if (options.removeLogo) form.set("removeLogo", "1");
        if (options.label !== undefined) form.set("label", options.label);

        const res = await workspaceFetch(
          `/api/company/jobs-hero-logos/${encodeURIComponent(heroLogoId)}`,
          { method: "POST", body: form }
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(getApiErrorMessage(data, "Failed to update hero logo."));
        }
        await loadJobsHeroLogos();
      } catch (err) {
        setJobsHeroLogosError(
          err instanceof Error ? err.message : "Failed to update hero logo."
        );
      } finally {
        setJobsHeroLogosActionId(null);
      }
    },
    [loadJobsHeroLogos]
  );

  const handleDeleteJobsHeroLogo = useCallback(
    async (heroLogoId: string) => {
      if (!heroLogoId) return;
      setJobsHeroLogosActionId(heroLogoId);
      setJobsHeroLogosError(null);
      try {
        const res = await workspaceFetch(
          `/api/company/jobs-hero-logos/${encodeURIComponent(heroLogoId)}`,
          { method: "DELETE" }
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(getApiErrorMessage(data, "Failed to delete hero logo."));
        }
        await loadJobsHeroLogos();
      } catch (err) {
        setJobsHeroLogosError(
          err instanceof Error ? err.message : "Failed to delete hero logo."
        );
      } finally {
        setJobsHeroLogosActionId(null);
      }
    },
    [loadJobsHeroLogos]
  );

  const handleReorderJobsHeroLogos = useCallback(
    async (nextIds: string[]) => {
      setJobsHeroLogosReordering(true);
      setJobsHeroLogosError(null);
      try {
        const res = await workspaceFetch("/api/company/jobs-hero-logos/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: nextIds }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(getApiErrorMessage(data, "Failed to reorder hero logos."));
        }
        await loadJobsHeroLogos();
      } catch (err) {
        setJobsHeroLogosError(
          err instanceof Error ? err.message : "Failed to reorder hero logos."
        );
        await loadJobsHeroLogos();
      } finally {
        setJobsHeroLogosReordering(false);
      }
    },
    [loadJobsHeroLogos]
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

  const handleSaveJobBenefitOptions = useCallback(async () => {
    setJobBenefitOptionsSaving(true);
    setJobCompaniesError(null);
    try {
      const benefits = normalizeBenefitOptions(jobBenefitOptionsDraft);
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
  }, [jobBenefitOptionsDraft, loadJobCompanies]);

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
      await loadJobCompanies();
    } catch (err) {
      setJobCompaniesError(err instanceof Error ? err.message : "Failed to save country list.");
    } finally {
      setJobCountryOptionsSaving(false);
    }
  }, [jobCountryOptionsDraft, loadJobCompanies]);

  const handleSyncJobCompanies = useCallback(async () => {
    setJobCompaniesSyncing(true);
    setJobCompaniesError(null);
    try {
      const res = await workspaceFetch("/api/company/job-companies/sync", {
        method: "POST",
      });
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
      await loadJobCompanies();
      setExpandedJobCompanyId(null);
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
          throw new Error(getApiErrorMessage(data, "Failed to merge job companies."));
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
          throw new Error(getApiErrorMessage(data, "Failed to undo job company merge."));
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

  const handleRenameJobCompany = useCallback(
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
          throw new Error(data?.error ?? "Failed to update job company name.");
        }

        const savedName = typeof data?.company?.name === "string" ? data.company.name : name;
        const parsedSavedShipTypes = normalizeJobShipTypes(
          data?.company?.shipTypes ?? data?.company?.shipType
        );
        const savedShipTypes = parsedSavedShipTypes.length > 0 ? parsedSavedShipTypes : shipTypes;
        const savedShipType = savedShipTypes[0] ?? shipType;
        const savedOpeningType = normalizePriorityKey(
          typeof data?.company?.openingType === "string"
            ? data.company.openingType
            : openingType
        );
        const savedTagsRaw = Array.isArray(data?.company?.benefitTags) ? data.company.benefitTags : benefitTags;
        const savedTags = savedTagsRaw.filter(
          (tag): tag is BenefitTag =>
            typeof tag === "string" && AVAILABLE_BENEFIT_TAGS.includes(tag as BenefitTag)
        );
        const savedCountryCodes = Array.isArray(data?.company?.countryCodes)
          ? data.company.countryCodes.map((code: unknown) => normalizeCountryCode(code)).filter(Boolean)
          : countryCodes;

        setJobCompanies((prev) =>
          prev.map((item) =>
            item.id === jobCompanyId
              ? {
                  ...item,
                  name: savedName,
                  shipType: savedShipType,
                  shipTypes: savedShipTypes,
                  openingType: savedOpeningType,
                  benefitTags: savedTags,
                  countryCodes: savedCountryCodes,
                }
              : item
          )
        );
        setJobCompanyNameDrafts((prev) => ({ ...prev, [jobCompanyId]: savedName }));
        setJobCompanyShipTypeDrafts((prev) => ({ ...prev, [jobCompanyId]: savedShipTypes }));
        setJobCompanyOpeningTypeDrafts((prev) => ({
          ...prev,
          [jobCompanyId]: savedOpeningType,
        }));
        setJobCompanyBenefitDrafts((prev) => ({ ...prev, [jobCompanyId]: savedTags }));
        setJobCompanyCountryDrafts((prev) => ({ ...prev, [jobCompanyId]: savedCountryCodes }));

        await loadJobCompanies();
      } catch (err) {
        setJobCompaniesError(
          err instanceof Error ? err.message : "Failed to update job company name."
        );
      } finally {
        setJobCompaniesActionId(null);
      }
    },
    [
      jobCompanyBenefitDrafts,
      jobCompanyCountryDrafts,
      jobCompanyOpeningTypeDrafts,
      jobCompanyNameDrafts,
      jobCompanyShipTypeDrafts,
      loadJobCompanies,
    ]
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    loadBranding();
  }, [loadBranding]);

  useEffect(() => {
    loadOpeningTypes();
  }, [loadOpeningTypes]);

  useEffect(() => {
    loadJobCompanies();
  }, [loadJobCompanies]);

  useEffect(() => {
    if (activeSection !== "integrations") return;
    loadJobsHeroLogos();
  }, [activeSection, loadJobsHeroLogos]);

  useEffect(() => {
    if (!brandingLogoFile) {
      setBrandingLogoDraftUrl(null);
      return;
    }
    const url = URL.createObjectURL(brandingLogoFile);
    setBrandingLogoDraftUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [brandingLogoFile]);

  useEffect(() => {
    if (activeSection !== "users") return;
    fetchUsers();
  }, [activeSection, fetchUsers]);

  useEffect(() => {
    if (activeSection !== "tasks") return;
    loadTaskWatchers();
  }, [activeSection, loadTaskWatchers]);

  useEffect(() => {
    if (activeSection !== "integrations") return;
    let ignore = false;
    const load = async () => {
      setIntegrationsLoading(true);
      setIntegrationsError(null);
      setIntegrationsWarning(null);
      try {
        const [res, mailboxRes] = await Promise.all([
          fetch("/api/company/integrations", { cache: "no-store" }),
          fetch("/api/email/mailbox", { cache: "no-store" }),
        ]);
        const data = await res.json().catch(() => null);
        const mailboxData = await mailboxRes.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Failed to load integrations");
        if (!mailboxRes.ok) {
          throw new Error(mailboxData?.error ?? "Failed to load shared inbox");
        }
        if (ignore) return;
        const ml = data?.mailerlite ?? {};
        setIntegrationsWarning(typeof data?.warning === "string" ? data.warning : null);
        setMailerLiteConfigured(!!ml.configured);
        setMailerLiteSource(ml.source === "db" || ml.source === "env" ? ml.source : "none");
        setMailerLiteMasked(typeof ml.masked === "string" ? ml.masked : null);
        setMailerLiteCanEdit(!!ml.canEdit);

        setSharedInboxConfigured(!!mailboxData?.configured);
        setSharedInboxProvider(
          typeof mailboxData?.provider === "string" ? mailboxData.provider : null
        );
        setSharedInboxEmail(
          typeof mailboxData?.emailAddress === "string" ? mailboxData.emailAddress : null
        );
        setSharedInboxCanEdit(!!mailboxData?.canEdit);
        setSharedInboxEmailDraft(
          typeof mailboxData?.emailAddress === "string" ? mailboxData.emailAddress : ""
        );
        setSharedInboxNameDraft(
          typeof mailboxData?.displayName === "string" ? mailboxData.displayName : ""
        );
        const imap = mailboxData?.config?.imap ?? null;
        const smtp = mailboxData?.config?.smtp ?? null;
        setSharedInboxImapHost(typeof imap?.host === "string" ? imap.host : "");
        setSharedInboxImapPort(
          typeof imap?.port === "number" ? String(imap.port) : ""
        );
        setSharedInboxImapUser(typeof imap?.user === "string" ? imap.user : "");
        setSharedInboxImapPassword("");
        setSharedInboxSmtpHost(typeof smtp?.host === "string" ? smtp.host : "");
        setSharedInboxSmtpPort(
          typeof smtp?.port === "number" ? String(smtp.port) : ""
        );
        setSharedInboxSmtpUser(typeof smtp?.user === "string" ? smtp.user : "");
        setSharedInboxSmtpPassword("");
      } catch (err) {
        if (!ignore) {
          setIntegrationsError(err instanceof Error ? err.message : "Failed to load integrations");
        }
      } finally {
        if (!ignore) setIntegrationsLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [activeSection]);

  const seedRemotePipelines = useCallback(async () => {
    const defaults = buildDefaultPipelines();
    const pipelineRows = defaults.map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
    }));
    const stageRows = defaults.flatMap((pipeline) =>
      pipeline.stages.map((stage) => ({
        pipeline_id: pipeline.id,
        id: stage.id,
        name: stage.name,
        order: stage.order,
      }))
    );
    await supabase.from("pipelines").insert(pipelineRows);
    if (stageRows.length > 0) {
      await supabase.from("pipeline_stages").insert(stageRows);
    }
  }, [supabase]);

  const loadPipelines = useCallback(async () => {
    setPipelinesLoading(true);
    setPipelinesError(null);
    try {
      await ensureCompanyBootstrap();
      const { data: pipelineRows, error: pipelineError } = await supabase
        .from("pipelines")
        .select("id,name,created_at,updated_at");
      if (pipelineError) throw new Error(pipelineError.message);

      const { data: stageRows, error: stageError } = await supabase
        .from("pipeline_stages")
        .select("pipeline_id,id,name,order,created_at");
      if (stageError) throw new Error(stageError.message);

      const pipelinesFromDb = buildPipelinesFromRows(
        (pipelineRows ?? []) as PipelineRow[],
        (stageRows ?? []) as StageRow[]
      );

      if (pipelinesFromDb.length === 0) {
        await seedRemotePipelines();
        const { data: seededPipelines } = await supabase
          .from("pipelines")
          .select("id,name,created_at,updated_at");
        const { data: seededStages } = await supabase
          .from("pipeline_stages")
          .select("pipeline_id,id,name,order,created_at");
        setPipelines(
          buildPipelinesFromRows(
            (seededPipelines ?? []) as PipelineRow[],
            (seededStages ?? []) as StageRow[]
          )
        );
      } else {
        setPipelines(pipelinesFromDb);
      }
    } catch (err) {
      setPipelinesError(
        err instanceof Error ? err.message : "Failed to load pipelines"
      );
    } finally {
      setPipelinesLoading(false);
    }
  }, [supabase, seedRemotePipelines]);

  useEffect(() => {
    if (activeSection !== "positions") return;
    loadPipelines();
  }, [activeSection, loadPipelines]);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [pipelinesError, setPipelinesError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadQuestionnairesFromDb = async () => {
      try {
        const { data, error } = await supabase
          .from("questionnaires")
          .select("id,name,status,created_at,updated_at")
          .order("created_at", { ascending: true });
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) {
          await supabase
            .from("questionnaires")
            .upsert(DEFAULT_QUESTIONNAIRES, { onConflict: "id" });
          if (!ignore) {
            setQuestionnaires(DEFAULT_QUESTIONNAIRES);
          }
        } else if (!ignore) {
          const normalized: Questionnaire[] = data.map((item: unknown) => {
            const record =
              item && typeof item === "object" && !Array.isArray(item)
                ? (item as {
                    id?: unknown;
                    name?: unknown;
                    status?: unknown;
                  })
                : {};
            const status: QuestionnaireStatus =
              record.status === "Active" ? "Active" : "Draft";
            return {
              id:
                typeof record.id === "string" ? record.id : String(record.id ?? ""),
              name:
                typeof record.name === "string"
                  ? record.name
                  : String(record.name ?? ""),
              status,
            };
          });
          setQuestionnaires(normalized);
        }
      } catch {
        if (!ignore) {
          setQuestionnaires(DEFAULT_QUESTIONNAIRES);
        }
      }
    };
    loadQuestionnairesFromDb();
    return () => {
      ignore = true;
    };
  }, [supabase]);

  const resetQuestionnaireModal = () => {
    setQuestionnaireName("");
    setQuestionnaireStatus("Draft");
    setQuestionnaireError(null);
  };

  const handleOpenQuestionnaireModal = () => {
    resetQuestionnaireModal();
    setIsQuestionnaireModalOpen(true);
  };

  const handleCloseQuestionnaireModal = () => {
    setIsQuestionnaireModalOpen(false);
    resetQuestionnaireModal();
  };

  const handleCreateQuestionnaire = async () => {
    const trimmed = questionnaireName.trim();
    if (!trimmed) {
      setQuestionnaireError("Enter a questionnaire name.");
      return;
    }
    const existing = new Set(questionnaires.map((item) => item.id));
    const id = buildQuestionnaireId(trimmed, existing);
    const next = { id, name: trimmed, status: questionnaireStatus };
    try {
      const { error } = await supabase.from("questionnaires").insert(next);
      if (error) throw new Error(error.message);
      setQuestionnaires((prev) => [...prev, next]);
      handleCloseQuestionnaireModal();
    } catch (err) {
      setQuestionnaireError(
        err instanceof Error ? err.message : "Failed to create questionnaire."
      );
    }
  };

  const resetInviteModal = () => {
    setInviteName("");
    setInviteEmail("");
    setInviteRole("Member Basic");
    setInviteError(null);
  };

  const handleCloseInviteModal = () => {
    setIsInviteModalOpen(false);
    resetInviteModal();
  };

  const handleInviteUser = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setInviteError("Enter a valid email address.");
      return;
    }
    const name =
      inviteName.trim() ||
      email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (match) => match.toUpperCase());
    setInviteLoading(true);
    setInviteError(null);
    try {
      const res = await workspaceFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role: inviteRole || "Member Basic" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to invite user");
      }
      if (data?.user) {
        setUsers((prev) => {
          if (prev.some((user) => user.id === data.user.id)) return prev;
          return [data.user as CompanyUser, ...prev];
        });
      } else {
        await fetchUsers();
      }
      handleCloseInviteModal();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleConfirmUser = async (userId: string) => {
    setUserActionId(userId);
    try {
      const res = await workspaceFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to confirm user");
      }
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, status: "active" } : user
        )
      );
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUserActionId(null);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    setUserActionId(userId);
    try {
      const res = await workspaceFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to update role");
      }
      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, role } : user))
      );
    } catch {
      // ignore for now
    } finally {
      setUserActionId(null);
    }
  };

  const handleCreatePipeline = async () => {
    const trimmed = pipelineName.trim();
    if (!trimmed) {
      setPipelineError("Enter a pipeline name.");
      return;
    }
    const existing = new Set(pipelines.map((pipeline) => pipeline.id));
    const id = buildUniqueId(trimmed, existing);
    const nextPipeline: Pipeline = {
      id,
      name: trimmed,
      stages: cloneStages(stages),
    };
    setPipelineError(null);
    setPipelinesLoading(true);
    try {
      const { error: pipelineError } = await supabase
        .from("pipelines")
        .insert({ id: nextPipeline.id, name: nextPipeline.name });
      if (pipelineError) throw new Error(pipelineError.message);
      const stageRows = nextPipeline.stages.map((stage) => ({
        pipeline_id: nextPipeline.id,
        id: stage.id,
        name: stage.name,
        order: stage.order,
      }));
      if (stageRows.length > 0) {
        const { error: stageError } = await supabase
          .from("pipeline_stages")
          .insert(stageRows);
        if (stageError) throw new Error(stageError.message);
      }
      setPipelines((prev) => [...prev, nextPipeline]);
      setPipelineName("");
    } catch (err) {
      setPipelineError(
        err instanceof Error ? err.message : "Failed to create pipeline"
      );
    } finally {
      setPipelinesLoading(false);
    }
  };

  const handleTogglePipeline = (pipelineId: string) => {
    setExpandedPipelineId((prev) => (prev === pipelineId ? null : pipelineId));
  };

  const handleAddStage = async (pipelineId: string) => {
    const draft = (stageDraftByPipeline[pipelineId] ?? "").trim();
    if (!draft) return;
    const pipeline = pipelines.find((item) => item.id === pipelineId);
    if (!pipeline) return;
    const existing = pipeline.stages ?? [];
    const stageIdBase = slugify(draft) || `stage-${existing.length + 1}`;
    const stageIds = new Set(existing.map((stage) => stage.id));
    let stageId = stageIdBase;
    let index = 2;
    while (stageIds.has(stageId)) {
      stageId = `${stageIdBase}-${index}`;
      index += 1;
    }
    const nextStage: Stage = {
      id: stageId,
      name: draft.toUpperCase(),
      order: existing.length,
    };
    setPipelinesLoading(true);
    try {
      const { error } = await supabase.from("pipeline_stages").insert({
        pipeline_id: pipelineId,
        id: nextStage.id,
        name: nextStage.name,
        order: nextStage.order,
      });
      if (error) throw new Error(error.message);
      setPipelines((prev) =>
        prev.map((item) =>
          item.id === pipelineId
            ? { ...item, stages: [...(item.stages ?? []), nextStage] }
            : item
        )
      );
      setStageDraftByPipeline((prev) => ({ ...prev, [pipelineId]: "" }));
    } catch (err) {
      setPipelinesError(
        err instanceof Error ? err.message : "Failed to add stage"
      );
    } finally {
      setPipelinesLoading(false);
    }
  };

  const handleRemoveStage = async (pipelineId: string, stageId: string) => {
    setPipelinesLoading(true);
    try {
      const { error } = await supabase
        .from("pipeline_stages")
        .delete()
        .eq("pipeline_id", pipelineId)
        .eq("id", stageId);
      if (error) throw new Error(error.message);
      setPipelines((prev) =>
        prev.map((pipeline) => {
          if (pipeline.id !== pipelineId) return pipeline;
          const remaining = (pipeline.stages ?? []).filter(
            (stage) => stage.id !== stageId
          );
          const reOrdered = remaining.map((stage, index) => ({
            ...stage,
            order: index,
          }));
          return { ...pipeline, stages: reOrdered };
        })
      );
    } catch (err) {
      setPipelinesError(
        err instanceof Error ? err.message : "Failed to remove stage"
      );
    } finally {
      setPipelinesLoading(false);
    }
  };

  const handleDropStage = async (
    pipelineId: string,
    draggedId: string,
    targetId: string
  ) => {
    if (draggedId === targetId) return;
    const pipeline = pipelines.find((item) => item.id === pipelineId);
    if (!pipeline) return;
    const list = [...(pipeline.stages ?? [])].sort(
      (a, b) => a.order - b.order
    );
    const fromIndex = list.findIndex((stage) => stage.id === draggedId);
    const toIndex = list.findIndex((stage) => stage.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    const reOrdered = list.map((stage, order) => ({ ...stage, order }));
    setPipelinesLoading(true);
    try {
      const { error } = await supabase
        .from("pipeline_stages")
        .upsert(
          reOrdered.map((stage) => ({
            pipeline_id: pipelineId,
            id: stage.id,
            name: stage.name,
            order: stage.order,
          })),
          { onConflict: "pipeline_id,id" }
        );
      if (error) throw new Error(error.message);
      setPipelines((prev) =>
        prev.map((item) =>
          item.id === pipelineId ? { ...item, stages: reOrdered } : item
        )
      );
    } catch (err) {
      setPipelinesError(
        err instanceof Error ? err.message : "Failed to reorder stages"
      );
    } finally {
      setPipelinesLoading(false);
    }
  };

  const mergeHistoryItems = [
    ...(lastJobCompanyMerge ? [lastJobCompanyMerge] : []),
    ...recentJobCompanyMerges.filter((merge) => merge.id !== lastJobCompanyMerge?.id),
  ];
  const benefitOptionsChanged =
    JSON.stringify(normalizeBenefitOptions(jobBenefitOptionsDraft)) !==
    JSON.stringify(normalizeBenefitOptions(jobBenefitOptions));
  const countryOptionsChanged = !sameCountryOptions(jobCountryOptionsDraft, jobCountryOptions);

  return (
    <div className="h-full">
      <div className="border-b border-border px-8 py-6">
        <div className="text-sm font-semibold text-muted-foreground">Company</div>
        <div className="text-2xl font-semibold text-foreground">
          Settings of the Company
        </div>
      </div>

      <div className="grid h-[calc(100%-76px)] grid-cols-[280px_1fr] gap-6 px-6 py-6">
        <aside className="h-full overflow-y-auto rounded-panel border border-border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">
            Sections
          </div>
          <div className="mt-4 space-y-2">
            {sections.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center gap-3 rounded-panel border px-3 py-3 text-left text-sm ${
                    isActive
                      ? "border-success/25 bg-success-muted text-success"
                      : "border-border bg-card text-foreground hover:border-success/25"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-md ${
                      isActive ? "bg-success-muted" : "bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {item.label}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="h-full overflow-y-auto rounded-panel border border-border bg-card p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-semibold text-muted-foreground">
                {active?.label}
              </div>
              <div className="text-xl font-semibold text-foreground">
                {active?.description}
              </div>
            </div>
            {activeSection === "users" ? (
              <UiButton variant="primary" size="sm"
                type="button"
                className="disabled:opacity-60"
                onClick={() => setIsInviteModalOpen(true)}
                disabled={inviteLoading}
              >
                Invite user
              </UiButton>
            ) : null}
            {activeSection === "questionnaires" ? (
              <UiButton variant="primary" size="sm"
                type="button"
                className=""
                onClick={handleOpenQuestionnaireModal}
              >
                Create questionnaire
              </UiButton>
            ) : null}
            {activeSection === "forms" ? (
              <UiButton variant="primary" size="sm" type="submit" className="">
                Create form
              </UiButton>
            ) : null}
          </div>

          {activeSection === "overview" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-panel border border-border px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      Branding
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Update the app title and logo (used in sidebar + login page).
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {brandingLogoUrl ? (
                      <UiButton variant="secondary" size="sm"
                        type="button"
                        className="h-9 transition disabled:opacity-60"
                        onClick={handleRemoveLogo}
                        disabled={brandingSaving}
                      >
                        Remove logo
                      </UiButton>
                    ) : null}
                    <UiButton variant="primary" size="sm"
                      type="button"
                      className="h-9 disabled:opacity-60"
                      onClick={handleSaveBranding}
                      disabled={brandingSaving}
                    >
                      {brandingSaving ? "Saving..." : "Save branding"}
                    </UiButton>
                  </div>
                </div>

                {brandingError ? (
                  <div className="mt-3 rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-xs text-destructive">
                    {brandingError}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      App title
                    </div>
                    <UiInput
                      value={brandingTitle}
                      onChange={(event) => setBrandingTitle(event.target.value)}
                      className="h-11 w-full"
                      placeholder="ISMIRA CRM"
                      maxLength={80}
                    />
                    <div className="text-xs text-muted-foreground">
                      Example: Ismira CRM, LinaS CRM, etc.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      Logo
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-panel border border-border bg-muted">
                        {brandingLogoDraftUrl || brandingLogoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={brandingLogoDraftUrl || brandingLogoUrl || ""}
                            alt={brandingTitle}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="text-xs font-semibold text-muted-foreground">
                            —
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground transition hover:bg-muted">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              setBrandingLogoFile(file);
                            }}
                          />
                          Upload logo
                        </label>
                        {brandingLogoFile ? (
                          <UiButton variant="secondary" size="sm"
                            type="button"
                            className="h-9 transition"
                            onClick={() => setBrandingLogoFile(null)}
                          >
                            Reset
                          </UiButton>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Recommended: PNG/SVG, max 2MB.
                    </div>
                  </div>
                </div>
              </div>


              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: "Company name", placeholder: "Ismira CRM" },
                  { label: "Company email", placeholder: "contact@ismira.com" },
                  { label: "Primary phone", placeholder: "+370 600 00000" },
                  { label: "Website", placeholder: "https://ismira.com" },
                ].map((field) => (
                  <div key={field.label} className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      {field.label}
                    </div>
                    <UiInput
                      className="h-11 w-full"
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
                <div className="space-y-2 sm:col-span-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Company description
                  </div>
                  <UiTextarea
                    className="min-h-[120px] w-full"
                    placeholder="Add a short description about your company."
                  />
                </div>
                <div className="flex justify-end sm:col-span-2">
                  <UiButton variant="primary" size="sm" type="submit" className="">
                    Save changes
                  </UiButton>
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "positions" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-panel border border-border px-4 py-4 text-sm">
                <div className="font-semibold text-foreground">
                  Pipelines & Pools
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Manage pipelines and pools in one place.
                </div>
              </div>
              {pipelinesError ? (
                <div className="rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-xs text-destructive">
                  {pipelinesError}
                </div>
              ) : null}
              {pipelinesLoading ? (
                <div className="rounded-panel border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                  Loading pipelines...
                </div>
              ) : null}

              <div className="rounded-panel border border-border px-4 py-4">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Create pipeline
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <UiInput
                    value={pipelineName}
                    onChange={(event) => setPipelineName(event.target.value)}
                    placeholder="Pipeline name"
                    className="h-10 flex-1"
                  />
                  <UiButton variant="primary" size="sm"
                    type="button"
                    className="h-10 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleCreatePipeline}
                    disabled={pipelinesLoading}
                  >
                    Create
                  </UiButton>
                </div>
                {pipelineError ? (
                  <div className="mt-2 text-xs text-destructive">
                    {pipelineError}
                  </div>
                ) : null}
              </div>

              <div className="rounded-panel border border-border">
                {pipelines.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No pipelines yet. Create your first pipeline.
                  </div>
                ) : (
                  pipelines.map((pipeline) => {
                    const isExpanded = expandedPipelineId === pipeline.id;
                    const stageDraft = stageDraftByPipeline[pipeline.id] ?? "";
                    return (
                      <div
                        key={pipeline.id}
                        className="border-b border-border px-4 py-3 text-sm last:border-b-0"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between text-left"
                          onClick={() => handleTogglePipeline(pipeline.id)}
                        >
                          <div>
                            <div className="font-semibold text-foreground">
                              {pipeline.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {pipeline.stages.length} stages
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-success-muted px-3 py-1 text-[11px] font-semibold text-success">
                              Active
                            </span>
                            <span className="text-muted-foreground">
                              {isExpanded ? "▾" : "▸"}
                            </span>
                          </div>
                        </button>

                        {isExpanded ? (
                          <div className="mt-4 space-y-3 rounded-md border border-border bg-muted p-3">
                            <div className="text-xs font-semibold uppercase text-muted-foreground">
                              Stages
                            </div>
                            <div className="space-y-2">
                              {(pipeline.stages ?? [])
                                .sort((a, b) => a.order - b.order)
                                .map((stage) => {
                                  const isDragging = draggingStageId === stage.id;
                                  const isOver = dragOverStageId === stage.id;
                                  return (
                                    <div
                                      key={stage.id}
                                      draggable
                                      onDragStart={(event) => {
                                        event.dataTransfer.effectAllowed = "move";
                                        setDraggingStageId(stage.id);
                                        setDraggingPipelineId(pipeline.id);
                                      }}
                                      onDragEnd={() => {
                                        setDraggingStageId(null);
                                        setDragOverStageId(null);
                                        setDraggingPipelineId(null);
                                      }}
                                      onDragOver={(event) => {
                                        if (draggingPipelineId !== pipeline.id) {
                                          return;
                                        }
                                        event.preventDefault();
                                        setDragOverStageId(stage.id);
                                      }}
                                      onDrop={(event) => {
                                        event.preventDefault();
                                        if (
                                          !draggingStageId ||
                                          draggingPipelineId !== pipeline.id
                                        ) {
                                          return;
                                        }
                                        handleDropStage(
                                          pipeline.id,
                                          draggingStageId,
                                          stage.id
                                        );
                                        setDraggingStageId(null);
                                        setDragOverStageId(null);
                                        setDraggingPipelineId(null);
                                      }}
                                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs text-foreground ${
                                        isOver
                                          ? "border-success/25 bg-success-muted"
                                          : "border-border bg-card"
                                      } ${isDragging ? "opacity-60" : ""}`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="cursor-grab text-muted-foreground">
                                          ⋮⋮
                                        </span>
                                        <span className="font-semibold">
                                          {stage.name}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        className="text-destructive hover:text-destructive"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleRemoveStage(
                                            pipeline.id,
                                            stage.id
                                          );
                                        }}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  );
                                })}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <UiInput
                                value={stageDraft}
                                onChange={(event) =>
                                  setStageDraftByPipeline((prev) => ({
                                    ...prev,
                                    [pipeline.id]: event.target.value,
                                  }))
                                }
                                placeholder="New stage name"
                                className="h-9 flex-1"
                              />
                              <UiButton variant="primary" size="sm"
                                type="button"
                                className="h-9"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleAddStage(pipeline.id);
                                }}
                              >
                                Add stage
                              </UiButton>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {activeSection === "users" ? (
            <div className="mt-6 space-y-4">
              <UiInput
                className="h-11 w-full"
                placeholder="Search users..."
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
              />
              <div className="text-xs text-muted-foreground">
                New users must confirm their email. Admins can confirm accounts
                manually.
              </div>
              {usersError ? (
                <div className="rounded-md border border-destructive/25 bg-danger-muted px-3 py-2 text-xs text-destructive">
                  {usersError}
                </div>
              ) : null}
              <div className="rounded-panel border border-border">
                {usersLoading ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Loading users...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    {users.length === 0
                      ? "No users found."
                      : "No users match your search."}
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground">
                          {user.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={user.avatar_url}
                              alt={user.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            user.name
                              .split(" ")
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase())
                              .join("")
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">
                            {user.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.email}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <UiSelect
                          className=""
                          value={user.role}
                          onChange={(event) =>
                            handleRoleChange(user.id, event.target.value)
                          }
                          disabled={userActionId === user.id}
                        >
                          <option>Admin</option>
                          <option>Member Premium</option>
                          <option>Member Basic</option>
                          <option>Visitor</option>
                        </UiSelect>
                        {user.status === "pending" ? (
                          <>
                            <span className="rounded-full bg-warning-muted px-2 py-0.5 text-[10px] font-semibold text-warning">
                              Pending confirmation
                            </span>
                            <UiButton variant="primary" size="sm"
                              type="button"
                              className="disabled:opacity-60"
                              onClick={() => handleConfirmUser(user.id)}
                              disabled={userActionId === user.id}
                            >
                              Confirm account
                            </UiButton>
                          </>
                        ) : (
                          <span className="rounded-full bg-success-muted px-2 py-0.5 text-[10px] font-semibold text-success">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {activeSection === "tasks" ? (
            <div className="mt-6 space-y-4">
              {taskWatchersError ? (
                <div className="rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-xs text-destructive">
                  {taskWatchersError}
                </div>
              ) : null}
              <div className="rounded-panel border border-border px-4 py-4">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Watchers
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Selected admins get an in-app notification when any task is created
                  or completed.
                </div>
                <UiInput
                  className="mt-4 h-11 w-full"
                  placeholder="Search users..."
                  value={taskWatcherSearch}
                  onChange={(event) => setTaskWatcherSearch(event.target.value)}
                />
                <div className="mt-4 rounded-panel border border-border">
                  {taskWatchersLoading ? (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Loading watchers...
                    </div>
                  ) : filteredAdminUsersForTaskWatchers.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      {adminUsers.length === 0
                        ? "No admin users found."
                        : "No users match your search."}
                    </div>
                  ) : (
                    filteredAdminUsersForTaskWatchers.map((user) => {
                      const checked = taskWatcherIds.includes(user.id);
                      const saving = taskWatchersSavingId === user.id;
                      return (
                        <label
                          key={`task-watcher-${user.id}`}
                          className="flex cursor-pointer items-center justify-between border-b border-border px-4 py-3 text-sm last:border-b-0"
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded border ${
                                checked
                                  ? "border-success/25 bg-emerald-500 text-white"
                                  : "border-input text-transparent"
                              }`}
                            >
                              ✓
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-foreground">
                                {user.name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {user.email}
                              </span>
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={checked}
                            disabled={saving}
                            onChange={() => handleToggleTaskWatcher(user.id)}
                          />
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Admin only.
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "questionnaires" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-panel border border-border">
                {questionnaires.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No questionnaires yet. Create one to get started.
                  </div>
                ) : (
                  questionnaires.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-b-0"
                    >
                      <div className="font-semibold text-foreground">
                        {item.name}
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          item.status === "Active"
                            ? "bg-success-muted text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                Questionnaire builder is coming next.
              </div>
            </div>
          ) : null}

          {activeSection === "forms" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-panel border border-border">
                {[
                  { name: "Candidate intake form", status: "Active" },
                  { name: "Document request form", status: "Active" },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-b-0"
                  >
                    <div className="font-semibold text-foreground">{item.name}</div>
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                Form builder is coming next.
              </div>
            </div>
          ) : null}

          {activeSection === "permissions" ? (
            <div className="mt-6 space-y-4">
              {[
                { role: "Admin", desc: "Full access, including users, roles and payments." },
                { role: "Member Premium", desc: "Recruiter access: view private job fields and edit HR Portal data." },
                { role: "Member Basic", desc: "View private job fields without HR Portal editing access." },
                { role: "Visitor", desc: "Public job information only." },
              ].map((item) => (
                <div
                  key={item.role}
                  className="rounded-panel border border-border px-4 py-3 text-sm"
                >
                  <div className="font-semibold text-foreground">{item.role}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
              ))}
            </div>
          ) : null}

          {activeSection === "integrations" ? (
            <div className="mt-6 space-y-4">
              {integrationsError ? (
                <div className="rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-sm text-destructive">
                  {integrationsError}
                </div>
              ) : null}
              {integrationsWarning ? (
                <div className="rounded-panel border border-warning/25 bg-warning-muted px-4 py-3 text-sm text-warning">
                  {integrationsWarning}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-panel border border-border px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-foreground">MailerLite</div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        mailerliteConfigured
                          ? "bg-success-muted text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {integrationsLoading ? "Loading…" : mailerliteConfigured ? "Configured" : "Not configured"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Used for group subscribers, filtered lists, and automation triggers.
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">
                      API Key
                    </div>
                    <UiInput
                      className="h-11 w-full"
                      type="password"
                      value={mailerliteDraftKey}
                      onChange={(event) => setMailerLiteDraftKey(event.target.value)}
                      placeholder={mailerliteMasked ? `Current: ${mailerliteMasked}` : "Paste MailerLite API key"}
                      disabled={!mailerliteCanEdit}
                    />
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <UiButton variant="primary" size="sm"
                        type="button"
                        className="disabled:opacity-50"
                        disabled={!mailerliteCanEdit || mailerliteSaving || integrationsLoading}
                        onClick={async () => {
                          setMailerLiteSaving(true);
                          setIntegrationsError(null);
                          try {
                            const res = await workspaceFetch("/api/company/integrations", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                mailerlite_api_key: mailerliteDraftKey,
                              }),
                            });
                            const data = await res.json().catch(() => null);
                            if (!res.ok) throw new Error(data?.error ?? "Failed to save");
                            setMailerLiteDraftKey("");
                            // reload status
                            const statusRes = await workspaceFetch("/api/company/integrations", { cache: "no-store" });
                            const statusData = await statusRes.json().catch(() => null);
                            const ml = statusData?.mailerlite ?? {};
                            setIntegrationsWarning(
                              typeof statusData?.warning === "string" ? statusData.warning : null
                            );
                            setMailerLiteConfigured(!!ml.configured);
                            setMailerLiteSource(ml.source === "db" || ml.source === "env" ? ml.source : "none");
                            setMailerLiteMasked(typeof ml.masked === "string" ? ml.masked : null);
                            setMailerLiteCanEdit(!!ml.canEdit);
                          } catch (err) {
                            setIntegrationsError(err instanceof Error ? err.message : "Failed to save");
                          } finally {
                            setMailerLiteSaving(false);
                          }
                        }}
                      >
                        {mailerliteSaving ? "Saving…" : "Save"}
                      </UiButton>
                      <UiButton variant="secondary" size="sm"
                        type="button"
                        className="disabled:opacity-50"
                        disabled={!mailerliteCanEdit || mailerliteSaving || integrationsLoading}
                        onClick={async () => {
                          setMailerLiteSaving(true);
                          setIntegrationsError(null);
                          try {
                            const res = await workspaceFetch("/api/company/integrations", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ mailerlite_api_key: "" }),
                            });
                            const data = await res.json().catch(() => null);
                            if (!res.ok) throw new Error(data?.error ?? "Failed to clear");
                            setMailerLiteDraftKey("");
                            const statusRes = await workspaceFetch("/api/company/integrations", { cache: "no-store" });
                            const statusData = await statusRes.json().catch(() => null);
                            const ml = statusData?.mailerlite ?? {};
                            setIntegrationsWarning(
                              typeof statusData?.warning === "string" ? statusData.warning : null
                            );
                            setMailerLiteConfigured(!!ml.configured);
                            setMailerLiteSource(ml.source === "db" || ml.source === "env" ? ml.source : "none");
                            setMailerLiteMasked(typeof ml.masked === "string" ? ml.masked : null);
                            setMailerLiteCanEdit(!!ml.canEdit);
                          } catch (err) {
                            setIntegrationsError(err instanceof Error ? err.message : "Failed to clear");
                          } finally {
                            setMailerLiteSaving(false);
                          }
                        }}
                      >
                        Clear
                      </UiButton>
                      <span className="text-[11px] text-muted-foreground">
                        Source: {mailerliteSource.toUpperCase()}
                      </span>
                      {!mailerliteCanEdit ? (
                        <span className="text-[11px] text-muted-foreground">
                          {integrationsWarning ? "Database not configured." : "Admin only."}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-panel border border-border px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-foreground">Shared Inbox</div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        sharedInboxConfigured
                          ? "bg-success-muted text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {integrationsLoading
                        ? "Loading…"
                        : sharedInboxConfigured
                        ? "Connected"
                        : "Not connected"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Connect a shared inbox so the Email tab can sync threads and send from the platform (with open/click tracking).
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="rounded-md border border-border bg-muted px-3 py-3">
                      <div className="text-xs font-semibold text-foreground">
                        Google Workspace (Gmail) — Recommended
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Best threading + fastest sync for the Email tab.
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <a
                          className={`rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground ${
                            !sharedInboxCanEdit ? "pointer-events-none opacity-50" : ""
                          }`}
                          href="/api/email/google/oauth/start?next=/company"
                        >
                          {sharedInboxProvider === "gmail" && sharedInboxConfigured
                            ? "Reconnect Gmail"
                            : "Connect Gmail"}
                        </a>
                        <UiButton variant="secondary" size="sm"
                          type="button"
                          className="disabled:opacity-50"
                          disabled={
                            !sharedInboxCanEdit ||
                            sharedInboxSaving ||
                            integrationsLoading ||
                            !sharedInboxConfigured
                          }
                          onClick={async () => {
                            setSharedInboxSaving(true);
                            setIntegrationsError(null);
                            try {
                              const res = await workspaceFetch("/api/email/mailbox", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ disconnect: true }),
                              });
                              const data = await res.json().catch(() => null);
                              if (!res.ok) throw new Error(data?.error ?? "Failed to disconnect");
                              const statusRes = await workspaceFetch("/api/email/mailbox", {
                                cache: "no-store",
                              });
                              const statusData = await statusRes.json().catch(() => null);
                              setSharedInboxConfigured(!!statusData?.configured);
                              setSharedInboxProvider(
                                typeof statusData?.provider === "string"
                                  ? statusData.provider
                                  : null
                              );
                              setSharedInboxEmail(
                                typeof statusData?.emailAddress === "string"
                                  ? statusData.emailAddress
                                  : null
                              );
                              setSharedInboxCanEdit(!!statusData?.canEdit);
                              setSharedInboxEmailDraft(
                                typeof statusData?.emailAddress === "string"
                                  ? statusData.emailAddress
                                  : ""
                              );
                              setSharedInboxNameDraft(
                                typeof statusData?.displayName === "string"
                                  ? statusData.displayName
                                  : ""
                              );
                            } catch (err) {
                              setIntegrationsError(
                                err instanceof Error ? err.message : "Failed to disconnect"
                              );
                            } finally {
                              setSharedInboxSaving(false);
                            }
                          }}
                        >
                          Disconnect
                        </UiButton>
                        {!sharedInboxCanEdit ? (
                          <span className="text-[11px] text-muted-foreground">Admin only.</span>
                        ) : null}
                      </div>
                      {sharedInboxConfigured && sharedInboxEmail ? (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          Connected mailbox:{" "}
                          <span className="font-semibold text-foreground">
                            {sharedInboxEmail}
                          </span>
                          {sharedInboxProvider ? (
                            <span className="ml-2 text-muted-foreground">
                              ({sharedInboxProvider})
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-md border border-border bg-card px-3 py-3">
                      <div className="text-xs font-semibold text-foreground">
                        Other providers (SMTP/IMAP)
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Use this for non-Google inboxes. Outgoing emails will include open/click tracking. (Thread sync depends on provider support.)
                      </div>

                      <div className="mt-3 grid gap-2">
                        <UiInput
                          className="h-10 w-full"
                          placeholder="From email address"
                          value={sharedInboxEmailDraft}
                          onChange={(e) => setSharedInboxEmailDraft(e.target.value)}
                          disabled={!sharedInboxCanEdit}
                        />
                        <UiInput
                          className="h-10 w-full"
                          placeholder="From name (optional)"
                          value={sharedInboxNameDraft}
                          onChange={(e) => setSharedInboxNameDraft(e.target.value)}
                          disabled={!sharedInboxCanEdit}
                        />

                        <div className="grid gap-2 sm:grid-cols-2">
                          <UiInput
                            className="h-10 w-full"
                            placeholder="IMAP host"
                            value={sharedInboxImapHost}
                            onChange={(e) => setSharedInboxImapHost(e.target.value)}
                            disabled={!sharedInboxCanEdit}
                          />
                          <UiInput
                            className="h-10 w-full"
                            placeholder="IMAP port"
                            value={sharedInboxImapPort}
                            onChange={(e) => setSharedInboxImapPort(e.target.value)}
                            disabled={!sharedInboxCanEdit}
                          />
                          <UiInput
                            className="h-10 w-full"
                            placeholder="IMAP username"
                            value={sharedInboxImapUser}
                            onChange={(e) => setSharedInboxImapUser(e.target.value)}
                            disabled={!sharedInboxCanEdit}
                          />
                          <UiInput
                            className="h-10 w-full"
                            placeholder="IMAP password (leave blank to keep)"
                            type="password"
                            value={sharedInboxImapPassword}
                            onChange={(e) => setSharedInboxImapPassword(e.target.value)}
                            disabled={!sharedInboxCanEdit}
                          />
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <UiInput
                            className="h-10 w-full"
                            placeholder="SMTP host"
                            value={sharedInboxSmtpHost}
                            onChange={(e) => setSharedInboxSmtpHost(e.target.value)}
                            disabled={!sharedInboxCanEdit}
                          />
                          <UiInput
                            className="h-10 w-full"
                            placeholder="SMTP port"
                            value={sharedInboxSmtpPort}
                            onChange={(e) => setSharedInboxSmtpPort(e.target.value)}
                            disabled={!sharedInboxCanEdit}
                          />
                          <UiInput
                            className="h-10 w-full"
                            placeholder="SMTP username"
                            value={sharedInboxSmtpUser}
                            onChange={(e) => setSharedInboxSmtpUser(e.target.value)}
                            disabled={!sharedInboxCanEdit}
                          />
                          <UiInput
                            className="h-10 w-full"
                            placeholder="SMTP password (leave blank to keep)"
                            type="password"
                            value={sharedInboxSmtpPassword}
                            onChange={(e) => setSharedInboxSmtpPassword(e.target.value)}
                            disabled={!sharedInboxCanEdit}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <UiButton variant="primary" size="sm"
                            type="button"
                            className="disabled:opacity-50"
                            disabled={!sharedInboxCanEdit || sharedInboxSaving || integrationsLoading}
                            onClick={async () => {
                              setSharedInboxSaving(true);
                              setIntegrationsError(null);
                              try {
                                const res = await workspaceFetch("/api/email/mailbox", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    provider: "smtp_imap",
                                    emailAddress: sharedInboxEmailDraft,
                                    displayName: sharedInboxNameDraft,
                                    imap: {
                                      host: sharedInboxImapHost,
                                      port: sharedInboxImapPort
                                        ? Number(sharedInboxImapPort)
                                        : undefined,
                                      user: sharedInboxImapUser,
                                      password: sharedInboxImapPassword,
                                    },
                                    smtp: {
                                      host: sharedInboxSmtpHost,
                                      port: sharedInboxSmtpPort
                                        ? Number(sharedInboxSmtpPort)
                                        : undefined,
                                      user: sharedInboxSmtpUser,
                                      password: sharedInboxSmtpPassword,
                                    },
                                  }),
                                });
                                const data = await res.json().catch(() => null);
                                if (!res.ok) throw new Error(data?.error ?? "Failed to save");
                                const statusRes = await workspaceFetch("/api/email/mailbox", {
                                  cache: "no-store",
                                });
                                const statusData = await statusRes.json().catch(() => null);
                                setSharedInboxConfigured(!!statusData?.configured);
                                setSharedInboxProvider(
                                  typeof statusData?.provider === "string"
                                    ? statusData.provider
                                    : null
                                );
                                setSharedInboxEmail(
                                  typeof statusData?.emailAddress === "string"
                                    ? statusData.emailAddress
                                    : null
                                );
                                setSharedInboxCanEdit(!!statusData?.canEdit);
                                setSharedInboxImapPassword("");
                                setSharedInboxSmtpPassword("");
                              } catch (err) {
                                setIntegrationsError(
                                  err instanceof Error ? err.message : "Failed to save"
                                );
                              } finally {
                                setSharedInboxSaving(false);
                              }
                            }}
                          >
                            {sharedInboxSaving ? "Saving…" : "Save"}
                          </UiButton>
                          {!sharedInboxCanEdit ? (
                            <span className="text-[11px] text-muted-foreground">Admin only.</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-panel border border-border px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-foreground">Supabase</div>
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                      Read-only
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    These values are configured via environment variables at deploy time.
                  </div>

                  <div className="mt-4 space-y-3 text-xs">
                    <div>
                      <div className="font-semibold text-muted-foreground">NEXT_PUBLIC_SUPABASE_URL</div>
                      <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2">
                        <code className="block min-w-0 truncate text-[11px] text-foreground">
                          {process.env.NEXT_PUBLIC_SUPABASE_URL ?? "—"}
                        </code>
                        <UiButton variant="secondary" size="sm"
                          type="button"
                          className="shrink-0"
                          onClick={async () => {
                            const value = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
                            if (!value) return;
                            await navigator.clipboard.writeText(value);
                          }}
                        >
                          Copy
                        </UiButton>
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-muted-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
                      <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2">
                        <code className="block min-w-0 truncate text-[11px] text-foreground">
                          {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                            ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 10)}…${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(-6)}`
                            : "—"}
                        </code>
                        <UiButton variant="secondary" size="sm"
                          type="button"
                          className="shrink-0"
                          onClick={async () => {
                            const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
                            if (!value) return;
                            await navigator.clipboard.writeText(value);
                          }}
                        >
                          Copy
                        </UiButton>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      To change these, update `.env.local` and restart the dev server.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-panel border border-border px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      Jobs hero logos
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Upload and reorder logos shown in the Jobs page hero slider.
                    </div>
                  </div>
                  <UiButton variant="primary" size="sm"
                    type="button"
                    className="h-9 disabled:opacity-60"
                    onClick={() => void handleAddJobsHeroLogo()}
                    disabled={jobsHeroLogosReordering || jobsHeroLogosActionId !== null}
                  >
                    Add logo
                  </UiButton>
                </div>

                {jobsHeroLogosError ? (
                  <div className="mt-3 rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-xs text-destructive">
                    {jobsHeroLogosError}
                  </div>
                ) : null}

                {jobsHeroLogosLoading ? (
                  <div className="mt-4 rounded-panel border border-border bg-muted px-4 py-6 text-sm text-muted-foreground">
                    Loading hero logos...
                  </div>
                ) : jobsHeroLogos.length === 0 ? (
                  <div className="mt-4 rounded-panel border border-dashed border-border bg-muted px-4 py-6 text-sm text-muted-foreground">
                    No hero logos yet. Click Add logo to create your first item, then upload an image.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {jobsHeroLogos.map((item, index) => {
                      const isBusy = jobsHeroLogosActionId === item.id || jobsHeroLogosReordering;
                      const canMoveUp = index > 0;
                      const canMoveDown = index < jobsHeroLogos.length - 1;

                      return (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 rounded-panel border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-panel border border-border bg-muted">
                              {item.logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.logoUrl}
                                  alt={item.label || "Hero logo"}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <span className="text-sm font-semibold text-muted-foreground">
                                  {item.label ? item.label.slice(0, 1).toUpperCase() : "—"}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Label
                              </div>
                              <UiInput
                                className="mt-1 h-9 w-full min-w-[220px] max-w-[420px]"
                                placeholder="e.g. Dropbox"
                                value={item.label}
                                disabled={isBusy}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setJobsHeroLogos((prev) =>
                                    prev.map((row) =>
                                      row.id === item.id ? { ...row, label: value } : row
                                    )
                                  );
                                }}
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  void handleUpdateJobsHeroLogo(item.id, { label: value });
                                }}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-border bg-card px-4 text-xs font-semibold text-foreground transition hover:bg-muted">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={isBusy}
                                onChange={(event) => {
                                  const file = event.target.files?.[0] ?? null;
                                  void handleUpdateJobsHeroLogo(item.id, { file });
                                  event.currentTarget.value = "";
                                }}
                              />
                              {isBusy ? "Uploading..." : item.logoUrl ? "Replace" : "Upload"}
                            </label>
                            {item.logoUrl ? (
                              <UiButton variant="secondary" size="sm"
                                type="button"
                                className="h-9 transition disabled:opacity-60"
                                onClick={() =>
                                  void handleUpdateJobsHeroLogo(item.id, { removeLogo: true })
                                }
                                disabled={isBusy}
                              >
                                Remove
                              </UiButton>
                            ) : null}
                            <UiButton variant="secondary" size="sm"
                              type="button"
                              className="h-9 transition disabled:opacity-60"
                              onClick={() => void handleDeleteJobsHeroLogo(item.id)}
                              disabled={isBusy}
                            >
                              Delete
                            </UiButton>
                            <div className="ml-1 flex items-center gap-1">
                              <UiButton variant="secondary" size="sm"
                                type="button"
                                className="h-9 transition disabled:opacity-50"
                                disabled={!canMoveUp || isBusy}
                                onClick={() => {
                                  const next = [...jobsHeroLogos];
                                  const a = next[index - 1]!;
                                  next[index - 1] = next[index]!;
                                  next[index] = a;
                                  setJobsHeroLogos(next);
                                  void handleReorderJobsHeroLogos(next.map((row) => row.id));
                                }}
                              >
                                ↑
                              </UiButton>
                              <UiButton variant="secondary" size="sm"
                                type="button"
                                className="h-9 transition disabled:opacity-50"
                                disabled={!canMoveDown || isBusy}
                                onClick={() => {
                                  const next = [...jobsHeroLogos];
                                  const a = next[index + 1]!;
                                  next[index + 1] = next[index]!;
                                  next[index] = a;
                                  setJobsHeroLogos(next);
                                  void handleReorderJobsHeroLogos(next.map((row) => row.id));
                                }}
                              >
                                ↓
                              </UiButton>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      Job companies
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Click a company to edit ship type, benefits, logo, and naming.
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {mergeHistoryItems.length > 0 ? (
                      <UiButton variant="secondary" size="sm"
                        type="button"
                        className="inline-flex h-9 items-center justify-center gap-2 transition"
                        onClick={() => setMergeHistoryOpen(true)}
                      >
                        <Undo2 className="h-4 w-4" />
                        Merge history
                      </UiButton>
                    ) : null}
                    <UiButton variant="primary" size="sm"
                      type="button"
                      className="h-9 disabled:opacity-60"
                      onClick={handleSyncJobCompanies}
                      disabled={jobCompaniesSyncing}
                    >
                      {jobCompaniesSyncing ? "Syncing..." : "Sync companies"}
                    </UiButton>
                  </div>
                </div>

                <div className="mt-4 rounded-panel border border-border bg-muted/70 p-2">
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
                  <div className="mt-3 rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-xs text-destructive">
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
                      const mergeTarget = jobCompanies.find(
                        (candidate) => candidate.id === mergeTargetId
                      );
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
                              setExpandedJobCompanyId((current) =>
                                current === item.id ? null : item.id
                              )
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
                                <span className="rounded-full bg-accent px-2.5 py-1 text-foreground">
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
                                          setJobCompanyShipTypeDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: [],
                                          }))
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
                                    <div className="mt-2 flex flex-col gap-2 rounded-panel border border-input bg-accent/70 p-2 sm:flex-row">
                                      <UiInput
                                        type="text"
                                        value={newJobBenefitLabel}
                                        onChange={(event) => setNewJobBenefitLabel(event.target.value)}
                                        onKeyDown={(event) => {
                                          if (event.key !== "Enter") return;
                                          event.preventDefault();
                                          handleAddJobBenefitOption(item.id);
                                        }}
                                        placeholder="Add new benefit here"
                                        className="h-10 min-w-0 flex-1"
                                      />
                                      <UiButton variant="primary" size="sm"
                                        type="button"
                                        className="inline-flex h-10 items-center justify-center gap-2 transition disabled:opacity-60"
                                        onClick={() => handleAddJobBenefitOption(item.id)}
                                        disabled={jobBenefitOptionsSaving || !newJobBenefitLabel.trim()}
                                      >
                                        <Plus className="h-4 w-4" />
                                        Add and select
                                      </UiButton>
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
                                            <PencilLine className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
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
                                        {jobCountryOptionsDraft.map((option) => {
                                          const selected = draftCountryCodes.includes(option.code);
                                          return (
                                            <button
                                              key={option.code}
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
                                                      ? current.filter((code) => code !== option.code)
                                                      : [...current, option.code],
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
                                              <span aria-hidden="true">{toFlagEmoji(option.code)}</span>
                                              <span>{option.name}</span>
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
                                    onClick={() => void handleRenameJobCompany(item.id)}
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
                                        {mergeTarget ? ` into ${mergeTarget.name}` : ""}. Undo is available
                                        from Recent merges.
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
              </div>
            </div>
          ) : null}

          {activeSection === "notifications" ? (
            <div className="mt-6 space-y-3">
              {[
                "Email notifications for new candidates",
                "SMS reminders for interviews",
                "Weekly pipeline summary",
              ].map((item) => (
                <label
                  key={item}
                  className="flex items-center justify-between rounded-panel border border-border px-4 py-3 text-sm"
                >
                  <span className="text-foreground">{item}</span>
                  <input type="checkbox" className="h-4 w-4" />
                </label>
              ))}
            </div>
          ) : null}

          {activeSection === "storage" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-panel border border-border px-4 py-3 text-sm">
                <div className="font-semibold text-foreground">
                  Document retention
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Configure how long files are stored.
                </div>
                <UiSelect className="mt-3 h-10 w-full">
                  <option>1 year</option>
                  <option>2 years</option>
                  <option>3 years</option>
                  <option>Indefinite</option>
                </UiSelect>
              </div>
              <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                Storage settings will connect to Supabase later.
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {benefitOptionsModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setBenefitOptionsModalOpen(false)}
        >
          <div
            className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-panel bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-foreground">Manage benefits</div>
                <div className="mt-1 text-xs text-muted-foreground">
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
                            .map((benefit, nextIndex) => ({
                              ...benefit,
                              sortOrder: nextIndex,
                            }))
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
              <div className="text-xs font-semibold text-muted-foreground">
                {benefitOptionsChanged ? "Benefit option changes are not saved yet." : "Benefit options are saved."}
              </div>
              <div className="flex items-center gap-2">
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="transition"
                  onClick={() => setBenefitOptionsModalOpen(false)}
                >
                  Close
                </UiButton>
                <UiButton variant="primary" size="sm"
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1.5 transition disabled:opacity-60"
                  onClick={() => void handleSaveJobBenefitOptions()}
                  disabled={jobBenefitOptionsSaving || !benefitOptionsChanged}
                >
                  <Save className="h-3.5 w-3.5" />
                  {jobBenefitOptionsSaving ? "Saving..." : "Save benefits"}
                </UiButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {countryOptionsModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCountryOptionsModalOpen(false)}
        >
          <div
            className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-panel bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-foreground">Manage countries</div>
                <div className="mt-1 text-xs text-muted-foreground">
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
                {jobCountryOptionsDraft.map((option) => (
                  <div
                    key={option.code}
                    className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card p-1.5"
                  >
                    <div className="flex h-8 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                      {toFlagEmoji(option.code) || option.code}
                    </div>
                    <UiInput
                      type="text"
                      value={option.name}
                      disabled={jobCountryOptionsSaving}
                      onChange={(event) =>
                        setJobCountryOptionsDraft((prev) =>
                          prev.map((country) =>
                            country.code === option.code
                              ? { ...country, name: event.target.value }
                              : country
                          )
                        )
                      }
                      className="h-8 min-w-0 flex-1"
                    />
                    <div className="shrink-0 rounded-lg bg-muted px-2 py-1 text-[10px] font-extrabold text-muted-foreground">
                      {option.code}
                    </div>
                    <UiButton variant="secondary" size="md"
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-destructive transition disabled:opacity-50"
                      aria-label={`Remove ${option.name}`}
                      disabled={jobCountryOptionsSaving || jobCountryOptionsDraft.length <= 1}
                      onClick={() => {
                        setJobCountryOptionsDraft((prev) =>
                          prev
                            .filter((country) => country.code !== option.code)
                            .map((country, nextIndex) => ({
                              ...country,
                              sortOrder: nextIndex,
                            }))
                        );
                        setJobCompanyCountryDrafts((prev) =>
                          Object.fromEntries(
                            Object.entries(prev).map(([companyId, codes]) => [
                              companyId,
                              codes.filter((code) => code !== option.code),
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
              <div className="text-xs font-semibold text-muted-foreground">
                {countryOptionsChanged ? "Country option changes are not saved yet." : "Country options are saved."}
              </div>
              <div className="flex items-center gap-2">
                <UiButton variant="secondary" size="sm"
                  type="button"
                  className="transition"
                  onClick={() => setCountryOptionsModalOpen(false)}
                >
                  Close
                </UiButton>
                <UiButton variant="primary" size="sm"
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1.5 transition disabled:opacity-60"
                  onClick={() => void handleSaveJobCountryOptions()}
                  disabled={jobCountryOptionsSaving || !countryOptionsChanged}
                >
                  <Save className="h-3.5 w-3.5" />
                  {jobCountryOptionsSaving ? "Saving..." : "Save countries"}
                </UiButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mergeHistoryOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setMergeHistoryOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-panel bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-foreground">Merge history</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Undo recent company merges from this list.
                </div>
              </div>
              <UiButton variant="secondary" size="sm"
                type="button"
                className=""
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
                      <span className="font-bold text-foreground">{merge.sourceName}</span>
                      {" into "}
                      <span className="font-bold text-foreground">{merge.targetName}</span>
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
      {isQuestionnaireModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={handleCloseQuestionnaireModal}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-panel bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <div className="text-sm font-semibold text-foreground">
                Create questionnaire
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Add a name and status for the questionnaire.
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Name
                </label>
                <UiInput
                  className="mt-2 h-11 w-full"
                  placeholder="Questionnaire name"
                  value={questionnaireName}
                  onChange={(event) => {
                    setQuestionnaireName(event.target.value);
                    if (questionnaireError) setQuestionnaireError(null);
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Status
                </label>
                <UiSelect
                  className="mt-2 h-11 w-full"
                  value={questionnaireStatus}
                  onChange={(event) =>
                    setQuestionnaireStatus(
                      event.target.value as QuestionnaireStatus
                    )
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Draft">Draft</option>
                </UiSelect>
              </div>
              {questionnaireError ? (
                <div className="text-xs text-destructive">
                  {questionnaireError}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <UiButton variant="secondary" size="sm"
                type="button"
                className=""
                onClick={handleCloseQuestionnaireModal}
              >
                Cancel
              </UiButton>
              <UiButton variant="primary" size="sm"
                type="button"
                className=""
                onClick={handleCreateQuestionnaire}
              >
                Create
              </UiButton>
            </div>
          </div>
        </div>
      ) : null}
      {isInviteModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={handleCloseInviteModal}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-panel bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border px-5 py-4">
              <div className="text-sm font-semibold text-foreground">
                Invite user
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Invited users must confirm their email before accessing the
                account.
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Name
                </label>
                <UiInput
                  className="mt-2 h-11 w-full"
                  placeholder="User name"
                  value={inviteName}
                  onChange={(event) => {
                    setInviteName(event.target.value);
                    if (inviteError) setInviteError(null);
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Email
                </label>
                <UiInput
                  className="mt-2 h-11 w-full"
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(event) => {
                    setInviteEmail(event.target.value);
                    if (inviteError) setInviteError(null);
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Role
                </label>
                <UiSelect
                  className="mt-2 h-11 w-full"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  <option>Admin</option>
                  <option>Member Premium</option>
                  <option>Member Basic</option>
                  <option>Visitor</option>
                </UiSelect>
              </div>
              {inviteError ? (
                <div className="text-xs text-destructive">{inviteError}</div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <UiButton variant="secondary" size="sm"
                type="button"
                className=""
                onClick={handleCloseInviteModal}
              >
                Cancel
              </UiButton>
              <UiButton variant="primary" size="sm"
                type="button"
                className="disabled:opacity-60"
                onClick={handleInviteUser}
                disabled={inviteLoading}
              >
                {inviteLoading ? "Sending..." : "Send invite"}
              </UiButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
