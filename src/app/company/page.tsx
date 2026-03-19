"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  ClipboardList,
  Database,
  FileText,
  Shield,
  Users2,
} from "lucide-react";
import { stages } from "@/app/pipeline/data";
import type { Pipeline, Stage } from "@/app/pipeline/types";
import {
  buildQuestionnaireId,
  DEFAULT_QUESTIONNAIRES,
  type Questionnaire,
  type QuestionnaireStatus,
} from "@/lib/questionnaires";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getCompanyBranding,
  invalidateCompanyBrandingCache,
} from "@/lib/company-branding-client";

type SectionId =
  | "overview"
  | "users"
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


export default function CompanyPage() {
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
  const [inviteRole, setInviteRole] = useState("Recruiter");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [userActionId, setUserActionId] = useState<string | null>(null);
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
  const [mailerliteConfigured, setMailerLiteConfigured] = useState(false);
  const [mailerliteSource, setMailerLiteSource] = useState<"db" | "env" | "none">("none");
  const [mailerliteMasked, setMailerLiteMasked] = useState<string | null>(null);
  const [mailerliteCanEdit, setMailerLiteCanEdit] = useState(false);
  const [mailerliteDraftKey, setMailerLiteDraftKey] = useState("");
  const [mailerliteSaving, setMailerLiteSaving] = useState(false);
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

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
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

      const res = await fetch("/api/company/branding", {
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

      const res = await fetch("/api/company/branding", {
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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    loadBranding();
  }, [loadBranding]);

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
    if (activeSection !== "integrations") return;
    let ignore = false;
    const load = async () => {
      setIntegrationsLoading(true);
      setIntegrationsError(null);
      try {
        const res = await fetch("/api/company/integrations", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Failed to load integrations");
        if (ignore) return;
        const ml = data?.mailerlite ?? {};
        setMailerLiteConfigured(!!ml.configured);
        setMailerLiteSource(ml.source === "db" || ml.source === "env" ? ml.source : "none");
        setMailerLiteMasked(typeof ml.masked === "string" ? ml.masked : null);
        setMailerLiteCanEdit(!!ml.canEdit);
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
          const normalized = data.map((item) => ({
            id: item.id,
            name: item.name,
            status: item.status === "Active" ? "Active" : "Draft",
          }));
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
    setInviteRole("Recruiter");
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
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role: inviteRole || "Member" }),
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
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
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
    } catch {
      // ignore for now
    } finally {
      setUserActionId(null);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    setUserActionId(userId);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
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

  return (
    <div className="h-full">
      <div className="border-b border-slate-200 px-8 py-6">
        <div className="text-sm font-semibold text-slate-500">Company</div>
        <div className="text-2xl font-semibold text-slate-900">
          Settings of the Company
        </div>
      </div>

      <div className="grid h-[calc(100%-76px)] grid-cols-[280px_1fr] gap-6 px-6 py-6">
        <aside className="h-full overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-semibold uppercase text-slate-400">
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
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm ${
                    isActive
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      isActive ? "bg-emerald-100" : "bg-slate-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {item.label}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="h-full overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-500">
                {active?.label}
              </div>
              <div className="text-xl font-semibold text-slate-900">
                {active?.description}
              </div>
            </div>
            {activeSection === "users" ? (
              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                onClick={() => setIsInviteModalOpen(true)}
                disabled={inviteLoading}
              >
                Invite user
              </button>
            ) : null}
            {activeSection === "questionnaires" ? (
              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                onClick={handleOpenQuestionnaireModal}
              >
                Create questionnaire
              </button>
            ) : null}
            {activeSection === "forms" ? (
              <button className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
                Create form
              </button>
            ) : null}
          </div>

          {activeSection === "overview" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Branding
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Update the app title and logo (used in sidebar + login page).
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {brandingLogoUrl ? (
                      <button
                        type="button"
                        className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        onClick={handleRemoveLogo}
                        disabled={brandingSaving}
                      >
                        Remove logo
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="h-9 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-60"
                      onClick={handleSaveBranding}
                      disabled={brandingSaving}
                    >
                      {brandingSaving ? "Saving..." : "Save branding"}
                    </button>
                  </div>
                </div>

                {brandingError ? (
                  <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
                    {brandingError}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      App title
                    </div>
                    <input
                      value={brandingTitle}
                      onChange={(event) => setBrandingTitle(event.target.value)}
                      className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                      placeholder="ISMIRA CRM"
                      maxLength={80}
                    />
                    <div className="text-xs text-slate-400">
                      Example: Ismira CRM, LinaS CRM, etc.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      Logo
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {brandingLogoDraftUrl || brandingLogoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={brandingLogoDraftUrl || brandingLogoUrl || ""}
                            alt={brandingTitle}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="text-xs font-semibold text-slate-400">
                            —
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
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
                          <button
                            type="button"
                            className="h-9 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            onClick={() => setBrandingLogoFile(null)}
                          >
                            Reset
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">
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
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      {field.label}
                    </div>
                    <input
                      className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
                <div className="space-y-2 sm:col-span-2">
                  <div className="text-xs font-semibold uppercase text-slate-500">
                    Company description
                  </div>
                  <textarea
                    className="min-h-[120px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Add a short description about your company."
                  />
                </div>
                <div className="flex justify-end sm:col-span-2">
                  <button className="rounded-full bg-slate-900 px-5 py-2 text-xs font-semibold text-white">
                    Save changes
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeSection === "positions" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 px-4 py-4 text-sm">
                <div className="font-semibold text-slate-900">
                  Pipelines & Pools
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Manage pipelines and pools in one place.
                </div>
              </div>
              {pipelinesError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
                  {pipelinesError}
                </div>
              ) : null}
              {pipelinesLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                  Loading pipelines...
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 px-4 py-4">
                <div className="text-xs font-semibold uppercase text-slate-500">
                  Create pipeline
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={pipelineName}
                    onChange={(event) => setPipelineName(event.target.value)}
                    placeholder="Pipeline name"
                    className="h-10 flex-1 rounded-md border border-slate-200 px-3 text-sm"
                  />
                  <button
                    type="button"
                    className="h-10 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleCreatePipeline}
                    disabled={pipelinesLoading}
                  >
                    Create
                  </button>
                </div>
                {pipelineError ? (
                  <div className="mt-2 text-xs text-rose-600">
                    {pipelineError}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200">
                {pipelines.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    No pipelines yet. Create your first pipeline.
                  </div>
                ) : (
                  pipelines.map((pipeline) => {
                    const isExpanded = expandedPipelineId === pipeline.id;
                    const stageDraft = stageDraftByPipeline[pipeline.id] ?? "";
                    return (
                      <div
                        key={pipeline.id}
                        className="border-b border-slate-200 px-4 py-3 text-sm last:border-b-0"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between text-left"
                          onClick={() => handleTogglePipeline(pipeline.id)}
                        >
                          <div>
                            <div className="font-semibold text-slate-900">
                              {pipeline.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {pipeline.stages.length} stages
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                              Active
                            </span>
                            <span className="text-slate-400">
                              {isExpanded ? "▾" : "▸"}
                            </span>
                          </div>
                        </button>

                        {isExpanded ? (
                          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="text-xs font-semibold uppercase text-slate-500">
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
                                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs text-slate-700 ${
                                        isOver
                                          ? "border-emerald-300 bg-emerald-50"
                                          : "border-slate-200 bg-white"
                                      } ${isDragging ? "opacity-60" : ""}`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="cursor-grab text-slate-400">
                                          ⋮⋮
                                        </span>
                                        <span className="font-semibold">
                                          {stage.name}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        className="text-rose-500 hover:text-rose-600"
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
                              <input
                                value={stageDraft}
                                onChange={(event) =>
                                  setStageDraftByPipeline((prev) => ({
                                    ...prev,
                                    [pipeline.id]: event.target.value,
                                  }))
                                }
                                placeholder="New stage name"
                                className="h-9 flex-1 rounded-md border border-slate-200 px-3 text-xs"
                              />
                              <button
                                type="button"
                                className="h-9 rounded-full bg-slate-900 px-4 text-xs font-semibold text-white"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleAddStage(pipeline.id);
                                }}
                              >
                                Add stage
                              </button>
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
              <input
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                placeholder="Search users..."
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
              />
              <div className="text-xs text-slate-500">
                New users must confirm their email. Admins can confirm accounts
                manually.
              </div>
              {usersError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                  {usersError}
                </div>
              ) : null}
              <div className="rounded-2xl border border-slate-200">
                {usersLoading ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    Loading users...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    {users.length === 0
                      ? "No users found."
                      : "No users match your search."}
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
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
                          <div className="font-semibold text-slate-900">
                            {user.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {user.email}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700"
                          value={user.role}
                          onChange={(event) =>
                            handleRoleChange(user.id, event.target.value)
                          }
                          disabled={userActionId === user.id}
                        >
                          <option>Admin</option>
                          <option>Recruiter</option>
                          <option>Viewer</option>
                          <option>Member</option>
                        </select>
                        {user.status === "pending" ? (
                          <>
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Pending confirmation
                            </span>
                            <button
                              type="button"
                              className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                              onClick={() => handleConfirmUser(user.id)}
                              disabled={userActionId === user.id}
                            >
                              Confirm account
                            </button>
                          </>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
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

          {activeSection === "questionnaires" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200">
                {questionnaires.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    No questionnaires yet. Create one to get started.
                  </div>
                ) : (
                  questionnaires.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm last:border-b-0"
                    >
                      <div className="font-semibold text-slate-900">
                        {item.name}
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          item.status === "Active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                Questionnaire builder is coming next.
              </div>
            </div>
          ) : null}

          {activeSection === "forms" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200">
                {[
                  { name: "Candidate intake form", status: "Active" },
                  { name: "Document request form", status: "Active" },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm last:border-b-0"
                  >
                    <div className="font-semibold text-slate-900">{item.name}</div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                Form builder is coming next.
              </div>
            </div>
          ) : null}

          {activeSection === "permissions" ? (
            <div className="mt-6 space-y-4">
              {[
                { role: "Admin", desc: "Full access to company settings." },
                { role: "Recruiter", desc: "Manage candidates and notes." },
                { role: "Viewer", desc: "Read-only access." },
              ].map((item) => (
                <div
                  key={item.role}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                >
                  <div className="font-semibold text-slate-900">{item.role}</div>
                  <div className="text-xs text-slate-500">{item.desc}</div>
                </div>
              ))}
            </div>
          ) : null}

          {activeSection === "integrations" ? (
            <div className="mt-6 space-y-4">
              {integrationsError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {integrationsError}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">MailerLite</div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        mailerliteConfigured
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {integrationsLoading ? "Loading…" : mailerliteConfigured ? "Configured" : "Not configured"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Used for group subscribers, filtered lists, and automation triggers.
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      API Key
                    </div>
                    <input
                      className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                      type="password"
                      value={mailerliteDraftKey}
                      onChange={(event) => setMailerLiteDraftKey(event.target.value)}
                      placeholder={mailerliteMasked ? `Current: ${mailerliteMasked}` : "Paste MailerLite API key"}
                      disabled={!mailerliteCanEdit}
                    />
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!mailerliteCanEdit || mailerliteSaving || integrationsLoading}
                        onClick={async () => {
                          setMailerLiteSaving(true);
                          setIntegrationsError(null);
                          try {
                            const res = await fetch("/api/company/integrations", {
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
                            const statusRes = await fetch("/api/company/integrations", { cache: "no-store" });
                            const statusData = await statusRes.json().catch(() => null);
                            const ml = statusData?.mailerlite ?? {};
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
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        disabled={!mailerliteCanEdit || mailerliteSaving || integrationsLoading}
                        onClick={async () => {
                          setMailerLiteSaving(true);
                          setIntegrationsError(null);
                          try {
                            const res = await fetch("/api/company/integrations", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ mailerlite_api_key: "" }),
                            });
                            const data = await res.json().catch(() => null);
                            if (!res.ok) throw new Error(data?.error ?? "Failed to clear");
                            setMailerLiteDraftKey("");
                            const statusRes = await fetch("/api/company/integrations", { cache: "no-store" });
                            const statusData = await statusRes.json().catch(() => null);
                            const ml = statusData?.mailerlite ?? {};
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
                      </button>
                      <span className="text-[11px] text-slate-500">
                        Source: {mailerliteSource.toUpperCase()}
                      </span>
                      {!mailerliteCanEdit ? (
                        <span className="text-[11px] text-slate-500">
                          Admin only.
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">Supabase</div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      Read-only
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    These values are configured via environment variables at deploy time.
                  </div>

                  <div className="mt-4 space-y-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-500">NEXT_PUBLIC_SUPABASE_URL</div>
                      <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <code className="block min-w-0 truncate text-[11px] text-slate-700">
                          {process.env.NEXT_PUBLIC_SUPABASE_URL ?? "—"}
                        </code>
                        <button
                          type="button"
                          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700"
                          onClick={async () => {
                            const value = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
                            if (!value) return;
                            await navigator.clipboard.writeText(value);
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-500">NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
                      <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <code className="block min-w-0 truncate text-[11px] text-slate-700">
                          {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                            ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 10)}…${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(-6)}`
                            : "—"}
                        </code>
                        <button
                          type="button"
                          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700"
                          onClick={async () => {
                            const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
                            if (!value) return;
                            await navigator.clipboard.writeText(value);
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      To change these, update `.env.local` and restart the dev server.
                    </div>
                  </div>
                </div>
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
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                >
                  <span className="text-slate-700">{item}</span>
                  <input type="checkbox" className="h-4 w-4" />
                </label>
              ))}
            </div>
          ) : null}

          {activeSection === "storage" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <div className="font-semibold text-slate-900">
                  Document retention
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Configure how long files are stored.
                </div>
                <select className="mt-3 h-10 w-full rounded-md border border-slate-200 px-3 text-sm">
                  <option>1 year</option>
                  <option>2 years</option>
                  <option>3 years</option>
                  <option>Indefinite</option>
                </select>
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                Storage settings will connect to Supabase later.
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {isQuestionnaireModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={handleCloseQuestionnaireModal}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">
                Create questionnaire
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Add a name and status for the questionnaire.
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Name
                </label>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                  placeholder="Questionnaire name"
                  value={questionnaireName}
                  onChange={(event) => {
                    setQuestionnaireName(event.target.value);
                    if (questionnaireError) setQuestionnaireError(null);
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Status
                </label>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                  value={questionnaireStatus}
                  onChange={(event) =>
                    setQuestionnaireStatus(
                      event.target.value as QuestionnaireStatus
                    )
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>
              {questionnaireError ? (
                <div className="text-xs text-rose-600">
                  {questionnaireError}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                onClick={handleCloseQuestionnaireModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                onClick={handleCreateQuestionnaire}
              >
                Create
              </button>
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
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">
                Invite user
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Invited users must confirm their email before accessing the
                account.
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Name
                </label>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                  placeholder="User name"
                  value={inviteName}
                  onChange={(event) => {
                    setInviteName(event.target.value);
                    if (inviteError) setInviteError(null);
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Email
                </label>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                  placeholder="name@company.com"
                  value={inviteEmail}
                  onChange={(event) => {
                    setInviteEmail(event.target.value);
                    if (inviteError) setInviteError(null);
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Role
                </label>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  <option>Admin</option>
                  <option>Recruiter</option>
                  <option>Viewer</option>
                </select>
              </div>
              {inviteError ? (
                <div className="text-xs text-rose-600">{inviteError}</div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                onClick={handleCloseInviteModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                onClick={handleInviteUser}
                disabled={inviteLoading}
              >
                {inviteLoading ? "Sending..." : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
