"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Database,
  Inbox,
  Layers,
  Mail,
  Notebook,
  Plus,
  Search,
  Clock,
  MessageCircle,
  Paperclip,
  Trash2,
} from "lucide-react";
import Board from "./components/Board";
import AddCandidateModal, {
  AddCandidatePayload,
} from "./components/AddCandidateModal";
import CandidateDrawer from "./components/CandidateDrawer";
import { getAvatarClass } from "./components/CandidateCard";
import { formatEmailShort, formatRelative } from "./utils";
import { pools, stages } from "./data";
import {
  ActivityEvent,
  Candidate,
  Pipeline,
  Stage,
  TaskItem,
} from "./types";
import { FORM_FIELD_KEYS, FORM_FILE_FIELDS, type FormFieldKey } from "@/lib/form-fields";
import {
  canonicalizeCountry,
  getCountryCode,
  getCountryDisplay,
} from "@/lib/country";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureCompanyBootstrap } from "@/lib/company/bootstrap-client";

const MAILERLITE_STAGE_ID = "consultation";
const MAILERLITE_PIPELINE_ID = "mailerlite";
const BREEZY_PIPELINE_ID = "breezy";
const COMPANIES_PIPELINE_ID = "companies";
const ENABLE_SMART_SEARCH = true;
const OPEN_PROFILE_EVENT = "pipeline-open-profile";

const getInitials = (name?: string) => {
  const safe = name?.trim() || "";
  if (!safe) return "?";
  const parts = safe.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const normalizeQuery = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toSlugPart = (value?: string) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getCandidateShareKey = (candidateId: string) => {
  const cleaned = candidateId.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (!cleaned) return "00000000";

  let hash = 0;
  for (const char of cleaned) {
    const digit = Number.parseInt(char, 16);
    if (Number.isNaN(digit)) continue;
    hash = (hash * 16 + digit) % 100000000;
  }

  return String(hash).padStart(8, "0");
};

const getCandidateLastNameSlug = (name?: string) => {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "candidate";
  return toSlugPart(lastName) || "candidate";
};

const getCandidateShareSlug = (candidate: Pick<Candidate, "id" | "name">) =>
  `${getCandidateShareKey(candidate.id)}-${getCandidateLastNameSlug(candidate.name)}`;

const parseCandidateShareParam = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d{8})(?:-(.+))?$/);
  if (!match) return null;

  return {
    key: match[1],
    lastNameSlug: match[2] ?? "",
  };
};

type SmartSearchFilters = {
  tokens: string[];
};

const buildSmartSearchFilters = (query: string): SmartSearchFilters => {
  const normalized = normalizeQuery(query);
  if (!normalized) return { tokens: [] };
  return { tokens: normalized.split(" ").filter(Boolean) };
};

const buildCandidateHaystack = (candidate: Candidate) => {
  const countryLabel =
    canonicalizeCountry(candidate.country) ?? candidate.country ?? "";
  const nationalityLabel =
    canonicalizeCountry(candidate.nationality) ?? candidate.nationality ?? "";
  const countryCode = getCountryCode(candidate.country ?? "") ?? "";
  const nationalityCode = getCountryCode(candidate.nationality ?? "") ?? "";
  const phoneDigits = candidate.phone ? candidate.phone.replace(/\D+/g, "") : "";
  const parts = [
    candidate.name,
    candidate.email,
    candidate.phone,
    phoneDigits,
    countryLabel,
    nationalityLabel,
    candidate.country,
    candidate.nationality,
    countryCode,
    nationalityCode,
  ].filter(Boolean).join(" ");
  return normalizeQuery(parts);
};

type MailerLiteGroup = {
  id: string;
  name?: string;
  active_count?: number;
  total?: number;
};

type MailerLiteSubscriber = {
  id: string;
  email?: string;
  name?: string;
  fields?: Record<string, unknown>;
  subscribed_at?: string;
  created_at?: string;
};

type IntakeFormSubmission = {
  token: string;
  candidate_id: string;
  fields?: string[];
  payload?: Record<string, unknown>;
  submitted_at?: string;
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

type NoteRow = {
  id: string;
  candidate_id: string;
  body: string;
  created_at: string | null;
  author_name?: string | null;
  author_email?: string | null;
  author_id?: string | null;
};

type TaskRow = {
  candidate_id: string;
  id: string;
  title: string;
  status: string;
  created_at: string | null;
  watcher_ids?: string[] | null;
  completed_at?: string | null;
  completed_by?: string | null;
  assigned_to?: string | null;
  due_at?: string | null;
  reminder_minutes_before?: number | null;
  notes?: string | null;
};

type WorkHistoryRow = {
  candidate_id: string;
  id: string;
  role: string;
  company: string;
  start?: string | null;
  end?: string | null;
  details?: string | null;
  created_at?: string | null;
};

type EducationRow = {
  candidate_id: string;
  id: string;
  program: string;
  institution: string;
  start?: string | null;
  end?: string | null;
  details?: string | null;
  created_at?: string | null;
};

type AttachmentRow = {
  candidate_id: string;
  id: string;
  name?: string | null;
  mime?: string | null;
  url?: string | null;
  path?: string | null;
  kind?: string | null;
  created_at?: string | null;
  created_by?: string | null;
};

type ScorecardRow = {
  candidate_id: string;
  thoughts?: string | null;
  overall_rating?: number | null;
  entries?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type QuestionnaireRow = {
  id: string;
  candidate_id: string;
  questionnaire_id?: string | null;
  name?: string | null;
  status?: string | null;
  sent_at?: string | null;
  sent_by?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cloneStages = (source: Stage[]) =>
  source.map((stage, index) => ({
    ...stage,
    order: Number.isFinite(stage.order) ? stage.order : index,
  }));

const buildDefaultPipelines = (): Pipeline[] => [
  {
    id: MAILERLITE_PIPELINE_ID,
    name: "MailerLite",
    stages: cloneStages(stages),
  },
  {
    id: BREEZY_PIPELINE_ID,
    name: "Breezy",
    stages: cloneStages(stages),
  },
  {
    id: COMPANIES_PIPELINE_ID,
    name: "Companies",
    stages: cloneStages(stages),
  },
];

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

const mapCandidateRow = (row: CandidateRow): Candidate => {
  const data = (row.data ?? {}) as Partial<Candidate>;
  const email =
    typeof data.email === "string" && data.email.trim()
      ? data.email.trim()
      : `unknown-${row.id}@intake.local`;
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : email.split("@")[0] ?? "Unknown";
  return {
    ...data,
    name,
    email,
    id: row.id,
    pipeline_id:
      row.pipeline_id ??
      data.pipeline_id ??
      MAILERLITE_PIPELINE_ID,
    stage_id:
      row.stage_id ?? data.stage_id ?? MAILERLITE_STAGE_ID,
    pool_id: row.pool_id ?? data.pool_id ?? pools[0]?.id ?? "roomy",
    status: (row.status as Candidate["status"]) ?? data.status ?? "active",
    order: typeof row.order === "number" ? row.order : data.order ?? 0,
    created_at: row.created_at ?? data.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? data.updated_at ?? new Date().toISOString(),
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
    tasks,
    work_history,
    education,
    attachments,
    scorecard,
    questionnaires_sent,
    ...data
  } = candidate;
  return {
    id,
    pipeline_id,
    stage_id,
    pool_id,
    status,
    order,
    created_at,
    updated_at,
    data,
  };
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const buildUniqueId = (base: string, existing: Set<string>) => {
  const normalized = slugify(base) || "pipeline";
  if (!existing.has(normalized)) return normalized;
  let index = 2;
  while (existing.has(`${normalized}-${index}`)) {
    index += 1;
  }
  return `${normalized}-${index}`;
};

const PROFILE_TASK_IDS = new Set([
  "profile_summary",
  "profile_work_history",
  "profile_education",
]);

const normalizeTaskStatus = (status?: string) =>
  status === "done" ? "done" : "open";

const stripProfileTasks = (candidate: Candidate): Candidate => {
  if (!Array.isArray(candidate.tasks) || candidate.tasks.length === 0) {
    return candidate;
  }
  const nextTasks = candidate.tasks.filter((task) => !PROFILE_TASK_IDS.has(task.id));
  return nextTasks.length === candidate.tasks.length
    ? candidate
    : { ...candidate, tasks: nextTasks };
};

const stripRelatedFields = (candidate: Candidate): Candidate => {
  const {
    tasks,
    work_history,
    education,
    attachments,
    scorecard,
    questionnaires_sent,
    ...rest
  } = candidate;
  return rest;
};

const buildTaskRows = (candidate: Candidate): TaskRow[] => {
  const tasks = Array.isArray(candidate.tasks) ? candidate.tasks : [];
  const requestInfoIds = new Set<string>(FORM_FIELD_KEYS);
  return tasks
    .filter(
      (task) =>
        task &&
        task.id &&
        task.title &&
        !PROFILE_TASK_IDS.has(task.id) &&
        !task.id.startsWith("form_") &&
        !requestInfoIds.has(task.id)
    )
    .map((task) => ({
      candidate_id: candidate.id,
      id: task.id,
      title: task.title,
      status: normalizeTaskStatus(task.status),
      created_at: task.created_at ?? new Date().toISOString(),
      watcher_ids: Array.isArray(task.watcher_ids)
        ? task.watcher_ids.filter(
            (id): id is string => typeof id === "string" && id.length > 0
          )
        : [],
      assigned_to: typeof task.assigned_to === "string" ? task.assigned_to : null,
      due_at: typeof task.due_at === "string" ? task.due_at : null,
      reminder_minutes_before:
        typeof task.reminder_minutes_before === "number"
          ? task.reminder_minutes_before
          : null,
      notes: typeof task.notes === "string" ? task.notes : null,
      ...(normalizeTaskStatus(task.status) !== "done"
        ? { completed_at: null, completed_by: null }
        : {}),
    }));
};

const buildWorkHistoryRows = (candidate: Candidate): WorkHistoryRow[] => {
  const items = Array.isArray(candidate.work_history) ? candidate.work_history : [];
  return items
    .filter((item) => item && item.id)
    .map((item) => ({
      candidate_id: candidate.id,
      id: item.id,
      role: item.role?.trim() || "Role",
      company: item.company?.trim() || "Company",
      start: item.start ?? null,
      end: item.end ?? null,
      details: item.details ?? null,
      created_at: new Date().toISOString(),
    }));
};

const buildEducationRows = (candidate: Candidate): EducationRow[] => {
  const items = Array.isArray(candidate.education) ? candidate.education : [];
  return items
    .filter((item) => item && item.id)
    .map((item) => ({
      candidate_id: candidate.id,
      id: item.id,
      program: item.program?.trim() || "Program",
      institution: item.institution?.trim() || "Institution",
      start: item.start ?? null,
      end: item.end ?? null,
      details: item.details ?? null,
      created_at: new Date().toISOString(),
    }));
};

const buildAttachmentRows = (candidate: Candidate): AttachmentRow[] => {
  const items = Array.isArray(candidate.attachments) ? candidate.attachments : [];
  return items
    .filter((item) => item && item.id)
    .map((item) => ({
      candidate_id: candidate.id,
      id: item.id,
      name: item.name ?? null,
      mime: item.mime ?? null,
      url: item.url ?? null,
      path: item.path ?? null,
      kind: item.kind ?? null,
      created_at: item.created_at ?? null,
      created_by: item.created_by ?? null,
    }));
};

const buildScorecardRow = (candidate: Candidate): ScorecardRow | null => {
  const scorecard = candidate.scorecard;
  if (!scorecard) return null;
  const hasEntries =
    !!scorecard.thoughts?.trim() ||
    typeof scorecard.overall_rating === "number" ||
    (scorecard.entries && Object.keys(scorecard.entries).length > 0);
  if (!hasEntries) return null;
  return {
    candidate_id: candidate.id,
    thoughts: scorecard.thoughts ?? null,
    overall_rating:
      typeof scorecard.overall_rating === "number"
        ? scorecard.overall_rating
        : null,
    entries: scorecard.entries ?? {},
    updated_at: new Date().toISOString(),
  };
};

const buildQuestionnaireRows = (candidate: Candidate): QuestionnaireRow[] => {
  const items = Array.isArray(candidate.questionnaires_sent)
    ? candidate.questionnaires_sent
    : [];
  return items
    .filter((item) => item && item.id && item.name)
    .map((item) => ({
      id: item.id,
      candidate_id: candidate.id,
      questionnaire_id: item.questionnaire_id ?? item.id,
      name: item.name,
      status: item.status ?? "Draft",
      sent_at: item.sent_at,
      sent_by: item.sent_by ?? null,
    }));
};

const normalizeQuestionnaireEntries = (
  entries: Candidate["questionnaires_sent"]
) => {
  if (!Array.isArray(entries)) return [];
  return entries.map((item) => {
    const rowId = item.id && isUuid(item.id) ? item.id : crypto.randomUUID();
    const questionnaireId =
      item.questionnaire_id ??
      (item.id && !isUuid(item.id) ? item.id : undefined);
    return {
      ...item,
      id: rowId,
      questionnaire_id: questionnaireId,
    };
  });
};

function sortByOrder(list: Candidate[]) {
  return [...list].sort((a, b) => a.order - b.order);
}

function formatColumnCandidates(
  list: Candidate[],
  stageId: string,
  pipelineId?: string
) {
  return sortByOrder(
    list.filter((candidate) => {
      if (pipelineId && candidate.pipeline_id !== pipelineId) return false;
      return candidate.stage_id === stageId;
    })
  );
}

function buildOrder(list: Candidate[]) {
  return list.map((candidate, index) => ({ ...candidate, order: index }));
}

function applyFormSubmission(candidate: Candidate, form: IntakeFormSubmission) {
  const payload = isRecord(form.payload) ? form.payload : null;
  if (!payload) return candidate;

  let changed = false;
  const updates: Partial<Candidate> = {};

  const stringFieldUpdates: Array<keyof Candidate> = [
    "email",
    "phone",
    "nationality",
    "country",
  ];

  stringFieldUpdates.forEach((key) => {
    const value = payload[key as string];
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      if (candidate[key] !== trimmed) {
        updates[key] = trimmed as never;
        changed = true;
      }
    }
  });

  const summaryValue =
    typeof payload.summary === "string" ? payload.summary.trim() : "";
  if (summaryValue && candidate.experience_summary !== summaryValue) {
    updates.experience_summary = summaryValue;
    changed = true;
  }

  const workHistoryValue =
    typeof payload.work_history === "string" ? payload.work_history.trim() : "";
  if (workHistoryValue) {
    const existing = candidate.work_history ?? [];
    const hasEntry = existing.some(
      (item) => (item.details ?? "").trim() === workHistoryValue
    );
    if (!hasEntry) {
      updates.work_history = [
        ...existing,
        {
          id: crypto.randomUUID(),
          role: "Work history",
          company: "Provided by candidate",
          details: workHistoryValue,
        },
      ];
      changed = true;
    }
  }

  const educationValue =
    typeof payload.education === "string" ? payload.education.trim() : "";
  if (educationValue) {
    const existing = candidate.education ?? [];
    const hasEntry = existing.some(
      (item) => (item.details ?? "").trim() === educationValue
    );
    if (!hasEntry) {
      updates.education = [
        ...existing,
        {
          id: crypto.randomUUID(),
          program: "Education",
          institution: "Provided by candidate",
          details: educationValue,
        },
      ];
      changed = true;
    }
  }

  if (Object.keys(payload).some((key) => FORM_FILE_FIELDS.has(key as FormFieldKey))) {
    const existingAttachments = candidate.attachments ?? [];
    const existingUrls = new Set(
      existingAttachments.map((attachment) => attachment.url).filter(Boolean)
    );
    const existingPaths = new Set(
      existingAttachments.map((attachment) => attachment.path).filter(Boolean)
    );
    const nextAttachments = [...existingAttachments];

    Object.entries(payload).forEach(([key, value]) => {
      if (!FORM_FILE_FIELDS.has(key as FormFieldKey)) return;
      if (!isRecord(value)) return;
      const url = typeof value.url === "string" ? value.url : null;
      const path = typeof value.path === "string" ? value.path : null;
      if ((url && existingUrls.has(url)) || (path && existingPaths.has(path))) {
        return;
      }
      nextAttachments.push({
        id: crypto.randomUUID(),
        name:
          typeof value.name === "string" && value.name.trim()
            ? value.name
            : key,
        mime: typeof value.mime === "string" ? value.mime : undefined,
        url: url ?? undefined,
        path: path ?? undefined,
        kind: "document",
        created_at: form.submitted_at ?? new Date().toISOString(),
        created_by: candidate.name || "Candidate",
      });
      if (url) existingUrls.add(url);
      if (path) existingPaths.add(path);
      changed = true;
    });

    if (changed) {
      updates.attachments = nextAttachments;
    }
  }

  if (candidate.tasks && candidate.tasks.length > 0) {
    const completedKeys = new Set(Object.keys(payload));
    const nextTasks: TaskItem[] = candidate.tasks.map((task): TaskItem => {
      if (!task.id.startsWith("form_")) return task;
      const fieldKey = task.id.replace("form_", "");
      if (!completedKeys.has(fieldKey)) return task;
      if (task.status === "done") return task;
      changed = true;
      return { ...task, status: "done" };
    });
    if (changed) {
      updates.tasks = nextTasks;
    }
  }

  if (!changed) return candidate;
  return {
    ...candidate,
    ...updates,
    updated_at: new Date().toISOString(),
  };
}

type DrawerRequestedRightTab = "tasks" | null;

const parseDrawerRequestedRightTab = (value: string | null): DrawerRequestedRightTab =>
  value === "tasks" ? "tasks" : null;

export default function PipelinePage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>(
    {}
  );
  const [hasMigrated, setHasMigrated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    name?: string;
    email?: string;
    id?: string;
    avatar_url?: string | null;
  } | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [pipelines, setPipelines] = useState<Pipeline[]>(() =>
    buildDefaultPipelines()
  );
  const [selectedPipelineId, setSelectedPipelineId] = useState(
    MAILERLITE_PIPELINE_ID
  );
  const [hydrated, setHydrated] = useState(false);
  const [smartSearchQuery, setSmartSearchQuery] = useState("");
  const [smartSearchOpen, setSmartSearchOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [drawerCandidateId, setDrawerCandidateId] = useState<string | null>(null);
  const [drawerRequestedRightTab, setDrawerRequestedRightTab] =
    useState<DrawerRequestedRightTab>(() =>
      parseDrawerRequestedRightTab(searchParams.get("tab"))
    );
  const [mailerliteGroups, setMailerliteGroups] = useState<MailerLiteGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedMailerLiteGroupId, setSelectedMailerLiteGroupId] =
    useState<string>("");
  const [importingGroupId, setImportingGroupId] = useState<string>("");
  const [mailerliteError, setMailerliteError] = useState<string | null>(null);
  const [breezyImporting, setBreezyImporting] = useState(false);
  const [breezyError, setBreezyError] = useState<string | null>(null);
  const [breezyImportedCount, setBreezyImportedCount] = useState<number | null>(
    null
  );
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [mailerliteDetailsLoading, setMailerliteDetailsLoading] = useState<
    Record<string, boolean>
  >({});
  const [mailerliteDetailsError, setMailerliteDetailsError] = useState<
    Record<string, string | null>
  >({});
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState(false);
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [formsSyncEnabled, setFormsSyncEnabled] = useState(true);
  const shareSyncRef = useRef<string | null>(null);
  const hydratedShareRef = useRef(false);
  const initialShareProfileParamRef = useRef<string | null>(
    searchParams.get("profile")
  );
  const initialShareTabParamRef = useRef<string | null>(searchParams.get("tab"));
  const pendingShareSlugRef = useRef<string | null>(null);
  const pendingShareTabRef = useRef<DrawerRequestedRightTab>(null);

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

  const loadRemoteData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setRemoteLoading(true);
      }
      setRemoteError(null);
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
          const seeded = buildPipelinesFromRows(
            (seededPipelines ?? []) as PipelineRow[],
            (seededStages ?? []) as StageRow[]
          );
          setPipelines(seeded);
        } else {
          setPipelines(pipelinesFromDb);
        }

        const { data: candidateRows, error: candidateError } = await supabase
          .from("candidates")
          .select(
            "id,pipeline_id,stage_id,pool_id,status,order,created_at,updated_at,data"
          );
        if (candidateError) throw new Error(candidateError.message);
        const candidateRowList = (candidateRows ?? []) as CandidateRow[];
        const candidateIds = candidateRowList.map((row) => row.id);

      let noteCountMap: Record<string, number> = {};
      let attachmentCountMap: Record<string, number> = {};

      if (candidateIds.length > 0) {
	        const [noteResult, attachmentResult] = await Promise.all([
	          supabase
	            .from("candidate_notes")
	            .select("candidate_id")
	            .not("author_id", "is", null)
	            .in("candidate_id", candidateIds),
	          supabase
	            .from("candidate_attachments")
	            .select("candidate_id")
            .in("candidate_id", candidateIds),
        ]);

        if (noteResult.error) throw new Error(noteResult.error.message);
        if (attachmentResult.error)
          throw new Error(attachmentResult.error.message);

        noteCountMap = (noteResult.data ?? []).reduce<Record<string, number>>(
          (acc, row) => {
            const id = (row as { candidate_id?: string }).candidate_id;
            if (!id) return acc;
            acc[id] = (acc[id] ?? 0) + 1;
            return acc;
          },
          {}
        );

        attachmentCountMap = (
          attachmentResult.data ?? []
        ).reduce<Record<string, number>>((acc, row) => {
          const id = (row as { candidate_id?: string }).candidate_id;
          if (!id) return acc;
          acc[id] = (acc[id] ?? 0) + 1;
          return acc;
        }, {});
      }

      const migrateTaskRows: TaskRow[] = [];
      const migrateWorkRows: WorkHistoryRow[] = [];
      const migrateEducationRows: EducationRow[] = [];
      const migrateAttachmentRows: AttachmentRow[] = [];
      const migrateScorecardRows: ScorecardRow[] = [];
      const migrateQuestionnaireRows: QuestionnaireRow[] = [];

      const mappedCandidates = candidateRowList.map((row) => {
        const candidate = mapCandidateRow(row);

        if (!hasMigrated) {
          if (Array.isArray(candidate.tasks) && candidate.tasks.length > 0) {
            const tasks = candidate.tasks.filter(
              (task) =>
                task && task.id && task.title && !PROFILE_TASK_IDS.has(task.id)
            );
            if (tasks.length > 0) {
              migrateTaskRows.push(...buildTaskRows({ ...candidate, tasks }));
            }
          }

          if (Array.isArray(candidate.work_history) && candidate.work_history.length > 0) {
            const normalized = candidate.work_history.map((item) => ({
              ...item,
              id: item.id || crypto.randomUUID(),
            }));
            migrateWorkRows.push(
              ...buildWorkHistoryRows({ ...candidate, work_history: normalized })
            );
          }

          if (Array.isArray(candidate.education) && candidate.education.length > 0) {
            const normalized = candidate.education.map((item) => ({
              ...item,
              id: item.id || crypto.randomUUID(),
            }));
            migrateEducationRows.push(
              ...buildEducationRows({ ...candidate, education: normalized })
            );
          }

          if (Array.isArray(candidate.attachments) && candidate.attachments.length > 0) {
            const normalized = candidate.attachments.map((item) => ({
              ...item,
              id: item.id || crypto.randomUUID(),
            }));
            migrateAttachmentRows.push(
              ...buildAttachmentRows({ ...candidate, attachments: normalized })
            );
          }

          if (candidate.scorecard) {
            const row = buildScorecardRow(candidate);
            if (row) migrateScorecardRows.push(row);
          }

          if (
            Array.isArray(candidate.questionnaires_sent) &&
            candidate.questionnaires_sent.length > 0
          ) {
            const normalized = normalizeQuestionnaireEntries(
              candidate.questionnaires_sent
            );
            migrateQuestionnaireRows.push(
              ...buildQuestionnaireRows({
                ...candidate,
                questionnaires_sent: normalized,
              })
            );
          }
        }

        return stripProfileTasks(stripRelatedFields(candidate));
      });

      setCandidates((prev) => {
        if (!prev || prev.length === 0) return mappedCandidates;
        const prevById = new Map(prev.map((candidate) => [candidate.id, candidate]));
        return mappedCandidates.map((candidate) => {
          const previous = prevById.get(candidate.id);
          if (!previous) return candidate;
          return {
            ...candidate,
            tasks:
              typeof previous.tasks === "undefined" ? candidate.tasks : previous.tasks,
            work_history:
              typeof previous.work_history === "undefined"
                ? candidate.work_history
                : previous.work_history,
            education:
              typeof previous.education === "undefined"
                ? candidate.education
                : previous.education,
            attachments:
              typeof previous.attachments === "undefined"
                ? candidate.attachments
                : previous.attachments,
            scorecard:
              typeof previous.scorecard === "undefined"
                ? candidate.scorecard
                : previous.scorecard,
            questionnaires_sent:
              typeof previous.questionnaires_sent === "undefined"
                ? candidate.questionnaires_sent
                : previous.questionnaires_sent,
          };
        });
      });
      setNoteCounts(noteCountMap);
      setAttachmentCounts(attachmentCountMap);

      const migrations: PromiseLike<unknown>[] = [];
      if (migrateTaskRows.length > 0) {
        migrations.push(
          supabase
            .from("candidate_tasks")
            .upsert(migrateTaskRows, { onConflict: "candidate_id,id" })
        );
      }
      if (migrateWorkRows.length > 0) {
        migrations.push(
          supabase
            .from("candidate_work_history")
            .upsert(migrateWorkRows, { onConflict: "id" })
        );
      }
      if (migrateEducationRows.length > 0) {
        migrations.push(
          supabase
            .from("candidate_education")
            .upsert(migrateEducationRows, { onConflict: "id" })
        );
      }
      if (migrateAttachmentRows.length > 0) {
        migrations.push(
          supabase
            .from("candidate_attachments")
            .upsert(migrateAttachmentRows, { onConflict: "id" })
        );
      }
      if (migrateScorecardRows.length > 0) {
        migrations.push(
          supabase
            .from("candidate_scorecards")
            .upsert(migrateScorecardRows, { onConflict: "candidate_id" })
        );
      }
      if (migrateQuestionnaireRows.length > 0) {
        migrations.push(
          supabase
            .from("candidate_questionnaires")
            .upsert(migrateQuestionnaireRows, { onConflict: "id" })
        );
      }
      if (migrations.length > 0) {
        void Promise.all(migrations);
      }
      if (!hasMigrated) {
        setHasMigrated(true);
      }
    } catch (err) {
      setRemoteError(
        err instanceof Error ? err.message : "Failed to load pipeline data"
      );
    } finally {
      if (!silent) {
        setRemoteLoading(false);
      }
      setHydrated(true);
    }
  },
  [supabase, seedRemotePipelines, hasMigrated]
  );

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setRemoteError((prev) => prev ?? "Pipeline load timed out.");
      setRemoteLoading(false);
      setHydrated(true);
    }, 15_000);

    Promise.resolve(loadRemoteData()).finally(() => {
      window.clearTimeout(timer);
    });

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadRemoteData]);

  useEffect(() => {
    if (!hydrated) return;
    const channel = supabase.channel("pipeline-realtime");
    const refreshAll = () => {
      void loadRemoteData(true);
    };
    const updateNoteCount = (candidateId: string, delta: number) => {
      setNoteCounts((prev) => {
        const next = { ...prev };
        const current = next[candidateId] ?? 0;
        const updated = current + delta;
        if (updated <= 0) {
          delete next[candidateId];
        } else {
          next[candidateId] = updated;
        }
        return next;
      });
    };
    const updateAttachmentCount = (candidateId: string, delta: number) => {
      setAttachmentCounts((prev) => {
        const next = { ...prev };
        const current = next[candidateId] ?? 0;
        const updated = current + delta;
        if (updated <= 0) {
          delete next[candidateId];
        } else {
          next[candidateId] = updated;
        }
        return next;
      });
    };

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "candidates" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const oldRow = payload.old as CandidateRow | null;
          if (!oldRow?.id) return;
          setCandidates((prev) => prev.filter((item) => item.id !== oldRow.id));
          setNoteCounts((prev) => {
            if (!prev[oldRow.id]) return prev;
            const next = { ...prev };
            delete next[oldRow.id];
            return next;
          });
          setAttachmentCounts((prev) => {
            if (!prev[oldRow.id]) return prev;
            const next = { ...prev };
            delete next[oldRow.id];
            return next;
          });
          return;
        }
        const row = payload.new as CandidateRow | null;
        if (!row?.id) return;
        const mapped = mapCandidateRow(row);
        setCandidates((prev) => {
          const existingIndex = prev.findIndex((item) => item.id === mapped.id);
          if (existingIndex === -1) return [...prev, mapped];
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], ...mapped };
          return next;
        });
      }
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "candidate_notes" },
      (payload) => {
        const row =
          payload.eventType === "DELETE"
            ? (payload.old as NoteRow | null)
            : (payload.new as NoteRow | null);
        if (!row?.candidate_id) return;
        if (payload.eventType === "INSERT") {
          updateNoteCount(row.candidate_id, 1);
        } else if (payload.eventType === "DELETE") {
          updateNoteCount(row.candidate_id, -1);
        }
      }
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "candidate_attachments" },
      (payload) => {
        const row =
          payload.eventType === "DELETE"
            ? (payload.old as AttachmentRow | null)
            : (payload.new as AttachmentRow | null);
        if (!row?.candidate_id) return;
        if (payload.eventType === "INSERT") {
          updateAttachmentCount(row.candidate_id, 1);
        } else if (payload.eventType === "DELETE") {
          updateAttachmentCount(row.candidate_id, -1);
        }
      }
    );

    ["pipelines", "pipeline_stages"].forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refreshAll
      );
    });

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, hydrated, loadRemoteData]);

  useEffect(() => {
    let ignore = false;
    const loadUser = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user || ignore) return;
        const metadata = data.user.user_metadata as Record<string, unknown> | null;
        const first =
          typeof metadata?.first_name === "string" ? metadata.first_name.trim() : "";
        const last =
          typeof metadata?.last_name === "string" ? metadata.last_name.trim() : "";
        const combined = [first, last].filter(Boolean).join(" ").trim();
        const nameCandidate =
          combined ||
          (typeof metadata?.full_name === "string" && metadata.full_name.trim()) ||
          (typeof metadata?.name === "string" && metadata.name.trim()) ||
          (typeof metadata?.display_name === "string" &&
            metadata.display_name.trim()) ||
          "";
        let avatar =
          typeof metadata?.avatar_url === "string" ? metadata.avatar_url : null;
        const avatarPath =
          typeof metadata?.avatar_path === "string" ? metadata.avatar_path : null;
        if (!avatar && avatarPath) {
          try {
            const res = await fetch(
              `/api/storage/sign?bucket=candidate-documents&path=${encodeURIComponent(
                avatarPath
              )}`,
              { cache: "no-store" }
            );
            const signed = await res.json().catch(() => null);
            if (res.ok && signed?.url) {
              avatar = signed.url as string;
            }
          } catch {
            // ignore avatar failures
          }
        }
        setCurrentUser({
          name: nameCandidate || undefined,
          email: data.user.email ?? undefined,
          id: data.user.id ?? undefined,
          avatar_url: avatar,
        });
      } catch {
        // ignore - keep UI resilient if auth is unavailable
      }
    };
    loadUser();
    return () => {
      ignore = true;
    };
  }, [supabase]);

  const loadMailerLiteGroups = useCallback(async () => {
    setLoadingGroups(true);
    setMailerliteError(null);
    try {
      const res = await fetch(`/api/mailerlite/groups?limit=1000&page=1&sort=name`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load MailerLite groups");
      }
      setMailerliteGroups(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setMailerliteError(err instanceof Error ? err.message : "Failed to load groups");
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    loadMailerLiteGroups();
  }, [loadMailerLiteGroups]);

  const syncCandidateRelated = useCallback(
    async (
      candidate: Candidate,
      previous: Candidate | null,
      changedKeys?: Set<keyof Candidate>
    ) => {
      const shouldSync = (key: keyof Candidate) =>
        !changedKeys || changedKeys.has(key);
      const promises: PromiseLike<unknown>[] = [];
      const candidateId = candidate.id;

      if (shouldSync("tasks")) {
        const nextRows = buildTaskRows(candidate);
        const prevTasks = Array.isArray(previous?.tasks)
          ? previous?.tasks.filter(
              (task) => task && task.id && !PROFILE_TASK_IDS.has(task.id)
            )
          : [];
        const prevIds = new Set(prevTasks.map((task) => task.id));
        const nextIds = new Set(nextRows.map((row) => row.id));
        if (nextRows.length > 0) {
          promises.push(
            supabase
              .from("candidate_tasks")
              .upsert(nextRows, { onConflict: "candidate_id,id" })
          );
        }
        if (prevIds.size > 0) {
          const removed = [...prevIds].filter((id) => !nextIds.has(id));
          if (removed.length === prevIds.size && nextRows.length === 0) {
            promises.push(
              supabase.from("candidate_tasks").delete().eq("candidate_id", candidateId)
            );
          } else if (removed.length > 0) {
            promises.push(
              supabase
                .from("candidate_tasks")
                .delete()
                .eq("candidate_id", candidateId)
                .in("id", removed)
            );
          }
        }
      }

      if (shouldSync("work_history")) {
        const nextRows = buildWorkHistoryRows(candidate);
        const prevItems = Array.isArray(previous?.work_history)
          ? previous?.work_history.filter((item) => item && item.id)
          : [];
        const prevIds = new Set(prevItems.map((item) => item.id));
        const nextIds = new Set(nextRows.map((row) => row.id));
        if (nextRows.length > 0) {
          promises.push(
            supabase
              .from("candidate_work_history")
              .upsert(nextRows, { onConflict: "id" })
          );
        }
        if (prevIds.size > 0) {
          const removed = [...prevIds].filter((id) => !nextIds.has(id));
          if (removed.length === prevIds.size && nextRows.length === 0) {
            promises.push(
              supabase
                .from("candidate_work_history")
                .delete()
                .eq("candidate_id", candidateId)
            );
          } else if (removed.length > 0) {
            promises.push(
              supabase
                .from("candidate_work_history")
                .delete()
                .eq("candidate_id", candidateId)
                .in("id", removed)
            );
          }
        }
      }

      if (shouldSync("education")) {
        const nextRows = buildEducationRows(candidate);
        const prevItems = Array.isArray(previous?.education)
          ? previous?.education.filter((item) => item && item.id)
          : [];
        const prevIds = new Set(prevItems.map((item) => item.id));
        const nextIds = new Set(nextRows.map((row) => row.id));
        if (nextRows.length > 0) {
          promises.push(
            supabase
              .from("candidate_education")
              .upsert(nextRows, { onConflict: "id" })
          );
        }
        if (prevIds.size > 0) {
          const removed = [...prevIds].filter((id) => !nextIds.has(id));
          if (removed.length === prevIds.size && nextRows.length === 0) {
            promises.push(
              supabase
                .from("candidate_education")
                .delete()
                .eq("candidate_id", candidateId)
            );
          } else if (removed.length > 0) {
            promises.push(
              supabase
                .from("candidate_education")
                .delete()
                .eq("candidate_id", candidateId)
                .in("id", removed)
            );
          }
        }
      }

      if (shouldSync("attachments")) {
        const nextRows = buildAttachmentRows(candidate);
        const prevItems = Array.isArray(previous?.attachments)
          ? previous?.attachments.filter((item) => item && item.id)
          : [];
        const prevIds = new Set(prevItems.map((item) => item.id));
        const nextIds = new Set(nextRows.map((row) => row.id));
        if (nextRows.length > 0) {
          promises.push(
            supabase
              .from("candidate_attachments")
              .upsert(nextRows, { onConflict: "id" })
          );
        }
        if (prevIds.size > 0) {
          const removed = [...prevIds].filter((id) => !nextIds.has(id));
          if (removed.length === prevIds.size && nextRows.length === 0) {
            promises.push(
              supabase
                .from("candidate_attachments")
                .delete()
                .eq("candidate_id", candidateId)
            );
          } else if (removed.length > 0) {
            promises.push(
              supabase
                .from("candidate_attachments")
                .delete()
                .eq("candidate_id", candidateId)
                .in("id", removed)
            );
          }
        }
      }

      if (shouldSync("scorecard")) {
        const row = buildScorecardRow(candidate);
        if (row) {
          promises.push(
            supabase
              .from("candidate_scorecards")
              .upsert(row, { onConflict: "candidate_id" })
          );
        } else if (previous?.scorecard) {
          promises.push(
            supabase
              .from("candidate_scorecards")
              .delete()
              .eq("candidate_id", candidateId)
          );
        }
      }

      if (shouldSync("questionnaires_sent")) {
        const normalized = normalizeQuestionnaireEntries(
          candidate.questionnaires_sent
        );
        const withNormalized = { ...candidate, questionnaires_sent: normalized };
        const nextRows = buildQuestionnaireRows(withNormalized);
        const prevItems = Array.isArray(previous?.questionnaires_sent)
          ? previous?.questionnaires_sent.filter((item) => item && item.id)
          : [];
        const prevIds = new Set(prevItems.map((item) => item.id));
        const nextIds = new Set(nextRows.map((row) => row.id));
        if (nextRows.length > 0) {
          promises.push(
            supabase
              .from("candidate_questionnaires")
              .upsert(nextRows, { onConflict: "id" })
          );
        }
        if (prevIds.size > 0) {
          const removed = [...prevIds].filter((id) => !nextIds.has(id));
          if (removed.length === prevIds.size && nextRows.length === 0) {
            promises.push(
              supabase
                .from("candidate_questionnaires")
                .delete()
                .eq("candidate_id", candidateId)
            );
          } else if (removed.length > 0) {
            promises.push(
              supabase
                .from("candidate_questionnaires")
                .delete()
                .eq("candidate_id", candidateId)
                .in("id", removed)
            );
          }
        }
      }

      if (promises.length > 0) {
        try {
          await Promise.all(promises);
        } catch {
          // keep UI responsive if related sync fails
        }
      }
    },
    [supabase]
  );

  const syncSubmittedForms = useCallback(async () => {
    if (!hydrated || !formsSyncEnabled) return;
    try {
      const res = await fetch("/api/forms/pending", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setFormsSyncEnabled(false);
        }
        return;
      }
      const data = await res.json();
      const forms: IntakeFormSubmission[] = Array.isArray(data?.forms)
        ? data.forms
        : [];
      if (forms.length === 0) return;

      const tokensToConsume: string[] = [];
      const updatedCandidates: Candidate[] = [];
      setCandidates((prev) => {
        let next = prev;
        forms.forEach((form) => {
          if (!form?.candidate_id || !form?.token) return;
          const index = next.findIndex(
            (candidate) => candidate.id === form.candidate_id
          );
          if (index === -1) return;
          const updated = applyFormSubmission(next[index], form);
          if (updated !== next[index]) {
            if (next === prev) {
              next = [...prev];
            }
            next[index] = updated;
            updatedCandidates.push(updated);
          }
          tokensToConsume.push(form.token);
        });
        return next;
      });
      if (updatedCandidates.length > 0) {
        void supabase
          .from("candidates")
          .upsert(updatedCandidates.map(buildCandidateRow), { onConflict: "id" });
        updatedCandidates.forEach((candidate) => {
          void syncCandidateRelated(candidate, null);
        });
      }

      const uniqueTokens = Array.from(new Set(tokensToConsume));
      if (uniqueTokens.length > 0) {
        const consumeRes = await fetch("/api/forms/consume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens: uniqueTokens }),
        });
        if (consumeRes.status === 401 || consumeRes.status === 403) {
          setFormsSyncEnabled(false);
        }
      }
    } catch {
      setFormsSyncEnabled(false);
    }
  }, [formsSyncEnabled, hydrated, supabase, syncCandidateRelated]);

  useEffect(() => {
    if (!hydrated || !formsSyncEnabled) return;
    syncSubmittedForms();
    const interval = window.setInterval(syncSubmittedForms, 60000);
    return () => window.clearInterval(interval);
  }, [formsSyncEnabled, hydrated, syncSubmittedForms]);

  useEffect(() => {
    if (pipelines.length === 0) return;
    if (pipelines.some((pipeline) => pipeline.id === selectedPipelineId)) return;
    setSelectedPipelineId(pipelines[0].id);
  }, [pipelines, selectedPipelineId]);

  const smartSearchFilters = useMemo(
    () => (ENABLE_SMART_SEARCH ? buildSmartSearchFilters(smartSearchQuery) : null),
    [smartSearchQuery]
  );

  const filteredCandidates = useMemo(() => {
    if (!selectedPipelineId) return [];
    const base = candidates.filter((candidate) => {
      if (candidate.pipeline_id !== selectedPipelineId) {
        return false;
      }
      return true;
    });

    return base;
  }, [
    candidates,
    selectedPipelineId,
  ]);

  const smartSearchResults = useMemo(() => {
    if (!ENABLE_SMART_SEARCH) return [];
    if (!smartSearchQuery.trim()) return [];
    const filters = smartSearchFilters;
    if (!filters || filters.tokens.length === 0) return [];
    return filteredCandidates
      .filter((candidate) => {
        const haystack = buildCandidateHaystack(candidate);
        return filters.tokens.every((term) => haystack.includes(term));
      })
      .slice(0, 8);
  }, [filteredCandidates, smartSearchFilters, smartSearchQuery]);

  const pipelineCandidateCount = useMemo(() => {
    if (!selectedPipelineId) return 0;
    return candidates.filter(
      (candidate) => candidate.pipeline_id === selectedPipelineId
    ).length;
  }, [candidates, selectedPipelineId]);

  const pipelineStatsById = useMemo(() => {
    const stats: Record<
      string,
      { total: number; withNotes: number; withDocs: number; with2PlusDocs: number }
    > = {};

    for (const candidate of candidates) {
      const pipelineId = candidate.pipeline_id;
      if (!pipelineId) continue;
      const entry =
        stats[pipelineId] ??
        (stats[pipelineId] = { total: 0, withNotes: 0, withDocs: 0, with2PlusDocs: 0 });
      entry.total += 1;
      const notes = noteCounts[candidate.id] ?? 0;
      if (notes > 0) entry.withNotes += 1;
      const docs = attachmentCounts[candidate.id] ?? 0;
      if (docs > 0) entry.withDocs += 1;
      if (docs > 1) entry.with2PlusDocs += 1;
    }

    return stats;
  }, [attachmentCounts, candidates, noteCounts]);

  const activePipeline = useMemo(() => {
    return (
      pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ??
      pipelines[0] ??
      null
    );
  }, [pipelines, selectedPipelineId]);

  const filteredPipelines = useMemo(() => {
    const query = pipelineSearch.trim().toLowerCase();
    if (!query) return pipelines;
    return pipelines.filter((pipeline) =>
      pipeline.name.toLowerCase().includes(query)
    );
  }, [pipelines, pipelineSearch]);

  const activeStages = useMemo(() => {
    const base = activePipeline?.stages ?? stages;
    return [...base].sort((a, b) => a.order - b.order);
  }, [activePipeline]);

  const drawerCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === drawerCandidateId) ?? null,
    [candidates, drawerCandidateId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mapping: Record<string, string> = {};
    candidates.forEach((candidate) => {
      mapping[getCandidateShareSlug(candidate)] = getAvatarClass(candidate.name);
    });

    (
      window as Window &
        typeof globalThis & {
          __pipelineCandidateAvatarClassByShareSlug?: Record<string, string>;
        }
    ).__pipelineCandidateAvatarClassByShareSlug = mapping;
  }, [candidates]);

  const replaceProfileUrl = useCallback(
    (profileSlug: string | null, requestedTab: DrawerRequestedRightTab) => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const currentProfile = url.searchParams.get("profile");
    const currentTab = url.searchParams.get("tab");
    if ((currentProfile ?? null) === profileSlug && (currentTab ?? null) === requestedTab) {
      shareSyncRef.current = profileSlug;
      return;
    }

    if (profileSlug) {
      url.searchParams.set("profile", profileSlug);
    } else {
      url.searchParams.delete("profile");
    }

    if (!profileSlug) {
      url.searchParams.delete("tab");
    } else if (requestedTab) {
      url.searchParams.set("tab", requestedTab);
    } else {
      url.searchParams.delete("tab");
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
    shareSyncRef.current = profileSlug;
  }, []);

  const resolveCandidateFromShareSlug = useCallback(
    (shareSlug: string) => {
      const parsedShareParam = parseCandidateShareParam(shareSlug);
      if (!parsedShareParam) return null;

      const exactMatch =
        candidates.find(
          (candidate) =>
            getCandidateShareSlug(candidate).toLowerCase() ===
            shareSlug.toLowerCase()
        ) ?? null;

      if (exactMatch) return exactMatch;

      return (
        candidates.find((candidate) => {
          if (getCandidateShareKey(candidate.id) !== parsedShareParam.key) {
            return false;
          }

          if (!parsedShareParam.lastNameSlug) {
            return true;
          }

          return (
            getCandidateLastNameSlug(candidate.name) ===
            parsedShareParam.lastNameSlug
          );
        }) ?? null
      );
    },
    [candidates]
  );

  const openDrawerFromShareSlug = useCallback(
    (shareSlug: string, requestedTab: DrawerRequestedRightTab) => {
      const match = resolveCandidateFromShareSlug(shareSlug);
      if (!match) return false;

      const canonicalSlug = getCandidateShareSlug(match);
      pendingShareSlugRef.current = null;
      pendingShareTabRef.current = null;
      shareSyncRef.current = canonicalSlug;
      setDrawerRequestedRightTab(requestedTab);
      setDrawerCandidateId(match.id);
      replaceProfileUrl(canonicalSlug, requestedTab);
      return true;
    },
    [replaceProfileUrl, resolveCandidateFromShareSlug]
  );

  const closeDrawer = useCallback(() => {
    setDrawerCandidateId(null);
    setDrawerRequestedRightTab(null);
    replaceProfileUrl(null, null);
  }, [replaceProfileUrl]);

  useEffect(() => {
    if (!hydrated) return;

    const expectedParam = drawerCandidate ? getCandidateShareSlug(drawerCandidate) : null;
    if (shareSyncRef.current === expectedParam) return;
    replaceProfileUrl(expectedParam, expectedParam ? drawerRequestedRightTab : null);
  }, [drawerCandidate, drawerRequestedRightTab, hydrated, replaceProfileUrl]);

  useEffect(() => {
    if (hydratedShareRef.current) return;
    if (!hydrated || candidates.length === 0) return;

    const shareProfileParam = initialShareProfileParamRef.current;
    if (!shareProfileParam) {
      hydratedShareRef.current = true;
      return;
    }

    if (!parseCandidateShareParam(shareProfileParam)) {
      hydratedShareRef.current = true;
      return;
    }

    const shareTabParam = parseDrawerRequestedRightTab(initialShareTabParamRef.current);
    const opened = openDrawerFromShareSlug(shareProfileParam, shareTabParam);
    if (opened) {
      hydratedShareRef.current = true;
      return;
    }

    hydratedShareRef.current = true;
    if (drawerCandidateId) {
      setDrawerCandidateId(null);
      return;
    }

    replaceProfileUrl(null, null);
  }, [candidates.length, drawerCandidateId, hydrated, openDrawerFromShareSlug, replaceProfileUrl]);

  useEffect(() => {
    if (!hydrated || candidates.length === 0) return;

    const pendingShareSlug = pendingShareSlugRef.current;
    if (!pendingShareSlug) return;

    const pendingTab = pendingShareTabRef.current ?? null;
    pendingShareTabRef.current = null;
    void openDrawerFromShareSlug(pendingShareSlug, pendingTab);
  }, [candidates.length, hydrated, openDrawerFromShareSlug]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOpenProfile = (event: Event) => {
      const detail = (event as CustomEvent<{ shareSlug?: string; rightTab?: string }>).detail;
      const shareSlug = detail?.shareSlug?.trim();
      if (!shareSlug) return;
      const requestedTab = parseDrawerRequestedRightTab(detail?.rightTab ?? null);

      if (!hydrated || candidates.length === 0) {
        pendingShareSlugRef.current = shareSlug;
        pendingShareTabRef.current = requestedTab;
        replaceProfileUrl(shareSlug, requestedTab);
        return;
      }

      openDrawerFromShareSlug(shareSlug, requestedTab);
    };

    window.addEventListener(OPEN_PROFILE_EVENT, handleOpenProfile as EventListener);
    return () => {
      window.removeEventListener(
        OPEN_PROFILE_EVENT,
        handleOpenProfile as EventListener
      );
    };
  }, [candidates.length, hydrated, openDrawerFromShareSlug, replaceProfileUrl]);

  const drawerStages = useMemo(() => {
    if (!drawerCandidate) return activeStages;
    const pipeline = pipelines.find(
      (item) => item.id === drawerCandidate.pipeline_id
    );
    const base = pipeline?.stages ?? activeStages;
    return [...base].sort((a, b) => a.order - b.order);
  }, [drawerCandidate, pipelines, activeStages]);

  const drawerSharePath = useMemo(() => {
    if (!drawerCandidate) return null;
    const params =
      typeof window === "undefined"
        ? new URLSearchParams(searchParams.toString())
        : new URLSearchParams(window.location.search);
    params.set("profile", getCandidateShareSlug(drawerCandidate));
    const nextQuery = params.toString();
    return nextQuery ? `${pathname}?${nextQuery}` : pathname;
  }, [drawerCandidate, pathname, searchParams]);

  const addActivity = useCallback(
    async (candidateId: string, body: string, type: ActivityEvent["type"]) => {
      const authorLabel =
        currentUser?.name?.trim() ||
        currentUser?.email?.trim() ||
        "Team Member";
      const entry: ActivityEvent = {
        id: crypto.randomUUID(),
        candidate_id: candidateId,
        body,
        type,
        created_at: new Date().toISOString(),
        author_name: authorLabel,
        author_email: currentUser?.email ?? undefined,
        author_id: currentUser?.id ?? undefined,
      };

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("candidate-activity", { detail: entry })
        );
      }

      try {
        const res = await fetch("/api/candidates/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: entry.id,
            candidateId: entry.candidate_id,
            body: entry.body,
            type: entry.type,
            createdAt: entry.created_at,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error(
            "Failed to save activity",
            data?.error ?? res.statusText
          );
        }
      } catch (error) {
        console.error("Failed to save activity", error);
      }
    },
    [currentUser]
  );


  const saveCandidate = useCallback(
    async (candidate: Candidate) => {
      await supabase
        .from("candidates")
        .upsert(buildCandidateRow(candidate), { onConflict: "id" });
    },
    [supabase]
  );

  const saveCandidates = useCallback(
    async (items: Candidate[]) => {
      if (items.length === 0) return;
      await supabase
        .from("candidates")
        .upsert(items.map(buildCandidateRow), { onConflict: "id" });
    },
    [supabase]
  );

  const sortedGroups = useMemo(() => {
    return [...mailerliteGroups].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "")
    );
  }, [mailerliteGroups]);

  const handleDragEnd = (activeId: string, overId: string | null) => {
    const pipelineId = activePipeline?.id;
    if (!pipelineId) return;
    if (!overId) return;
    if (activeId === overId) return;

    const activeCandidate = candidates.find(
      (candidate) =>
        candidate.id === activeId && candidate.pipeline_id === pipelineId
    );
    if (!activeCandidate) return;

    const overColumn = overId.startsWith("column:")
      ? overId.replace("column:", "")
      : null;
    const overCandidate = candidates.find((candidate) => candidate.id === overId);
    const targetStageId = overColumn ?? overCandidate?.stage_id;

    if (!targetStageId) return;

    if (activeCandidate.stage_id === targetStageId) {
      const stageCandidates = formatColumnCandidates(
        candidates,
        targetStageId,
        pipelineId
      );
      const oldIndex = stageCandidates.findIndex((item) => item.id === activeId);
      const newIndex = overCandidate
        ? stageCandidates.findIndex((item) => item.id === overCandidate.id)
        : stageCandidates.length - 1;

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(stageCandidates, oldIndex, newIndex).map(
        (candidate, index) => ({
          ...candidate,
          order: index,
          updated_at: new Date().toISOString(),
        })
      );

      setCandidates((prev) => [
        ...prev.filter(
          (candidate) =>
            !(candidate.pipeline_id === pipelineId && candidate.stage_id === targetStageId)
        ),
        ...reordered,
      ]);
      void saveCandidates(reordered);
      return;
    }

    const sourceStageId = activeCandidate.stage_id;
    const sourceCandidates = formatColumnCandidates(
      candidates,
      sourceStageId,
      pipelineId
    ).filter((candidate) => candidate.id !== activeId);
    const targetCandidates = formatColumnCandidates(
      candidates,
      targetStageId,
      pipelineId
    ).filter((candidate) => candidate.id !== activeId);

    const insertIndex = overCandidate
      ? targetCandidates.findIndex((candidate) => candidate.id === overCandidate.id)
      : targetCandidates.length;

    const movedCandidate = {
      ...activeCandidate,
      stage_id: targetStageId,
      updated_at: new Date().toISOString(),
    };

    const nextTarget = [...targetCandidates];
    nextTarget.splice(insertIndex, 0, movedCandidate);

    const updatedSource = buildOrder(sourceCandidates).map((candidate) => ({
      ...candidate,
      updated_at: new Date().toISOString(),
    }));
    const updatedTarget = buildOrder(nextTarget).map((candidate) => ({
      ...candidate,
      updated_at: new Date().toISOString(),
    }));

    setCandidates((prev) => [
      ...prev.filter((candidate) => {
        if (candidate.pipeline_id !== pipelineId) return true;
        if (candidate.id === activeId) return false;
        return (
          candidate.stage_id !== sourceStageId &&
          candidate.stage_id !== targetStageId
        );
      }),
      ...updatedSource,
      ...updatedTarget,
    ]);
    void saveCandidates([...updatedSource, ...updatedTarget]);

    const sourceStage = activeStages.find((stage) => stage.id === sourceStageId);
    const targetStage = activeStages.find((stage) => stage.id === targetStageId);
    addActivity(
      activeCandidate.id,
      `Moved from ${sourceStage?.name ?? "Unknown"} to ${targetStage?.name ?? "Unknown"}.`,
      "move"
    );
  };

  const handleAddCandidate = (payload: AddCandidatePayload) => {
    if (!activePipeline) return;
    const firstStage = activeStages[0] ?? stages[0];
    const stageCandidates = formatColumnCandidates(
      candidates,
      firstStage.id,
      activePipeline.id
    );
    const minOrder = stageCandidates.length > 0 ? stageCandidates[0].order : 0;

    const newCandidate: Candidate = {
      id: crypto.randomUUID(),
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      avatar_url: null,
      pipeline_id: activePipeline.id,
      pool_id: payload.pool_id,
      stage_id: firstStage.id,
      country: payload.country,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      order: minOrder - 1,
      source: "Manual",
      experience_summary: "",
      work_history: [],
      education: [],
    };

    setCandidates((prev) => [newCandidate, ...prev]);
    void saveCandidate(newCandidate);
  };

  const handleDeleteCandidate = async (candidate: Candidate) => {
    const confirmed = window.confirm(
      `Delete ${candidate.name}? This removes the profile from the pipeline and database.`
    );
    if (!confirmed) return;

    setCandidates((prev) => prev.filter((item) => item.id !== candidate.id));
    if (drawerCandidateId === candidate.id) {
      closeDrawer();
    }

    try {
      await Promise.all([
        supabase
          .from("candidate_notes")
          .delete()
          .eq("candidate_id", candidate.id),
        supabase
          .from("candidate_activity")
          .delete()
          .eq("candidate_id", candidate.id),
        supabase
          .from("candidate_tasks")
          .delete()
          .eq("candidate_id", candidate.id),
        supabase
          .from("candidate_work_history")
          .delete()
          .eq("candidate_id", candidate.id),
        supabase
          .from("candidate_education")
          .delete()
          .eq("candidate_id", candidate.id),
        supabase
          .from("candidate_attachments")
          .delete()
          .eq("candidate_id", candidate.id),
        supabase
          .from("candidate_scorecards")
          .delete()
          .eq("candidate_id", candidate.id),
        supabase
          .from("candidate_questionnaires")
          .delete()
          .eq("candidate_id", candidate.id),
        supabase.from("candidates").delete().eq("id", candidate.id),
      ]);
    } catch (error) {
      setRemoteError("Failed to delete candidate. Please try again.");
    }
  };


  const handleStageChange = (stageId: string) => {
    if (!drawerCandidateId) return;
    const pipelineId = drawerCandidate?.pipeline_id;
    if (!pipelineId) return;
    let updatedCandidate: Candidate | null = null;
    setCandidates((prev) => {
      const targetCandidates = formatColumnCandidates(prev, stageId, pipelineId);
      const minOrder = targetCandidates.length > 0 ? targetCandidates[0].order : 0;
      return prev.map((candidate) => {
        if (candidate.id !== drawerCandidateId) return candidate;
        updatedCandidate = {
          ...candidate,
          stage_id: stageId,
          order: minOrder - 1,
          updated_at: new Date().toISOString(),
        };
        return updatedCandidate;
      });
    });
    if (updatedCandidate) {
      void saveCandidate(updatedCandidate);
    }

    const pipelineStages =
      pipelines.find((pipeline) => pipeline.id === pipelineId)?.stages ??
      activeStages;
    const fromStage = pipelineStages.find(
      (stage) => stage.id === drawerCandidate?.stage_id
    );
    const toStage = pipelineStages.find((stage) => stage.id === stageId);
    if (drawerCandidate?.stage_id !== stageId && drawerCandidate) {
      addActivity(
        drawerCandidate.id,
        `Moved from ${fromStage?.name ?? "Unknown"} to ${toStage?.name ?? "Unknown"}.`,
        "move"
      );
    }
  };

  const handlePipelineChange = (pipelineId: string) => {
    if (!drawerCandidate) return;
    const targetPipeline = pipelines.find(
      (pipeline) => pipeline.id === pipelineId
    );
    if (!targetPipeline) return;
    const currentStageId = drawerCandidate.stage_id;
    const stageExists = targetPipeline.stages.some(
      (stage) => stage.id === currentStageId
    );
    const nextStageId =
      stageExists ? currentStageId : targetPipeline.stages[0]?.id ?? currentStageId;
    const targetStageCandidates = formatColumnCandidates(
      candidates,
      nextStageId,
      pipelineId
    );
    const minOrder =
      targetStageCandidates.length > 0 ? targetStageCandidates[0].order : 0;
    let updatedCandidate: Candidate | null = null;
    setCandidates((prev) =>
      prev.map((candidate) => {
        if (candidate.id !== drawerCandidate.id) return candidate;
        updatedCandidate = {
          ...candidate,
          pipeline_id: pipelineId,
          stage_id: nextStageId,
          order: minOrder - 1,
          updated_at: new Date().toISOString(),
        };
        return updatedCandidate;
      })
    );
    if (updatedCandidate) {
      void saveCandidate(updatedCandidate);
    }
    if (drawerCandidate.pipeline_id !== pipelineId) {
      addActivity(
        drawerCandidate.id,
        `Moved to pipeline ${targetPipeline.name}.`,
        "move"
      );
    }
  };

  const handleUpdateCandidate = useCallback(
    (candidateId: string, updates: Partial<Candidate>) => {
      const normalizedUpdates: Partial<Candidate> = { ...updates };
      if (updates.questionnaires_sent) {
        normalizedUpdates.questionnaires_sent = normalizeQuestionnaireEntries(
          updates.questionnaires_sent
        );
      }
      let updatedCandidate: Candidate | null = null;
      let previousCandidate: Candidate | null = null;
      setCandidates((prev) =>
        prev.map((candidate) => {
          if (candidate.id !== candidateId) return candidate;
          previousCandidate = candidate;
          updatedCandidate = {
            ...candidate,
            ...normalizedUpdates,
            updated_at: new Date().toISOString(),
          };
          return updatedCandidate;
        })
      );
      if (updatedCandidate) {
        void saveCandidate(updatedCandidate);
        void syncCandidateRelated(
          updatedCandidate,
          previousCandidate,
          new Set(Object.keys(normalizedUpdates) as Array<keyof Candidate>)
        );
      }
    },
    [saveCandidate, syncCandidateRelated]
  );

  const autoCancelInFlight = useRef<Set<string>>(new Set());

  const autoCancelPastMeetings = useCallback(async () => {
    const now = Date.now();
    const targets = candidates.filter((candidate) => {
      if (!candidate.meeting_start && !candidate.meeting_end) return false;
      if (!candidate.meeting_link && !candidate.meeting_event_id) return false;
      if (
        candidate.meeting_conference_record ||
        candidate.meeting_recording_url ||
        candidate.meeting_transcript_url ||
        candidate.meeting_transcript_doc
      ) {
        return false;
      }
      const endOrStart = candidate.meeting_end ?? candidate.meeting_start ?? "";
      const due = new Date(endOrStart).getTime();
      if (!Number.isFinite(due)) return false;
      return now >= due;
    });

    for (const candidate of targets) {
      if (autoCancelInFlight.current.has(candidate.id)) continue;
      autoCancelInFlight.current.add(candidate.id);
      try {
        let hasConference = false;
        if (candidate.meeting_link) {
          const res = await fetch("/api/google/meet/artifacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              meetingLink: candidate.meeting_link,
              generateSummary: false,
            }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            hasConference = !!data?.conferenceRecord;
            handleUpdateCandidate(candidate.id, {
              meeting_conference_record: data?.conferenceRecord ?? undefined,
              meeting_recording_url: data?.recording?.exportUri ?? undefined,
              meeting_recording_file: data?.recording?.file ?? undefined,
              meeting_recording_state: data?.recording?.state ?? undefined,
              meeting_transcript_url: data?.transcript?.exportUri ?? undefined,
              meeting_transcript_doc: data?.transcript?.document ?? undefined,
              meeting_transcript_state: data?.transcript?.state ?? undefined,
              meeting_transcript_excerpt: data?.transcriptText ?? undefined,
              meeting_transcript_summary: data?.summary ?? undefined,
              meeting_artifacts_checked_at: new Date().toISOString(),
            });
          } else {
            handleUpdateCandidate(candidate.id, {
              meeting_artifacts_checked_at: new Date().toISOString(),
            });
          }
        }

        if (hasConference) {
          continue;
        }

        if (candidate.meeting_event_id) {
          await fetch("/api/google/meet/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: candidate.meeting_event_id }),
          });
        }

        handleUpdateCandidate(candidate.id, {
          meeting_link: undefined,
          meeting_provider: undefined,
          meeting_event_id: undefined,
          meeting_start: undefined,
          meeting_end: undefined,
          meeting_timezone: undefined,
          meeting_title: undefined,
          meeting_interviewers: undefined,
          meeting_conference_record: undefined,
          meeting_recording_url: undefined,
          meeting_recording_file: undefined,
          meeting_recording_state: undefined,
          meeting_transcript_url: undefined,
          meeting_transcript_doc: undefined,
          meeting_transcript_state: undefined,
          meeting_transcript_excerpt: undefined,
          meeting_transcript_summary: undefined,
          meeting_artifacts_checked_at: undefined,
          meeting_rsvp_status: undefined,
          meeting_rsvp_email: undefined,
          meeting_rsvp_updated_at: undefined,
          meeting_created_at: undefined,
          meeting_is_instant: undefined,
        });

        const cancelLabel = candidate.meeting_start
          ? `Auto-canceled interview (past due) • ${new Date(
              candidate.meeting_start
            ).toLocaleString()}.`
          : "Auto-canceled interview (past due).";
        addActivity(candidate.id, cancelLabel, "system");
      } catch {
        // ignore auto-cancel failures to keep UI responsive
      } finally {
        autoCancelInFlight.current.delete(candidate.id);
      }
    }
  }, [candidates, handleUpdateCandidate, addActivity]);

  useEffect(() => {
    if (!hydrated) return;
    void autoCancelPastMeetings();
    const interval = window.setInterval(() => {
      void autoCancelPastMeetings();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [hydrated, autoCancelPastMeetings]);

  const handleHydrateCandidate = useCallback(
    (candidateId: string, updates: Partial<Candidate>) => {
      if (!candidateId) return;
      const normalizedUpdates: Partial<Candidate> = { ...updates };
      if (updates.questionnaires_sent) {
        normalizedUpdates.questionnaires_sent = normalizeQuestionnaireEntries(
          updates.questionnaires_sent
        );
      }
      setCandidates((prev) =>
        prev.map((candidate) =>
          candidate.id === candidateId
            ? { ...candidate, ...normalizedUpdates }
            : candidate
        )
      );
    },
    []
  );

  const fetchMailerLiteDetails = useCallback(
    async (candidate: Candidate) => {
      if (candidate.mailerlite) return;
      const mlId = candidate.id.startsWith("ml-") ? candidate.id.slice(3) : null;
      if (!mlId) return;

      setMailerliteDetailsLoading((prev) => ({ ...prev, [candidate.id]: true }));
      setMailerliteDetailsError((prev) => ({ ...prev, [candidate.id]: null }));
      try {
        const res = await fetch(
          `/api/mailerlite/subscriber-details?subscriberId=${encodeURIComponent(
            mlId
          )}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to load subscriber details");
        }
        const details = data?.data ?? null;
        const detailsFields =
          details && typeof details === "object" && "fields" in details
            ? (details as { fields?: Record<string, unknown> }).fields
            : undefined;

        let updatedCandidate: Candidate | null = null;
        setCandidates((prev) =>
          prev.map((item) => {
            if (item.id !== candidate.id) return item;
            const nextCountry =
              item.country ??
              (details as { country?: string })?.country ??
              (detailsFields?.country as string | undefined) ??
              (detailsFields?.country_name as string | undefined);
            updatedCandidate = {
              ...item,
              mailerlite: details,
              country: nextCountry ?? item.country,
            };
            return updatedCandidate;
          })
        );
        if (updatedCandidate) {
          void saveCandidate(updatedCandidate);
        }
      } catch (err) {
        setMailerliteDetailsError((prev) => ({
          ...prev,
          [candidate.id]:
            err instanceof Error ? err.message : "Failed to load subscriber details",
        }));
      } finally {
        setMailerliteDetailsLoading((prev) => ({
          ...prev,
          [candidate.id]: false,
        }));
      }
    },
    [saveCandidate]
  );

  useEffect(() => {
    if (!drawerCandidate) return;
    const shouldLoad =
      drawerCandidate.id.startsWith("ml-") || drawerCandidate.source === "MailerLite";
    if (!shouldLoad) return;
    if (drawerCandidate.mailerlite) return;
    fetchMailerLiteDetails(drawerCandidate);
  }, [drawerCandidate, fetchMailerLiteDetails]);


  const buildCandidateName = (subscriber: MailerLiteSubscriber) => {
    const fields = subscriber.fields ?? {};
    const first =
      (fields.name as string | undefined) ??
      (fields.first_name as string | undefined);
    const last =
      (fields.last_name as string | undefined) ??
      (fields.surname as string | undefined);
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    if (last) return last;
    return subscriber.name ?? subscriber.email ?? "Unknown Candidate";
  };

  const handleImportGroup = async (groupId: string) => {
    if (!groupId) return;
    setImportingGroupId(groupId);
    setMailerliteError(null);
    try {
      const res = await fetch(
        `/api/mailerlite/group-subscribers?groupId=${encodeURIComponent(
          groupId
        )}&limit=25`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to import subscribers");
      }

      const list = Array.isArray(data?.data)
        ? (data.data as MailerLiteSubscriber[])
        : [];
      if (list.length === 0) return;

      const existingEmails = new Set(candidates.map((c) => c.email.toLowerCase()));
      const mailerPipeline =
        pipelines.find((pipeline) => pipeline.id === MAILERLITE_PIPELINE_ID) ??
        activePipeline ??
        pipelines[0] ??
        null;
      if (!mailerPipeline) return;
      const mailerStages = mailerPipeline.stages.length
        ? mailerPipeline.stages
        : stages;
      const firstStage =
        mailerStages.find((stage) => stage.id === MAILERLITE_STAGE_ID) ??
        mailerStages[0];
      if (!firstStage) return;
      const stageCandidates = formatColumnCandidates(
        candidates,
        firstStage.id,
        mailerPipeline.id
      );
      const minOrder = stageCandidates.length > 0 ? stageCandidates[0].order : 0;
      const poolId = pools[0]?.id ?? "roomy";

      const now = new Date().toISOString();
      const imported: Candidate[] = [];

      list.forEach((subscriber, index) => {
        const fields = subscriber.fields ?? {};
        const email = subscriber.email ?? `unknown-${subscriber.id}@mailerlite.local`;
        if (existingEmails.has(email.toLowerCase())) return;
        existingEmails.add(email.toLowerCase());
        const country =
          (subscriber as { country?: string }).country ??
          (fields?.country as string | undefined) ??
          (fields?.country_name as string | undefined);

        imported.push({
          id: `ml-${subscriber.id}`,
          name: buildCandidateName({
            ...subscriber,
            fields,
          }),
          email,
          phone: (fields?.phone as string | undefined) ?? undefined,
          avatar_url: null,
          pipeline_id: mailerPipeline.id,
          pool_id: poolId,
          stage_id: firstStage.id,
          country,
          status: "active",
          created_at:
            subscriber.subscribed_at ??
            subscriber.created_at ??
            now,
          updated_at: now,
          order: minOrder - (index + 1),
          source: "MailerLite",
          mailerlite: undefined,
        });
      });

      if (imported.length > 0) {
        setCandidates((prev) => [...imported, ...prev]);
        void saveCandidates(imported);
      }
    } catch (err) {
      setMailerliteError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportingGroupId("");
    }
  };

  const handleImportBreezy = async () => {
    if (breezyImporting) return;
    setBreezyImporting(true);
    setBreezyError(null);
    setBreezyImportedCount(null);

    try {
      const poolId = pools[0]?.id ?? "roomy";
      const breezyPipeline =
        pipelines.find((pipeline) => pipeline.id === BREEZY_PIPELINE_ID) ??
        activePipeline ??
        pipelines[0] ??
        null;
      if (!breezyPipeline) return;
      const pipelineStages = breezyPipeline.stages.length
        ? breezyPipeline.stages
        : stages;
      const stageIds = new Set(pipelineStages.map((stage) => stage.id));
      const defaultStageId = pipelineStages[0]?.id ?? MAILERLITE_STAGE_ID;
      const res = await fetch("/api/breezy/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId, pipelineId: breezyPipeline.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to import Breezy candidates");
      }

      const list = Array.isArray(data?.candidates)
        ? (data.candidates as Candidate[])
        : [];
      if (list.length === 0) {
        setBreezyImportedCount(0);
        return;
      }

      const existingEmails = new Set(candidates.map((c) => c.email.toLowerCase()));
      const stageMinOrders = new Map(
        pipelineStages.map((stage) => {
          const stageCandidates = formatColumnCandidates(
            candidates,
            stage.id,
            breezyPipeline.id
          );
          const minOrder = stageCandidates.length > 0 ? stageCandidates[0].order : 0;
          return [stage.id, minOrder] as const;
        })
      );
      const stageOffsets = new Map<string, number>();
      const imported: Candidate[] = [];

      list.forEach((candidate) => {
        const email = candidate.email?.toLowerCase();
        if (!email || existingEmails.has(email)) return;
        existingEmails.add(email);

        const stageId = stageIds.has(candidate.stage_id)
          ? candidate.stage_id
          : defaultStageId;
        const minOrder = stageMinOrders.get(stageId) ?? 0;
        const offset = stageOffsets.get(stageId) ?? 0;
        stageOffsets.set(stageId, offset + 1);

        imported.push({
          ...candidate,
          pipeline_id: breezyPipeline.id,
          pool_id: poolId,
          stage_id: stageId,
          order: minOrder - (offset + 1),
          updated_at: new Date().toISOString(),
          source: "Breezy",
        });
      });

      if (imported.length > 0) {
        setCandidates((prev) => [...imported, ...prev]);
        void saveCandidates(imported);
      }
      setBreezyImportedCount(imported.length);
    } catch (err) {
      setBreezyError(
        err instanceof Error ? err.message : "Breezy import failed"
      );
    } finally {
      setBreezyImporting(false);
    }
  };

  const handleCreatePipeline = async () => {
    const name = typeof window !== "undefined" ? window.prompt("Pipeline name") : "";
    const trimmed = name?.trim();
    if (!trimmed) return;
    const existing = new Set(pipelines.map((pipeline) => pipeline.id));
    const id = buildUniqueId(trimmed, existing);
    const nextPipeline: Pipeline = {
      id,
      name: trimmed,
      stages: cloneStages(stages),
    };
    setPipelines((prev) => [...prev, nextPipeline]);
    setSelectedPipelineId(id);
    await supabase.from("pipelines").insert({ id: nextPipeline.id, name: nextPipeline.name });
    const stageRows = nextPipeline.stages.map((stage) => ({
      pipeline_id: nextPipeline.id,
      id: stage.id,
      name: stage.name,
      order: stage.order,
    }));
    if (stageRows.length > 0) {
      await supabase.from("pipeline_stages").insert(stageRows);
    }
  };

  const handleDeletePipeline = async () => {
    if (!activePipeline) return;
    if (pipelines.length <= 1) return;
    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            `Delete pipeline "${activePipeline.name}" and all its candidates?`
          )
        : false;
    if (!ok) return;
    const removeIds = new Set(
      candidates
        .filter((candidate) => candidate.pipeline_id === activePipeline.id)
        .map((candidate) => candidate.id)
    );
    setCandidates((prev) =>
      prev.filter((candidate) => candidate.pipeline_id !== activePipeline.id)
    );
    setPipelines((prev) =>
      prev.filter((pipeline) => pipeline.id !== activePipeline.id)
    );
    const next =
      pipelines.find((pipeline) => pipeline.id !== activePipeline.id) ??
      pipelines[0] ??
      null;
    if (next) setSelectedPipelineId(next.id);
    await supabase.from("pipelines").delete().eq("id", activePipeline.id);
  };

  const handleAddStage = async () => {
    if (!activePipeline) return;
    const name = typeof window !== "undefined" ? window.prompt("Stage name") : "";
    const trimmed = name?.trim();
    if (!trimmed) return;
    const existing = new Set(activePipeline.stages.map((stage) => stage.id));
    const id = buildUniqueId(trimmed, existing);
    const nextStage: Stage = {
      id,
      name: trimmed.toUpperCase(),
      order: activePipeline.stages.length,
    };
    setPipelines((prev) =>
      prev.map((pipeline) => {
        if (pipeline.id !== activePipeline.id) return pipeline;
        return {
          ...pipeline,
          stages: [...pipeline.stages, nextStage],
        };
      })
    );
    await supabase.from("pipeline_stages").insert({
      pipeline_id: activePipeline.id,
      id: nextStage.id,
      name: nextStage.name,
      order: nextStage.order,
    });
  };

  if (!hydrated) {
    return (
      <div
        className="min-h-screen flex flex-col bg-[#f3f3f3]"
        aria-busy="true"
        aria-live="polite"
      >
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-none items-center justify-between gap-4 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse" />
              <div className="min-w-0">
                <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" />
                <div className="mt-2 h-3 w-56 rounded bg-slate-100 animate-pulse" />
              </div>
            </div>
            <div className="flex w-[min(520px,45vw)] items-center gap-3">
              <div className="h-10 flex-1 rounded-full bg-slate-100 animate-pulse" />
              <div className="h-10 w-36 rounded-full bg-emerald-200/70 animate-pulse" />
            </div>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-none flex-1 min-h-0 flex-col gap-4 px-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-10 w-52 rounded-md bg-white border border-slate-200 animate-pulse" />
              <div className="h-10 w-28 rounded-md bg-white border border-slate-200 animate-pulse" />
              <div className="h-10 w-28 rounded-md bg-white border border-slate-200 animate-pulse" />
              <div className="h-10 w-56 rounded-md bg-white border border-slate-200 animate-pulse" />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex h-full min-h-0 gap-4 overflow-hidden p-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={`col-skel-${idx}`}
                  className="flex min-w-[260px] flex-1 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-28 rounded bg-slate-200 animate-pulse" />
                    <div className="h-5 w-10 rounded-full bg-slate-200 animate-pulse" />
                  </div>
                  <div className="mt-3 space-y-3">
                    {Array.from({ length: 4 }).map((__, cardIdx) => (
                      <div
                        key={`card-skel-${idx}-${cardIdx}`}
                        className="rounded-2xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse" />
                          <div className="min-w-0 flex-1">
                            <div className="h-3 w-40 rounded bg-slate-200 animate-pulse" />
                            <div className="mt-2 h-3 w-56 rounded bg-slate-100 animate-pulse" />
                            <div className="mt-3 flex gap-2">
                              <div className="h-6 w-16 rounded-full bg-slate-100 animate-pulse" />
                              <div className="h-6 w-20 rounded-full bg-slate-100 animate-pulse" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  const drawerLoading = drawerCandidateId
    ? !!mailerliteDetailsLoading[drawerCandidateId]
    : false;
  const drawerError = drawerCandidateId
    ? mailerliteDetailsError[drawerCandidateId] ?? null
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#f3f3f3]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-none items-center gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              IS
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">AGN ISMIRA LTA</div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  {activePipeline?.name ?? "Pipeline board"}
                </span>
                <span className="text-slate-300">•</span>
                <span>Pipeline board</span>
                <button
                  type="button"
                  className="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-black"
                  onClick={() => setIsPipelineModalOpen(true)}
                >
                  Change
                </button>
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4 md:mr-16">
            {ENABLE_SMART_SEARCH ? (
              <div className="relative w-[520px] max-w-[60vw]">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                  <Search className="h-4 w-4 text-slate-500" />
                  <input
                    className="w-full bg-transparent text-sm text-slate-700 outline-none"
                    placeholder="Search by name, email, phone, or country"
                    value={smartSearchQuery}
                    onChange={(event) => setSmartSearchQuery(event.target.value)}
                    onFocus={() => setSmartSearchOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setSmartSearchOpen(false), 150);
                    }}
                  />
                  {smartSearchQuery ? (
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-slate-600"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setSmartSearchQuery("")}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {smartSearchOpen && smartSearchResults.length > 0 ? (
                  <div
                    className="absolute left-0 right-0 z-20 mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <div className="mb-2 text-[11px] font-semibold uppercase text-slate-400">
                      Results
                    </div>
                    <div className="grid gap-2">
                    {smartSearchResults.map((candidate) => {
                      const country = getCountryDisplay(candidate.country);
                      const noteCount = noteCounts[candidate.id] ?? 0;
                      const attachmentCount = attachmentCounts[candidate.id] ?? 0;
                      const relative = formatRelative(candidate.created_at);
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 hover:bg-white"
                          onClick={() => {
                            setDrawerRequestedRightTab(null);
                            setDrawerCandidateId(candidate.id);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${getAvatarClass(
                                candidate.name
                              )}`}
                            >
                              {getInitials(candidate.name)}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">
                                {candidate.name}
                              </div>
                              <div
                                className="text-xs text-slate-500"
                                title={candidate.email || undefined}
                              >
                                {formatEmailShort(candidate.email) || "—"}
                              </div>
                              <div className="text-xs text-slate-400">
                                {country.label !== "—"
                                  ? `${country.flag ? `${country.flag} ` : ""}${country.label}`
                                  : "—"}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 pl-4">
                            {candidate.meeting_start ? (
                              <span
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-100 text-emerald-700 shadow-sm"
                                title={`Meeting starts: ${new Date(
                                  candidate.meeting_start
                                ).toLocaleString()}`}
                              >
                                <CalendarDays className="h-4 w-4" />
                              </span>
                            ) : null}
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                {relative || "—"}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MessageCircle className="h-3.5 w-3.5 text-slate-400" />
                                {noteCount}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                                {attachmentCount}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                ) : smartSearchOpen && smartSearchQuery.trim() ? (
                  <div className="absolute left-0 right-0 z-20 mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-xl">
                    <div className="text-xs font-semibold uppercase text-slate-400">
                      No results
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Try name, email, phone number, or country.
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Candidates
            </button>
          </div>
        </div>
      </header>
      {remoteError ? (
        <div className="mx-auto w-full max-w-none px-4 py-3">
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {remoteError}
          </div>
        </div>
      ) : remoteLoading ? (
        <div className="mx-auto w-full max-w-none px-4 py-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Syncing pipeline data...
          </div>
        </div>
      ) : null}

      <section className="mx-auto flex w-full max-w-none flex-1 min-h-0 flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <Layers className="h-4 w-4 text-slate-500" />
              <select
                className="bg-transparent text-sm text-slate-700 focus:outline-none"
                value={selectedPipelineId}
                onChange={(event) => setSelectedPipelineId(event.target.value)}
              >
                {pipelines.map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                    {pipelineStatsById[pipeline.id]
                      ? ` (${pipelineStatsById[pipeline.id]!.total}) • docs≥2: ${
                          pipelineStatsById[pipeline.id]!.with2PlusDocs
                        } • notes: ${pipelineStatsById[pipeline.id]!.withNotes}`
                      : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={handleCreatePipeline}
            >
              New Pipeline
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={handleAddStage}
            >
              Add Stage
            </button>
            <button
              type="button"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600 shadow-sm hover:bg-rose-100"
              onClick={handleDeletePipeline}
              disabled={pipelines.length <= 1}
            >
              Delete Pipeline
            </button>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <Mail className="h-4 w-4 text-slate-500" />
              <select
                className="bg-transparent text-sm text-slate-700 focus:outline-none"
                value={selectedMailerLiteGroupId}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedMailerLiteGroupId(value);
                  if (value) handleImportGroup(value);
                }}
                disabled={loadingGroups}
              >
                <option value="">
                  {loadingGroups ? "Loading MailerLite…" : "Import MailerLite group"}
                </option>
                {sortedGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name ?? group.id}
                    {group.active_count ? ` (${group.active_count})` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
          </div>
        </div>
        {mailerliteError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {mailerliteError}
          </div>
        ) : null}
        {breezyError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {breezyError}
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar bg-[#f3f3f3] [background-image:radial-gradient(rgba(148,163,184,0.25)_1px,transparent_1px)] [background-size:22px_22px]">
          <Board
            stages={activeStages}
            candidates={filteredCandidates}
            noteCounts={noteCounts}
            attachmentCounts={attachmentCounts}
            onDragEnd={handleDragEnd}
            onOpenCandidate={(candidate) => {
              setDrawerRequestedRightTab(null);
              setDrawerCandidateId(candidate.id);
            }}
            onDeleteCandidate={handleDeleteCandidate}
          />
        </div>
      </section>

      <AddCandidateModal
        open={isAddModalOpen}
        pools={pools}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddCandidate}
      />

      <CandidateDrawer
        open={!!drawerCandidate}
        candidate={drawerCandidate}
        sharePath={drawerSharePath}
        stages={drawerStages}
        pipelines={pipelines}
        requestedRightTab={drawerRequestedRightTab}
        onClose={closeDrawer}
        onStageChange={handleStageChange}
        onPipelineChange={handlePipelineChange}
        mailerliteLoading={drawerLoading}
        mailerliteError={drawerError}
        onUpdateCandidate={handleUpdateCandidate}
        onHydrateCandidate={handleHydrateCandidate}
        currentUser={currentUser}
      />
      {isPipelineModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setIsPipelineModalOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">
                Change Pipeline
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Select the pipeline you want to view.
              </div>
            </div>
            <div className="px-5 py-4">
              <input
                value={pipelineSearch}
                onChange={(event) => setPipelineSearch(event.target.value)}
                placeholder="Search pipelines..."
                className="h-10 w-full rounded-full border border-slate-200 px-4 text-sm outline-none focus:border-emerald-300"
              />
              <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {filteredPipelines.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                    No pipelines found.
                  </div>
                ) : (
                  filteredPipelines.map((pipeline) => (
                    <button
                      key={pipeline.id}
                      type="button"
                      onClick={() => {
                        setSelectedPipelineId(pipeline.id);
                        setIsPipelineModalOpen(false);
                        setPipelineSearch("");
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                        pipeline.id === selectedPipelineId
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200"
                      }`}
                    >
                      <span className="font-medium">{pipeline.name}</span>
                      {pipeline.id === selectedPipelineId ? (
                        <span className="text-[11px] font-semibold uppercase text-emerald-600">
                          Current
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                onClick={() => setIsPipelineModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
