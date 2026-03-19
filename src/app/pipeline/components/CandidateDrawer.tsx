import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ActivityEvent,
  Candidate,
  TaskItem,
  Note,
  Pipeline,
  Stage,
  WorkHistoryItem,
  EducationItem,
  Scorecard,
} from "../types";
import { getAvatarClass } from "./CandidateCard";
import { getCountryDisplay } from "@/lib/country";
import { FORM_FIELD_DEFINITIONS, FORM_FIELD_KEYS } from "@/lib/form-fields";
import {
  buildQuestionnaireId,
  DEFAULT_QUESTIONNAIRES,
  type Questionnaire,
  type QuestionnaireStatus,
} from "@/lib/questionnaires";
import Markdown from "@/components/Markdown";
import Image from "next/image";
import { Mic, Paperclip, RefreshCw, Send, Smile, Zap } from "lucide-react";
import chatBackground from "@/images/whatsup_bg.jpg";
import iconJpg from "@/images/icons/jpg_black.png";
import iconPdf from "@/images/icons/pdf_black.png";
import iconPng from "@/images/icons/png_black.png";
import aiSearchIcon from "@/images/icons/ai_search.png";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type TeamUser = {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  avatar_path?: string | null;
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

type ActivityRow = {
  id: string;
  candidate_id: string;
  type: ActivityEvent["type"];
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

const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type MentionChunk = { type: "mention"; label: string };
type MentionLabel = { label: string; lower: string };

const isMentionBoundary = (char?: string) =>
  !char || /[\s.,!?;:)"'\]]/.test(char);

const splitMentions = (
  text: string,
  labels: MentionLabel[]
): Array<string | MentionChunk> => {
  if (!text.includes("@") || labels.length === 0) return [text];
  const chunks: Array<string | MentionChunk> = [];
  let index = 0;
  while (index < text.length) {
    const atIndex = text.indexOf("@", index);
    if (atIndex === -1) {
      chunks.push(text.slice(index));
      break;
    }
    const charBefore = atIndex === 0 ? " " : text[atIndex - 1];
    if (charBefore && !/\s/.test(charBefore)) {
      index = atIndex + 1;
      continue;
    }
    const rest = text.slice(atIndex + 1);
    const restLower = rest.toLowerCase();
    const match = labels.find((label) => restLower.startsWith(label.lower));
    if (!match) {
      chunks.push(text.slice(index, atIndex + 1));
      index = atIndex + 1;
      continue;
    }
    const afterChar = rest[match.label.length];
    if (!isMentionBoundary(afterChar)) {
      chunks.push(text.slice(index, atIndex + 1));
      index = atIndex + 1;
      continue;
    }
    if (atIndex > index) {
      chunks.push(text.slice(index, atIndex));
    }
    chunks.push({ type: "mention", label: match.label });
    index = atIndex + 1 + match.label.length;
  }
  return chunks.length > 0 ? chunks : [text];
};

const renderMentionedBody = (
  text: string,
  labels: MentionLabel[],
  onGreen?: boolean
) =>
  splitMentions(text, labels).map((chunk, idx) => {
    if (typeof chunk === "string") {
      return <span key={`txt-${idx}`}>{chunk}</span>;
    }
    return (
      <span
        key={`mention-${idx}`}
        className={`mx-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          onGreen
            ? "bg-white text-emerald-900"
            : "bg-emerald-100 text-emerald-800"
        }`}
      >
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-300 text-[9px] font-bold text-emerald-900">
          @
        </span>
        <span className="tracking-tight">{chunk.label}</span>
      </span>
    );
  });

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseEmails = (value?: string) => {
  if (!value) return [];
  return value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.includes("@"));
};

const mapNoteRow = (row: NoteRow): Note => ({
  id: row.id,
  candidate_id: row.candidate_id,
  body: row.body,
  created_at: row.created_at ?? new Date().toISOString(),
  author_name: row.author_name ?? undefined,
  author_email: row.author_email ?? undefined,
  author_id: row.author_id ?? undefined,
});

const mapActivityRow = (row: ActivityRow): ActivityEvent => ({
  id: row.id,
  candidate_id: row.candidate_id,
  type: row.type,
  body: row.body,
  created_at: row.created_at ?? new Date().toISOString(),
  author_name: row.author_name ?? undefined,
  author_email: row.author_email ?? undefined,
  author_id: row.author_id ?? undefined,
});

const mapTaskRow = (row: TaskRow): TaskItem => ({
  id: row.id,
  title: row.title,
  status: row.status === "done" ? "done" : "open",
  created_at: row.created_at ?? new Date().toISOString(),
});

const mapWorkHistoryRow = (row: WorkHistoryRow): WorkHistoryItem => ({
  id: row.id,
  role: row.role,
  company: row.company,
  start: row.start ?? undefined,
  end: row.end ?? undefined,
  details: row.details ?? undefined,
});

const mapEducationRow = (row: EducationRow): EducationItem => ({
  id: row.id,
  program: row.program,
  institution: row.institution,
  start: row.start ?? undefined,
  end: row.end ?? undefined,
  details: row.details ?? undefined,
});

const mapAttachmentRow = (row: AttachmentRow) => ({
  id: row.id,
  name: row.name ?? undefined,
  mime: row.mime ?? undefined,
  url: row.url ?? undefined,
  path: row.path ?? undefined,
  kind:
    row.kind === "resume" || row.kind === "document"
      ? (row.kind as "resume" | "document")
      : undefined,
  created_at: row.created_at ?? undefined,
  created_by: row.created_by ?? undefined,
});

const mapScorecardRow = (row: ScorecardRow): Scorecard => ({
  thoughts: row.thoughts ?? "",
  overall_rating:
    typeof row.overall_rating === "number" ? row.overall_rating : null,
  entries:
    row.entries && typeof row.entries === "object"
      ? (row.entries as Scorecard["entries"])
      : {},
});

const mapQuestionnaireRow = (row: QuestionnaireRow) => ({
  id: row.id,
  questionnaire_id: row.questionnaire_id ?? undefined,
  name: row.name ?? "Questionnaire",
  status: row.status === "Active" ? "Active" : "Draft",
  sent_at: row.sent_at ?? new Date().toISOString(),
  sent_by: row.sent_by ?? undefined,
});

const parseTimestampFromPath = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/-(\d{13})-/);
  if (!match) return null;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const resolveAttachmentTimestamp = (
  createdAt?: string | null,
  path?: string | null,
  url?: string | null
) => {
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return createdAt;
    }
  }
  const fromPath = parseTimestampFromPath(path);
  if (fromPath) return fromPath;
  const extracted = parseTimestampFromPath(extractStoragePath(url ?? undefined));
  return extracted;
};

const getExtension = (name?: string | null, mime?: string | null) => {
  const mimeLower = mime?.toLowerCase() ?? "";
  if (mimeLower.includes("pdf")) return "pdf";
  if (mimeLower.includes("png")) return "png";
  if (mimeLower.includes("jpeg") || mimeLower.includes("jpg")) return "jpg";
  if (name) {
    const parts = name.toLowerCase().split(".");
    if (parts.length > 1) {
      return parts[parts.length - 1];
    }
  }
  return "";
};

const getFileIcon = (extension: string) => {
  if (extension === "pdf") return iconPdf;
  if (extension === "png") return iconPng;
  if (extension === "jpg" || extension === "jpeg") return iconJpg;
  return iconJpg;
};

const initials = (name: string) => {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const formatKey = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (
      value.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "name" in (item as Record<string, unknown>)
      )
    ) {
      return value
        .map((item) => String((item as Record<string, unknown>).name))
        .join(", ");
    }
    if (value.every((item) => ["string", "number"].includes(typeof item))) {
      return value.join(", ");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "object") {
    if (
      "name" in (value as Record<string, unknown>) &&
      typeof (value as Record<string, unknown>).name === "string"
    ) {
      return String((value as Record<string, unknown>).name);
    }
    return JSON.stringify(value);
  }
  return String(value);
};

const areArraysEqual = (a: string[], b: string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const hasText = (value?: string | null) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== "—";
};

const hasSummary = (candidate: Candidate) =>
  hasText(candidate.ai_summary_markdown) || hasText(candidate.experience_summary);

const hasWorkHistory = (candidate: Candidate) =>
  (candidate.work_history ?? []).some(
    (item) =>
      hasText(item.role) ||
      hasText(item.company) ||
      hasText(item.details) ||
      hasText(item.start) ||
      hasText(item.end)
  );

const hasEducation = (candidate: Candidate) =>
  (candidate.education ?? []).some(
    (item) =>
      hasText(item.program) ||
      hasText(item.institution) ||
      hasText(item.details) ||
      hasText(item.start) ||
      hasText(item.end)
  );

const extractStoragePath = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return null;
  const marker = "/storage/v1/object/";
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const remainder = url.slice(index + marker.length);
  const segments = remainder.split("/");
  if (segments.length < 3) return null;
  const visibility = segments[0];
  if (visibility !== "public" && visibility !== "sign") return null;
  if (segments[1] !== "candidate-documents") return null;
  const path = segments.slice(2).join("/");
  return path || null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type RightTab =
  | "discussion"
  | "email"
  | "meetings"
  | "scorecards"
  | "tasks";

const scorecardScale = [
  { value: 0, icon: "👎👎", label: "Very Poor" },
  { value: 1, icon: "👎", label: "Poor" },
  { value: 2, icon: "○", label: "" },
  { value: 3, icon: "👍", label: "Good" },
  { value: 4, icon: "👍👍", label: "Very Good" },
];

const scorecardSections = [
  {
    title: "English",
    items: [
      { key: "english_fair", label: "FAIR" },
      { key: "english_average", label: "AVERAGE" },
      { key: "english_good", label: "GOOD" },
      { key: "english_excellent", label: "EXCELLENT" },
    ],
  },
  {
    title: "Other Languages",
    items: [
      { key: "other_languages_poor", label: "POOR" },
      { key: "other_languages_average", label: "AVERAGE" },
      { key: "other_languages_good", label: "GOOD" },
      { key: "other_languages_excellent", label: "EXCELLENT" },
    ],
  },
  {
    title: "Personality (smiling, friendly, confidence, motivation)",
    items: [
      { key: "personality_poor", label: "POOR" },
      { key: "personality_average", label: "AVERAGE" },
      { key: "personality_good", label: "GOOD" },
      { key: "personality_excellent", label: "EXCELLENT" },
    ],
  },
  {
    title: "Appearance (grooming, presentation)",
    items: [
      { key: "appearance_fair", label: "FAIR" },
      { key: "appearance_average", label: "AVERAGE" },
      { key: "appearance_good", label: "GOOD" },
      { key: "appearance_excellent", label: "EXCELLENT" },
    ],
  },
  {
    title: "Professional Knowledge",
    items: [
      { key: "professional_knowledge_fair", label: "FAIR" },
      { key: "professional_knowledge_average", label: "AVERAGE" },
      { key: "professional_knowledge_good", label: "GOOD" },
      { key: "professional_knowledge_excellent", label: "EXCELLENT" },
    ],
  },
  {
    title: "Work & Life Conditions",
    items: [
      {
        key: "work_life_conditions",
        label: "What do you know about your duties/salary/work hours etc",
      },
    ],
  },
  {
    title: "Motivation",
    items: [
      {
        key: "motivation",
        label:
          "Why do you want to work on cruise ships? Why should cruise company employ you?",
      },
    ],
  },
  {
    title: "About Yourself",
    items: [
      {
        key: "about_yourself",
        label:
          "If we contact your previous employer what do you think they will tell us about you?",
      },
    ],
  },
  {
    title: "Professional Questions",
    items: [
      {
        key: "professional_questions",
        label: "As per specific position and employer",
      },
    ],
  },
  {
    title: "Have you filled in the pre-screen questionnaires yourself?",
    items: [
      { key: "pre_screen_yes", label: "YES" },
      { key: "pre_screen_not", label: "NOT" },
    ],
  },
  {
    title: "Have you applied with any other agency/cruise company?",
    items: [
      { key: "other_agency_yes", label: "YES" },
      { key: "other_agency_no", label: "NO" },
    ],
  },
  {
    title: "Are you aware of the joining expenses and payable amounts?",
    items: [
      { key: "joining_expenses_yes", label: "YES" },
      { key: "joining_expenses_no", label: "NO" },
    ],
  },
  {
    title: "Do you have any visa refusals?",
    items: [
      { key: "visa_refusals_yes", label: "YES" },
      { key: "visa_refusals_no", label: "NO" },
    ],
  },
];

const interviewerOptions = [
  { id: "audrius", name: "Audrius Gadisauskas" },
  { id: "sandra", name: "Sandra Drevelkauskaite" },
];

type CandidateDrawerProps = {
  open: boolean;
  candidate: Candidate | null;
  sharePath?: string | null;
  stages: Stage[];
  pipelines: Pipeline[];
  onClose: () => void;
  onStageChange: (stageId: string) => void;
  onPipelineChange: (pipelineId: string) => void;
  mailerliteLoading?: boolean;
  mailerliteError?: string | null;
  onUpdateCandidate: (candidateId: string, updates: Partial<Candidate>) => void;
  onHydrateCandidate: (candidateId: string, updates: Partial<Candidate>) => void;
  currentUser?: {
    name?: string;
    email?: string;
    id?: string;
    avatar_url?: string | null;
  } | null;
};

export default function CandidateDrawer({
  open,
  candidate,
  sharePath,
  stages,
  pipelines,
  onClose,
  onStageChange,
  onPipelineChange,
  mailerliteLoading,
  mailerliteError,
  onUpdateCandidate,
  onHydrateCandidate,
  currentUser,
}: CandidateDrawerProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const topStrengths = Array.isArray(candidate?.top_strengths)
    ? candidate?.top_strengths.filter((item) => typeof item === "string" && item.trim())
    : [];
  const topConcerns = Array.isArray(candidate?.top_concerns)
    ? candidate?.top_concerns.filter((item) => typeof item === "string" && item.trim())
    : [];
  const [notes, setNotes] = useState<Note[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [taskDraft, setTaskDraft] = useState("");
  const [selectedFormFields, setSelectedFormFields] = useState<string[]>([]);
  const [isFormSelectionDirty, setIsFormSelectionDirty] = useState(false);
  const [formLink, setFormLink] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formCopied, setFormCopied] = useState(false);
  const [formStatus, setFormStatus] = useState<
    "pending" | "submitted" | "consumed" | null
  >(null);
  const [formLoading, setFormLoading] = useState(false);
  const [cvLink, setCvLink] = useState<string | null>(null);
  const [cvStatus, setCvStatus] = useState<"pending" | "submitted" | null>(null);
  const [cvSubmittedAt, setCvSubmittedAt] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvCopied, setCvCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeDocumentUrl, setActiveDocumentUrl] = useState<string | null>(null);
  const [activeDocumentName, setActiveDocumentName] = useState<string | null>(null);
  const [activeDocumentMime, setActiveDocumentMime] = useState<string | null>(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentUploadError, setDocumentUploadError] = useState<string | null>(
    null
  );
  const [documentUploadName, setDocumentUploadName] = useState<string | null>(
    null
  );
  const [resumeSignedUrl, setResumeSignedUrl] = useState<string | null>(null);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>(
    DEFAULT_QUESTIONNAIRES
  );
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [avatarOverrides, setAvatarOverrides] = useState<Record<string, string>>(
    {}
  );
  const [isQuestionnaireModalOpen, setIsQuestionnaireModalOpen] =
    useState(false);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState("");
  const [isCreateQuestionnaireModalOpen, setIsCreateQuestionnaireModalOpen] =
    useState(false);
  const [questionnaireDraftName, setQuestionnaireDraftName] = useState("");
  const [questionnaireDraftStatus, setQuestionnaireDraftStatus] =
    useState<QuestionnaireStatus>("Draft");
  const [questionnaireDraftError, setQuestionnaireDraftError] = useState<
    string | null
  >(null);
  const [returnToQuestionnaireModal, setReturnToQuestionnaireModal] =
    useState(false);
  const [signedDocUrls, setSignedDocUrls] = useState<Record<string, string>>(
    {}
  );
  const [signingDocId, setSigningDocId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"experience" | "resume" | "documents" | "questionnaires" | "more">(
    "experience"
  );
  const [rightTab, setRightTab] = useState<RightTab>("discussion");
  const [summaryDraft, setSummaryDraft] = useState(candidate?.experience_summary ?? "");
  const [workRole, setWorkRole] = useState("");
  const [workCompany, setWorkCompany] = useState("");
  const [workStart, setWorkStart] = useState("");
  const [workEnd, setWorkEnd] = useState("");
  const [workDetails, setWorkDetails] = useState("");
  const [showWorkForm, setShowWorkForm] = useState(false);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [eduProgram, setEduProgram] = useState("");
  const [eduInstitution, setEduInstitution] = useState("");
  const [eduStart, setEduStart] = useState("");
  const [eduEnd, setEduEnd] = useState("");
  const [eduDetails, setEduDetails] = useState("");
  const [showEducationForm, setShowEducationForm] = useState(false);
  const [editingEducationId, setEditingEducationId] = useState<string | null>(
    null
  );
  const [nameDraft, setNameDraft] = useState(candidate?.name ?? "");
  const [editingName, setEditingName] = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleNeedsReconnect, setGoogleNeedsReconnect] = useState(false);
  const [googleHasScopes, setGoogleHasScopes] = useState(true);
  const [meetingSubmitting, setMeetingSubmitting] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [meetingArtifactsLoading, setMeetingArtifactsLoading] = useState(false);
  const [meetingArtifactsError, setMeetingArtifactsError] = useState<string | null>(
    null
  );
  const [meetingRsvpLoading, setMeetingRsvpLoading] = useState(false);
  const [meetingRsvpError, setMeetingRsvpError] = useState<string | null>(null);
  const [aiChatMessages, setAiChatMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiChatError, setAiChatError] = useState<string | null>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const aiChatScrollRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastLoadedCandidateIdRef = useRef<string | null>(null);
  const discussionScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyOverflowRef = useRef<string>("");
  const bodyPaddingRef = useRef<string>("");
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showInterviewerMenu, setShowInterviewerMenu] = useState(false);
  const [interviewerQuery, setInterviewerQuery] = useState(
    candidate?.name ? "" : ""
  );
  const [meetingForm, setMeetingForm] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      date: today,
      timezone: "GMT+02:00 - Europe/Vilnius",
      time: "09:00",
      duration: "30 min",
      interviewers: "",
      title: `${candidate?.name ?? "Candidate"} Meeting`,
      description: "",
      interviewerName: "Audrius Gadisauskas",
      location: "",
      interviewGuide: "Standard Interview",
      meetingType: "Google Meet",
      requestScorecards: true,
      sendSms: true,
    };
  });

  useEffect(() => {
    if (!refreshing) return;
    if (!timelineLoading && !formLoading && !cvLoading && !snapshotLoading) {
      setRefreshing(false);
    }
  }, [refreshing, timelineLoading, formLoading, cvLoading, snapshotLoading]);

  useEffect(() => {
    if (open) return;
    setRefreshing(false);
    setSnapshotLoading(false);
  }, [open]);

  useEffect(() => {
    if (!showMeetingModal) return;
    let ignore = false;
    setMeetingError(null);
    const loadStatus = async () => {
      try {
        const res = await fetch("/api/google/status", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!ignore) {
          setGoogleConnected(!!data?.connected);
          setGoogleNeedsReconnect(!!data?.needsReconnect);
          setGoogleHasScopes(data?.hasRequiredScopes !== false);
        }
      } catch {
        if (!ignore) {
          setGoogleConnected(false);
          setGoogleNeedsReconnect(false);
          setGoogleHasScopes(true);
        }
      }
    };
    loadStatus();
    return () => {
      ignore = true;
    };
  }, [showMeetingModal]);

  useEffect(() => {
    if (!open || !candidate?.meeting_link) return;
    if (!candidate.meeting_start) return;
    const start = new Date(candidate.meeting_start);
    if (Number.isNaN(start.getTime())) return;
    if (start > new Date()) return;
    if (candidate.meeting_recording_url || candidate.meeting_transcript_url) return;
    const lastCheck = candidate.meeting_artifacts_checked_at
      ? new Date(candidate.meeting_artifacts_checked_at)
      : null;
    if (lastCheck && Date.now() - lastCheck.getTime() < 30 * 60 * 1000) return;
    void syncMeetingArtifacts();
  }, [
    open,
    candidate?.id,
    candidate?.meeting_link,
    candidate?.meeting_start,
    candidate?.meeting_recording_url,
    candidate?.meeting_transcript_url,
    candidate?.meeting_artifacts_checked_at,
  ]);

  useEffect(() => {
    if (!open) return;
    if (!candidate?.meeting_event_id || !candidate.email) return;
    const lastCheck = candidate.meeting_rsvp_updated_at
      ? new Date(candidate.meeting_rsvp_updated_at)
      : null;
    if (lastCheck && Date.now() - lastCheck.getTime() < 10 * 60 * 1000) return;
    void syncMeetingRsvp();
  }, [
    open,
    candidate?.id,
    candidate?.meeting_event_id,
    candidate?.email,
    candidate?.meeting_rsvp_updated_at,
  ]);

  const handleRefresh = () => {
    if (!candidate?.id) return;
    setRefreshing(true);
    setRefreshCounter((prev) => prev + 1);
  };

  const handleCopyShareLink = async () => {
    if (typeof window === "undefined") return;
    const targetUrl =
      sharePath && sharePath.startsWith("/")
        ? `${window.location.origin}${sharePath}`
        : window.location.href;
    await navigator.clipboard.writeText(targetUrl);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1800);
  };

  const handleCreateMeeting = async (
    override?: Partial<typeof meetingForm>,
    options?: { instant?: boolean }
  ) => {
    if (!candidate) return;
    setMeetingError(null);
    const payload = { ...meetingForm, ...override };
    if (payload.meetingType !== "Google Meet") {
      setMeetingError("Only Google Meet is supported right now.");
      return;
    }
    if (googleConnected === false) {
      setMeetingError("Connect Google to create a Meet link.");
      return;
    }
    if (googleNeedsReconnect) {
      setMeetingError("Reconnect Google to create a Meet link.");
      return;
    }
    if (!googleHasScopes) {
      setMeetingError("Reconnect Google and approve Calendar permissions.");
      return;
    }
    const attendeeEmails = [
      candidate.email,
      currentUser?.email,
      ...parseEmails(payload.interviewers),
    ].filter(Boolean) as string[];

    setMeetingSubmitting(true);
    try {
      const res = await fetch("/api/google/meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          title: payload.title,
          description: payload.description,
          location: payload.location,
          date: payload.date,
          time: payload.time,
          duration: payload.duration,
          timezone: payload.timezone,
          attendees: attendeeEmails,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) {
          setGoogleNeedsReconnect(true);
        }
        if (res.status === 403) {
          setGoogleHasScopes(false);
        }
        throw new Error(data?.error ?? "Failed to create meeting.");
      }
      onUpdateCandidate(candidate.id, {
        meeting_link: data?.meetLink ?? undefined,
        meeting_provider: "google_meet",
        meeting_event_id: data?.eventId ?? undefined,
        meeting_start: data?.start ?? undefined,
        meeting_end: data?.end ?? undefined,
        meeting_timezone: data?.timezone ?? payload.timezone,
        meeting_title: payload.title,
        meeting_interviewers:
          payload.interviewers?.trim() || payload.interviewerName,
        meeting_rsvp_status: "needsAction",
        meeting_rsvp_email: candidate.email,
        meeting_rsvp_updated_at: new Date().toISOString(),
        meeting_created_at: new Date().toISOString(),
        meeting_is_instant: options?.instant ?? false,
      });
      const scheduledLabel = formatTimestamp(
        `${payload.date}T${payload.time}:00`
      );
      const durationLabel = payload.duration || "30 min";
      void addActivity(
        `Scheduled a Google Meet interview • ${scheduledLabel} (${durationLabel}).`,
        "system"
      );
      setShowMeetingModal(false);
    } catch (err) {
      setMeetingError(
        err instanceof Error ? err.message : "Failed to create meeting."
      );
    } finally {
      setMeetingSubmitting(false);
    }
  };

  const handleInstantMeeting = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const minutes = now.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 5) * 5;
    let hour = now.getHours();
    let minute = roundedMinutes;
    if (roundedMinutes >= 60) {
      hour = (hour + 1) % 24;
      minute = 0;
    }
    const date = `${year}-${month}-${day}`;
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}`;
    setMeetingForm((prev) => ({ ...prev, date, time }));
    void handleCreateMeeting({ date, time }, { instant: true });
  };

  const syncMeetingArtifacts = async (options?: { generateSummary?: boolean }) => {
    if (!candidate?.meeting_link) {
      setMeetingArtifactsError("No meeting link to sync.");
      return;
    }
    setMeetingArtifactsLoading(true);
    setMeetingArtifactsError(null);
    try {
      const res = await fetch("/api/google/meet/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingLink: candidate.meeting_link,
          generateSummary: options?.generateSummary ?? false,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to sync meeting artifacts.");
      }
      onUpdateCandidate(candidate.id, {
        meeting_conference_record: data?.conferenceRecord ?? undefined,
        meeting_recording_url: data?.recording?.exportUri ?? undefined,
        meeting_recording_file: data?.recording?.file ?? undefined,
        meeting_recording_state: data?.recording?.state ?? undefined,
        meeting_transcript_url: data?.transcript?.exportUri ?? undefined,
        meeting_transcript_doc: data?.transcript?.document ?? undefined,
        meeting_transcript_state: data?.transcript?.state ?? undefined,
        meeting_transcript_excerpt: data?.transcriptText ?? undefined,
        meeting_transcript_summary: data?.summary ?? candidate.meeting_transcript_summary,
        meeting_artifacts_checked_at: new Date().toISOString(),
      });
    } catch (err) {
      setMeetingArtifactsError(
        err instanceof Error ? err.message : "Failed to sync meeting artifacts."
      );
    } finally {
      setMeetingArtifactsLoading(false);
    }
  };

  const syncMeetingRsvp = async () => {
    if (!candidate?.meeting_event_id) {
      setMeetingRsvpError("No meeting event id.");
      return;
    }
    if (!candidate.email) {
      setMeetingRsvpError("Candidate email is missing.");
      return;
    }
    setMeetingRsvpLoading(true);
    setMeetingRsvpError(null);
    try {
      const res = await fetch("/api/google/meet/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: candidate.meeting_event_id,
          attendeeEmail: candidate.email,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to sync RSVP status.");
      }
      onUpdateCandidate(candidate.id, {
        meeting_rsvp_status: data?.status ?? undefined,
        meeting_rsvp_email: data?.email ?? candidate.email,
        meeting_rsvp_updated_at: new Date().toISOString(),
      });
    } catch (err) {
      setMeetingRsvpError(
        err instanceof Error ? err.message : "Failed to sync RSVP status."
      );
    } finally {
      setMeetingRsvpLoading(false);
    }
  };

  const handleCancelMeeting = async () => {
    if (!candidate) return;
    setMeetingError(null);
    const confirmed = window.confirm("Cancel this meeting?");
    if (!confirmed) return;
    try {
      if (candidate.meeting_event_id) {
        const res = await fetch("/api/google/meet/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: candidate.meeting_event_id }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to cancel meeting.");
        }
      }
      onUpdateCandidate(candidate.id, {
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
        ? `Canceled the scheduled interview • ${formatTimestamp(
            candidate.meeting_start
          )}.`
        : "Canceled the scheduled interview.";
      void addActivity(cancelLabel, "system");
    } catch (err) {
      setMeetingError(
        err instanceof Error ? err.message : "Failed to cancel meeting."
      );
    }
  };

  useEffect(() => {
    setFormLink(null);
    setFormError(null);
    setFormCopied(false);
    setFormStatus(null);
    setFormLoading(false);
    setCvLink(null);
    setCvStatus(null);
    setCvSubmittedAt(null);
    setCvLoading(false);
    setCvError(null);
    setCvCopied(false);
    setSignedDocUrls({});
    setSigningDocId(null);
    setActiveDocumentId(null);
    setActiveDocumentUrl(null);
    setActiveDocumentName(null);
    setActiveDocumentMime(null);
    setResumeSignedUrl(null);
    setIsDocumentModalOpen(false);
    setDocumentUploading(false);
    setDocumentUploadError(null);
    setDocumentUploadName(null);
    setIsQuestionnaireModalOpen(false);
    setSelectedQuestionnaire("");
    setIsCreateQuestionnaireModalOpen(false);
    setQuestionnaireDraftName("");
    setQuestionnaireDraftStatus("Draft");
    setQuestionnaireDraftError(null);
    setReturnToQuestionnaireModal(false);
    setIsFormSelectionDirty(false);
    setRefreshing(false);
    setSnapshotLoading(false);
    setRefreshCounter(0);
    setAiChatMessages([]);
    setAiChatInput("");
    setAiChatLoading(false);
    setAiChatError(null);
    setAiChatOpen(false);
  }, [candidate?.id]);

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
      } finally {
      }
    };
    loadQuestionnairesFromDb();
    return () => {
      ignore = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!open || !candidate?.id) {
      lastLoadedCandidateIdRef.current = null;
      setNotes([]);
      setActivity([]);
      return;
    }
    const isSameCandidate = lastLoadedCandidateIdRef.current === candidate.id;
    if (isSameCandidate && refreshCounter === 0) return;
    if (!isSameCandidate) {
      lastLoadedCandidateIdRef.current = candidate.id;
    }
    let ignore = false;
    const loadDetails = async () => {
      setTimelineLoading(true);
      setTimelineError(null);
      try {
        const [
          noteResult,
          activityResult,
          taskResult,
          workResult,
          educationResult,
          attachmentResult,
          scorecardResult,
          questionnaireResult,
        ] = await Promise.all([
          supabase
            .from("candidate_notes")
            .select("id,candidate_id,body,created_at,author_name,author_email,author_id")
            .eq("candidate_id", candidate.id)
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("candidate_activity")
            .select("id,candidate_id,type,body,created_at,author_name,author_email,author_id")
            .eq("candidate_id", candidate.id)
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("candidate_tasks")
            .select("candidate_id,id,title,status,created_at")
            .eq("candidate_id", candidate.id),
          supabase
            .from("candidate_work_history")
            .select("candidate_id,id,role,company,start,end,details,created_at")
            .eq("candidate_id", candidate.id),
          supabase
            .from("candidate_education")
            .select(
              "candidate_id,id,program,institution,start,end,details,created_at"
            )
            .eq("candidate_id", candidate.id),
          supabase
            .from("candidate_attachments")
            .select("candidate_id,id,name,mime,url,path,kind,created_at,created_by")
            .eq("candidate_id", candidate.id),
          supabase
            .from("candidate_scorecards")
            .select("candidate_id,thoughts,overall_rating,entries,updated_at")
            .eq("candidate_id", candidate.id)
            .maybeSingle(),
          supabase
            .from("candidate_questionnaires")
            .select("id,candidate_id,questionnaire_id,name,status,sent_at,sent_by")
            .eq("candidate_id", candidate.id),
        ]);

        if (noteResult.error) throw new Error(noteResult.error.message);
        if (activityResult.error) throw new Error(activityResult.error.message);
        if (taskResult.error) throw new Error(taskResult.error.message);
        if (workResult.error) throw new Error(workResult.error.message);
        if (educationResult.error) throw new Error(educationResult.error.message);
        if (attachmentResult.error) throw new Error(attachmentResult.error.message);
        if (scorecardResult.error) throw new Error(scorecardResult.error.message);
        if (questionnaireResult.error)
          throw new Error(questionnaireResult.error.message);

        if (ignore) return;

        setNotes((noteResult.data ?? []).map((row) => mapNoteRow(row as NoteRow)));
        setActivity(
          (activityResult.data ?? []).map((row) =>
            mapActivityRow(row as ActivityRow)
          )
        );

        const tasks = (taskResult.data ?? []).map((row) =>
          mapTaskRow(row as TaskRow)
        );
        const workHistory = (workResult.data ?? []).map((row) =>
          mapWorkHistoryRow(row as WorkHistoryRow)
        );
        const education = (educationResult.data ?? []).map((row) =>
          mapEducationRow(row as EducationRow)
        );
        const attachments = (attachmentResult.data ?? []).map((row) =>
          mapAttachmentRow(row as AttachmentRow)
        );
        const questionnaires = (questionnaireResult.data ?? []).map((row) =>
          mapQuestionnaireRow(row as QuestionnaireRow)
        );
        const scorecard = scorecardResult.data
          ? mapScorecardRow(scorecardResult.data as ScorecardRow)
          : undefined;

        onHydrateCandidate(candidate.id, {
          tasks,
          work_history: workHistory,
          education,
          attachments,
          scorecard,
          questionnaires_sent: questionnaires,
        });
      } catch (err) {
        if (!ignore) {
          setTimelineError(
            err instanceof Error ? err.message : "Failed to load activity"
          );
        }
      } finally {
        if (!ignore) {
          setTimelineLoading(false);
        }
      }
    };
    loadDetails();
    return () => {
      ignore = true;
    };
  }, [open, candidate?.id, refreshCounter, supabase, onHydrateCandidate]);

  useEffect(() => {
    if (!open || !candidate?.id) return;
    const channel = supabase.channel(`candidate-timeline-${candidate.id}`);

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "candidate_notes",
        filter: `candidate_id=eq.${candidate.id}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const oldRow = payload.old as NoteRow | null;
          if (!oldRow?.id) return;
          setNotes((prev) => prev.filter((note) => note.id !== oldRow.id));
          return;
        }
        const row = payload.new as NoteRow | null;
        if (!row?.id) return;
        const mapped = mapNoteRow(row);
        setNotes((prev) => {
          const index = prev.findIndex((note) => note.id === mapped.id);
          if (index === -1) return [mapped, ...prev];
          const next = [...prev];
          next[index] = mapped;
          return next;
        });
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "candidate_activity",
        filter: `candidate_id=eq.${candidate.id}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const oldRow = payload.old as ActivityRow | null;
          if (!oldRow?.id) return;
          setActivity((prev) => prev.filter((entry) => entry.id !== oldRow.id));
          return;
        }
        const row = payload.new as ActivityRow | null;
        if (!row?.id) return;
        const mapped = mapActivityRow(row);
        setActivity((prev) => {
          const index = prev.findIndex((entry) => entry.id === mapped.id);
          if (index === -1) return [mapped, ...prev];
          const next = [...prev];
          next[index] = mapped;
          return next;
        });
      }
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, candidate?.id, supabase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!candidate?.id) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ActivityEvent>).detail;
      if (!detail?.id || detail.candidate_id !== candidate.id) return;
      setActivity((prev) => {
        const index = prev.findIndex((entry) => entry.id === detail.id);
        if (index === -1) return [detail, ...prev];
        const next = [...prev];
        next[index] = detail;
        return next;
      });
    };
    window.addEventListener("candidate-activity", handler as EventListener);
    return () => {
      window.removeEventListener("candidate-activity", handler as EventListener);
    };
  }, [candidate?.id, refreshCounter]);

  useEffect(() => {
    let ignore = false;
    const loadTeamUsers = async () => {
      try {
        const res = await fetch("/api/admin/users", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) return;
        const list = Array.isArray(data?.users) ? data.users : [];
        if (!ignore) {
          setTeamUsers(
            list.map((user: TeamUser) => ({
              id: user.id,
              email: user.email ?? "",
              name: user.name ?? "",
              avatar_url: user.avatar_url ?? null,
              avatar_path: user.avatar_path ?? null,
            }))
          );
        }
      } catch {
        // ignore - avatars are optional
      }
    };
    loadTeamUsers();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (teamUsers.length === 0) return;
    let ignore = false;
    const loadMissingAvatars = async () => {
      const missing = teamUsers.filter(
        (user) =>
          !!user.avatar_path &&
          !user.avatar_url &&
          !avatarOverrides[user.id]
      );
      if (missing.length === 0) return;
      const updates: Record<string, string> = {};
      await Promise.all(
        missing.map(async (user) => {
          try {
            const res = await fetch(
              `/api/storage/sign?bucket=candidate-documents&path=${encodeURIComponent(
                user.avatar_path ?? ""
              )}`,
              { cache: "no-store" }
            );
            const data = await res.json().catch(() => null);
            if (res.ok && data?.url) {
              updates[user.id] = data.url as string;
            }
          } catch {
            // ignore
          }
        })
      );
      if (!ignore && Object.keys(updates).length > 0) {
        setAvatarOverrides((prev) => ({ ...prev, ...updates }));
      }
    };
    loadMissingAvatars();
    return () => {
      ignore = true;
    };
  }, [teamUsers, avatarOverrides]);
  const rawTasks = Array.isArray(candidate?.tasks)
    ? candidate?.tasks.filter(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "title" in (item as Record<string, unknown>)
      )
    : [];
  const sentQuestionnaires = Array.isArray(candidate?.questionnaires_sent)
    ? candidate?.questionnaires_sent.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { name?: string }).name === "string"
      )
    : [];
  const sentQuestionnairesSorted = [...sentQuestionnaires].sort((a, b) => {
    const aTime = new Date(a.sent_at).getTime();
    const bTime = new Date(b.sent_at).getTime();
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
    return bTime - aTime;
  });
  const teamUsersById = useMemo(() => {
    const map = new Map<string, TeamUser>();
    teamUsers.forEach((user) => {
      if (user.id) {
        map.set(user.id, user);
      }
    });
    return map;
  }, [teamUsers]);
  const teamUsersByEmail = useMemo(() => {
    const map = new Map<string, TeamUser>();
    teamUsers.forEach((user) => {
      const email = user.email?.toLowerCase();
      if (email) {
        map.set(email, user);
      }
    });
    return map;
  }, [teamUsers]);
  const mentionLabels = useMemo(() => {
    const labels = new Map<string, MentionLabel>();
    teamUsers.forEach((user) => {
      const label = (user.name || user.email || "").trim();
      if (!label) return;
      const lower = label.toLowerCase();
      if (!labels.has(lower)) {
        labels.set(lower, { label, lower });
      }
    });
    return Array.from(labels.values()).sort(
      (a, b) => b.label.length - a.label.length
    );
  }, [teamUsers]);

  const resolveAvatar = (
    authorId?: string,
    authorEmail?: string,
    isMine?: boolean
  ) => {
    if (authorId) {
      const match = teamUsersById.get(authorId);
      if (match?.avatar_url) return match.avatar_url;
      if (avatarOverrides[authorId]) return avatarOverrides[authorId];
    }
    if (authorEmail) {
      const match = teamUsersByEmail.get(authorEmail.toLowerCase());
      if (match?.avatar_url) return match.avatar_url;
      if (match?.id && avatarOverrides[match.id]) {
        return avatarOverrides[match.id];
      }
    }
    if (isMine && currentUser?.avatar_url) return currentUser.avatar_url;
    return null;
  };

  const resetQuestionnaireDraft = () => {
    setQuestionnaireDraftName("");
    setQuestionnaireDraftStatus("Draft");
    setQuestionnaireDraftError(null);
  };

  const handleCloseCreateQuestionnaireModal = (returnToSend = false) => {
    setIsCreateQuestionnaireModalOpen(false);
    resetQuestionnaireDraft();
    const shouldReturn = returnToSend || returnToQuestionnaireModal;
    setReturnToQuestionnaireModal(false);
    if (shouldReturn) {
      setIsQuestionnaireModalOpen(true);
    }
  };

  const handleOpenCreateQuestionnaire = (returnToSend = false) => {
    if (returnToSend) {
      setIsQuestionnaireModalOpen(false);
      setReturnToQuestionnaireModal(true);
    }
    setIsCreateQuestionnaireModalOpen(true);
    setQuestionnaireDraftError(null);
  };

  const handleCreateQuestionnaire = async () => {
    const trimmed = questionnaireDraftName.trim();
    if (!trimmed) {
      setQuestionnaireDraftError("Enter a questionnaire name.");
      return;
    }
    const existing = new Set(questionnaires.map((item) => item.id));
    const id = buildQuestionnaireId(trimmed, existing);
    const next = { id, name: trimmed, status: questionnaireDraftStatus };
    try {
      const { error } = await supabase.from("questionnaires").insert(next);
      if (error) throw new Error(error.message);
      setQuestionnaires((prev) => [...prev, next]);
      setSelectedQuestionnaire(id);
      handleCloseCreateQuestionnaireModal(true);
    } catch (err) {
      setQuestionnaireDraftError(
        err instanceof Error ? err.message : "Failed to create questionnaire."
      );
    }
  };

  const handleSendQuestionnaire = () => {
    if (!candidate || !selectedQuestionnaire) return;
    const selected = questionnaires.find(
      (item) => item.id === selectedQuestionnaire
    );
    if (!selected) return;
    const sentBy =
      currentUser?.name?.trim() ||
      currentUser?.email?.trim() ||
      undefined;
    const entry = {
      id: crypto.randomUUID(),
      questionnaire_id: selected.id,
      name: selected.name,
      status: selected.status,
      sent_at: new Date().toISOString(),
      sent_by: sentBy,
    };
    onUpdateCandidate(candidate.id, {
      questionnaires_sent: [...(candidate.questionnaires_sent ?? []), entry],
    });
    void addActivity(`Questionnaire sent: ${selected.name}.`, "system");
    setIsQuestionnaireModalOpen(false);
    setSelectedQuestionnaire("");
  };

  const handleAskAi = async () => {
    if (!candidate) return;
    const question = aiChatInput.trim();
    if (!question) return;
    setAiChatError(null);
    setAiChatLoading(true);
    setAiChatInput("");
    setAiChatMessages((prev) => [...prev, { role: "user", content: question }]);
    try {
      const res = await fetch("/api/ai/candidate-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          candidate: {
            name: candidate.name,
            desired_position: candidate.desired_position,
            experience_summary: candidate.experience_summary,
            ai_summary_markdown: candidate.ai_summary_markdown,
            top_strengths: candidate.top_strengths,
            top_concerns: candidate.top_concerns,
            tags: candidate.tags,
            work_history: candidate.work_history,
            education: candidate.education,
            meeting_transcript_excerpt: candidate.meeting_transcript_excerpt,
            meeting_transcript_summary: candidate.meeting_transcript_summary,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to get AI response.");
      }
      setAiChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data?.answer ?? "" },
      ]);
    } catch (err) {
      setAiChatError(
        err instanceof Error ? err.message : "Failed to get AI response."
      );
    } finally {
      setAiChatLoading(false);
    }
  };

  const addActivity = async (body: string, type: ActivityEvent["type"]) => {
    if (!candidate) return;
    const authorLabel =
      currentUser?.name?.trim() ||
      currentUser?.email?.trim() ||
      "Team Member";
    const entry: ActivityEvent = {
      id: crypto.randomUUID(),
      candidate_id: candidate.id,
      body,
      type,
      created_at: new Date().toISOString(),
      author_name: authorLabel,
      author_email: currentUser?.email ?? undefined,
      author_id: currentUser?.id ?? undefined,
    };
    setActivity((prev) => [entry, ...prev]);
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
        throw new Error(data?.error ?? "Failed to save activity");
      }
    } catch (error) {
      setTimelineError(
        error instanceof Error ? error.message : "Failed to save activity"
      );
    }
  };

  const handleAddNote = async (body: string) => {
    if (!candidate) return;
    const authorLabel =
      currentUser?.name?.trim() ||
      currentUser?.email?.trim() ||
      "Team Member";
    const note: Note = {
      id: crypto.randomUUID(),
      candidate_id: candidate.id,
      body,
      created_at: new Date().toISOString(),
      author_name: authorLabel,
      author_email: currentUser?.email ?? undefined,
      author_id: currentUser?.id ?? undefined,
    };
    setNotes((prev) => [note, ...prev]);
    const { error } = await supabase.from("candidate_notes").insert({
      id: note.id,
      candidate_id: note.candidate_id,
      body: note.body,
      created_at: note.created_at,
      author_name: note.author_name ?? null,
      author_email: note.author_email ?? null,
      author_id: note.author_id ?? null,
    });
    if (error) {
      setTimelineError(error.message);
    }
  };

  const hasDocument = (fieldKey: string) => {
    const key = fieldKey.toLowerCase();
    const keyLabel = key.replace(/_/g, " ");
    return (candidate?.attachments ?? []).some((attachment) => {
      if (attachment.kind !== "document") return false;
      const name = (attachment.name ?? "").toLowerCase();
      const path = (attachment.path ?? "").toLowerCase();
      return (
        name.includes(key) ||
        name.includes(keyLabel) ||
        path.includes(`/${key}-`)
      );
    });
  };

  const missingFieldKeys = useMemo(() => {
    if (!candidate) return [];
    return FORM_FIELD_DEFINITIONS.filter((field) => {
      if (field.key === "email") {
        return !candidate.email || candidate.email.trim() === "—";
      }
      if (field.key === "phone") {
        return !candidate.phone || candidate.phone.trim() === "—";
      }
      if (field.key === "nationality") {
        return !candidate.nationality || candidate.nationality.trim() === "—";
      }
      if (field.key === "country") {
        return !candidate.country || candidate.country.trim() === "—";
      }
      if (field.key === "summary") {
        return !hasSummary(candidate);
      }
      if (field.key === "work_history") {
        return !hasWorkHistory(candidate);
      }
      if (field.key === "education") {
        return !hasEducation(candidate);
      }
      const task = rawTasks.find((item) => item.id === `form_${field.key}`);
      if (task?.status === "done") return false;
      return !hasDocument(field.key);
    }).map((field) => field.key);
  }, [candidate, rawTasks]);

  useEffect(() => {
    if (!candidate?.id) return;
    if (formStatus) return;
    if (isFormSelectionDirty) return;
    setSelectedFormFields((prev) =>
      areArraysEqual(prev, missingFieldKeys) ? prev : missingFieldKeys
    );
  }, [candidate?.id, formStatus, missingFieldKeys, isFormSelectionDirty]);
  useEffect(() => {
    let ignore = false;
    const loadExistingForm = async () => {
      if (!candidate?.id) return;
      setFormLoading(true);
      setFormError(null);
      try {
        const res = await fetch(
          `/api/forms?candidateId=${encodeURIComponent(candidate.id)}`,
          { cache: "no-store" }
        );
        if (res.status === 404) {
          if (!ignore) {
            setFormStatus(null);
            setSelectedFormFields([]);
          }
          return;
        }
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to load form link.");
        }
        if (!ignore) {
          const status =
            data?.status === "pending" ||
            data?.status === "submitted" ||
            data?.status === "consumed"
              ? data.status
              : "pending";
          setFormStatus(status);
          setSelectedFormFields(
            Array.isArray(data?.fields) ? data.fields : []
          );
          if (
            data?.token &&
            status === "pending" &&
            typeof window !== "undefined"
          ) {
            setFormLink(`${window.location.origin}/form/${data.token}`);
          } else {
            setFormLink(null);
          }
        }
      } catch (err) {
        if (!ignore) {
          setFormError(
            err instanceof Error ? err.message : "Failed to load form link."
          );
        }
      } finally {
        if (!ignore) {
          setFormLoading(false);
        }
      }
    };
    loadExistingForm();
    return () => {
      ignore = true;
    };
  }, [candidate?.id, refreshCounter]);

  useEffect(() => {
    let ignore = false;
    const loadExistingCvForm = async () => {
      if (!candidate?.id) return;
      setCvLoading(true);
      setCvError(null);
      try {
        const res = await fetch(
          `/api/cv?candidateId=${encodeURIComponent(candidate.id)}`,
          { cache: "no-store" }
        );
        if (res.status === 404) {
          if (!ignore) {
            setCvStatus(null);
            setCvLink(null);
            setCvSubmittedAt(null);
          }
          return;
        }
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to load CV link.");
        }
        if (!ignore) {
          const status =
            data?.status === "pending" || data?.status === "submitted"
              ? data.status
              : "pending";
          setCvStatus(status);
          setCvSubmittedAt(data?.submittedAt ?? null);
          if (data?.token && status === "pending") {
            setCvLink(`${window.location.origin}/cv/${data.token}`);
          } else {
            setCvLink(null);
          }
        }
      } catch (err) {
        if (!ignore) {
          setCvError(
            err instanceof Error ? err.message : "Failed to load CV link."
          );
        }
      } finally {
        if (!ignore) {
          setCvLoading(false);
        }
      }
    };
    loadExistingCvForm();
    return () => {
      ignore = true;
    };
  }, [candidate?.id, refreshCounter]);

  useEffect(() => {
    let ignore = false;
    const loadCandidateSnapshot = async () => {
      if (!candidate?.id || refreshCounter === 0) return;
      setSnapshotLoading(true);
      try {
        const { data, error } = await supabase
          .from("candidates")
          .select(
            "id,pipeline_id,stage_id,pool_id,status,order,created_at,updated_at,data"
          )
          .eq("id", candidate.id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data || ignore) return;
        const row = data as CandidateRow;
        const rowData = (row.data ?? {}) as Partial<Candidate>;
        onHydrateCandidate(candidate.id, {
          ...rowData,
          pipeline_id: row.pipeline_id ?? rowData.pipeline_id ?? candidate.pipeline_id,
          stage_id: row.stage_id ?? rowData.stage_id ?? candidate.stage_id,
          pool_id: row.pool_id ?? rowData.pool_id ?? candidate.pool_id,
          status:
            (row.status as Candidate["status"]) ??
            rowData.status ??
            candidate.status,
          order:
            typeof row.order === "number"
              ? row.order
              : rowData.order ?? candidate.order,
          created_at:
            row.created_at ?? rowData.created_at ?? candidate.created_at,
          updated_at:
            row.updated_at ?? rowData.updated_at ?? candidate.updated_at,
        });
      } catch {
      } finally {
        if (!ignore) {
          setSnapshotLoading(false);
        }
      }
    };
    loadCandidateSnapshot();
    return () => {
      ignore = true;
    };
  }, [candidate?.id, refreshCounter, supabase, onHydrateCandidate]);

  const buildScorecardDraft = (source?: Scorecard): Scorecard => ({
    thoughts: source?.thoughts ?? "",
    overall_rating: source?.overall_rating ?? null,
    entries: source?.entries ?? {},
  });
  const [scorecardDraft, setScorecardDraft] = useState<Scorecard>(
    buildScorecardDraft(candidate?.scorecard)
  );

  useEffect(() => {
    setSummaryDraft(candidate?.experience_summary ?? "");
  }, [candidate?.experience_summary]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;
    const { body } = document;
    bodyOverflowRef.current = body.style.overflow;
    bodyPaddingRef.current = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      body.style.overflow = bodyOverflowRef.current;
      body.style.paddingRight = bodyPaddingRef.current;
    };
  }, [open]);

  useEffect(() => {
    if (!open || rightTab !== "discussion") return;
    const el = discussionScrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [open, rightTab, candidate?.id, activity.length, notes.length]);

  useEffect(() => {
    if (!aiChatOpen) return;
    const el = aiChatScrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [aiChatOpen, aiChatMessages.length]);

  useEffect(() => {
    setNameDraft(candidate?.name ?? "");
  }, [candidate?.name]);

  useEffect(() => {
    setShowWorkForm(false);
    setEditingWorkId(null);
    setWorkRole("");
    setWorkCompany("");
    setWorkStart("");
    setWorkEnd("");
    setWorkDetails("");
    setShowEducationForm(false);
    setEditingEducationId(null);
    setEduProgram("");
    setEduInstitution("");
    setEduStart("");
    setEduEnd("");
    setEduDetails("");
    setEditingName(false);
    setNameDraft(candidate?.name ?? "");
    setRightTab("discussion");
    setScorecardDraft(buildScorecardDraft(candidate?.scorecard));
    setSaving(false);
    setShowMeetingModal(false);
    setMeetingForm((prev) => ({
      ...prev,
      date: new Date().toISOString().slice(0, 10),
      title: `${candidate?.name ?? "Candidate"} Meeting`,
    }));
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [candidate?.id]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (showMeetingModal) {
      setInterviewerQuery(meetingForm.interviewers);
    }
  }, [showMeetingModal]);

  const documentAttachments = (candidate?.attachments ?? []).filter(
    (item) => item.kind === "document"
  );

  const documentEntries = documentAttachments.map((doc) => ({
    doc,
    path: doc.path ?? extractStoragePath(doc.url),
  }));

  const documentPaths = documentEntries
    .map((entry) => entry.path)
    .filter((path): path is string => typeof path === "string");

  const isPdfFile = (mime?: string | null, url?: string | null) =>
    Boolean(mime?.toLowerCase().includes("pdf")) ||
    Boolean(url?.toLowerCase().includes(".pdf"));

  const isImageFile = (mime?: string | null, url?: string | null) => {
    if (mime?.toLowerCase().startsWith("image/")) return true;
    return Boolean(url?.toLowerCase().match(/\.(png|jpe?g|gif|webp)$/));
  };

  const handleOpenDocument = async (
    docId: string,
    path?: string | null,
    fallbackUrl?: string | null
  ) => {
    if (signingDocId === docId) return;
    const signedUrl = path ? signedDocUrls[path] : undefined;
    const directUrl = signedUrl ?? fallbackUrl ?? null;
    if (directUrl) {
      window.open(directUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!path) return;
    setSigningDocId(docId);
    try {
      const res = await fetch(
        `/api/storage/sign?path=${encodeURIComponent(path)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (res.ok && data?.url) {
        setSignedDocUrls((prev) => ({ ...prev, [path]: data.url }));
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setSigningDocId(null);
    }
  };

  const handleSelectDocument = async (
    docId: string,
    name?: string | null,
    mime?: string | null,
    path?: string | null,
    fallbackUrl?: string | null
  ) => {
    setActiveDocumentId(docId);
    setActiveDocumentName(name ?? "Document");
    setActiveDocumentMime(mime ?? null);
    setIsDocumentModalOpen(true);
    const signedUrl = path ? signedDocUrls[path] : undefined;
    const directUrl = signedUrl ?? fallbackUrl ?? null;
    if (directUrl) {
      setActiveDocumentUrl(directUrl);
      return;
    }
    if (!path) {
      setActiveDocumentUrl(null);
      return;
    }
    setSigningDocId(docId);
    try {
      const res = await fetch(
        `/api/storage/sign?path=${encodeURIComponent(path)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (res.ok && data?.url) {
        setSignedDocUrls((prev) => ({ ...prev, [path]: data.url }));
        setActiveDocumentUrl(data.url);
      } else {
        setActiveDocumentUrl(null);
      }
    } finally {
      setSigningDocId(null);
    }
  };

  const handleDocumentUpload = async (file: File | null) => {
    if (!file || !candidate) return;
    setDocumentUploading(true);
    setDocumentUploadError(null);
    setDocumentUploadName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("candidateId", candidate.id);
      const res = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Upload failed");
      }
      const createdBy =
        currentUser?.name?.trim() ||
        currentUser?.email?.trim() ||
        "Team Member";
      const newAttachment = {
        id: crypto.randomUUID(),
        name: data?.name ?? file.name,
        mime: data?.mime ?? file.type,
        path: data?.path ?? undefined,
        url: data?.url ?? undefined,
        kind: "document" as const,
        created_at: new Date().toISOString(),
        created_by: createdBy,
      };
      onUpdateCandidate(candidate.id, {
        attachments: [...(candidate.attachments ?? []), newAttachment],
      });
    } catch (err) {
      setDocumentUploadError(
        err instanceof Error ? err.message : "Upload failed"
      );
    } finally {
      setDocumentUploading(false);
      setDocumentUploadName(null);
    }
  };

  const resumeAttachment = candidate?.attachments?.find(
    (item) => item.kind === "resume"
  );

  useEffect(() => {
    let ignore = false;
    const signResume = async () => {
      if (!open) {
        setResumeSignedUrl(null);
        return;
      }
      if (!resumeAttachment?.path) {
        setResumeSignedUrl(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/storage/sign?bucket=candidate-documents&path=${encodeURIComponent(
            resumeAttachment.path
          )}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => null);
        if (!ignore && res.ok && data?.url) {
          setResumeSignedUrl(data.url);
        }
      } catch {
        if (!ignore) {
          setResumeSignedUrl(null);
        }
      }
    };
    signResume();
    return () => {
      ignore = true;
    };
  }, [open, resumeAttachment?.path, refreshCounter]);

  if (!open || !candidate) return null;

  const stage = stages.find((item) => item.id === candidate.stage_id);
  const mailerlite = candidate.mailerlite;
  const breezy = candidate.breezy;
  const mailerliteFields = isRecord(mailerlite?.fields)
    ? (mailerlite?.fields as Record<string, unknown>)
    : null;
  const country = getCountryDisplay(
    candidate.country ??
      (mailerlite as { country?: string })?.country ??
      (mailerliteFields?.country as string | undefined) ??
      (mailerliteFields?.country_name as string | undefined)
  );
  const mailerliteDesired =
    (mailerliteFields?.position_or_department_desired as string | undefined) ??
    (mailerliteFields?.desired_position as string | undefined) ??
    (mailerliteFields?.preferred_role as string | undefined);
  const desiredPosition = candidate.desired_position ?? mailerliteDesired ?? "—";
  const resumeMime = resumeAttachment?.mime ?? "";
  const resumeUrl = resumeAttachment?.url ?? resumeSignedUrl ?? "";
  const isResumePdf =
    resumeMime.includes("pdf") || resumeUrl.includes("application/pdf");
  const isResumeImage = resumeMime.startsWith("image/");
  const scorecardEntries = scorecardDraft.entries ?? {};
  const isTranscriptSource =
    (candidate.source ?? "").toLowerCase().includes("transcript") ||
    candidate.id.startsWith("intake-");
  const transcriptDetails = [
    { label: "Name", value: candidate.name },
    { label: "Email", value: candidate.email || "—" },
    { label: "Phone", value: candidate.phone ?? "—" },
    { label: "Desired Position", value: desiredPosition },
    { label: "Nationality", value: candidate.nationality ?? "—" },
    {
      label: "Current Country",
      value:
        country.label !== "—"
          ? `${country.flag ? `${country.flag} ` : ""}${country.label}`
          : "—",
    },
    { label: "Availability", value: candidate.availability ?? "—" },
    { label: "Salary Expectation", value: candidate.salary_expectation ?? "—" },
  ];
  const handleSaveSummary = () => {
    onUpdateCandidate(candidate.id, {
      experience_summary: summaryDraft.trim(),
    });
  };

  const normalizeTag = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9\- ]/g, "");

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.filter((item) => typeof item === "string" && item.trim())
    : [];

  const handleAddTag = () => {
    const next = normalizeTag(tagDraft);
    if (!next) return;
    const exists = tags.some((tag) => tag.toLowerCase() === next);
    if (exists) {
      setTagDraft("");
      setShowTagInput(false);
      return;
    }
    onUpdateCandidate(candidate.id, { tags: [...tags, next] });
    setTagDraft("");
    setShowTagInput(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateCandidate(candidate.id, {
      tags: tags.filter((tag) => tag !== tagToRemove),
    });
  };

  const tasks = rawTasks;
  const openTaskCount = tasks.filter((task) => task.status !== "done").length;
  const hasExistingForm = formStatus === "pending" || formStatus === "submitted";
  const requestedFields = hasExistingForm
    ? FORM_FIELD_DEFINITIONS.filter((field) =>
        selectedFormFields.includes(field.key)
      )
    : FORM_FIELD_DEFINITIONS.filter((field) =>
        missingFieldKeys.includes(field.key)
      );

  const handleToggleTask = (taskId: string) => {
    onUpdateCandidate(candidate.id, {
      tasks: tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: task.status === "done" ? "open" : "done",
            }
          : task
      ),
    });
  };

  const handleRemoveTask = (taskId: string) => {
    onUpdateCandidate(candidate.id, {
      tasks: tasks.filter((task) => task.id !== taskId),
    });
  };

  const handleAddTask = () => {
    const next = taskDraft.trim();
    if (!next) return;
    onUpdateCandidate(candidate.id, {
      tasks: [
        ...tasks,
        {
          id: crypto.randomUUID(),
          title: next,
          status: "open",
          created_at: new Date().toISOString(),
        },
      ],
    });
    setTaskDraft("");
  };

  const toggleFormField = (key: string) => {
    if (formStatus) return;
    setIsFormSelectionDirty(true);
    setSelectedFormFields((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const handleCreateFormLink = async () => {
    const selected = selectedFormFields.filter((field) =>
      FORM_FIELD_KEYS.includes(field as (typeof FORM_FIELD_KEYS)[number])
    );
    if (selected.length === 0 || !candidate) return;
    setFormBusy(true);
    setFormError(null);
    setFormCopied(false);

    try {
      const response = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          candidateName: candidate.name,
          candidateEmail: candidate.email ?? null,
          fields: selected,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to create form link.");
      }

      const link = `${window.location.origin}/form/${data.token}`;
      setFormLink(link);
      setFormStatus("pending");
      setSelectedFormFields(selected);
      try {
        await navigator.clipboard.writeText(link);
        setFormCopied(true);
      } catch {
        setFormCopied(false);
      }

      const existingIds = new Set(tasks.map((task) => task.id));
      const newTasks = selected
        .filter((field) => !existingIds.has(`form_${field}`))
        .map((field) => {
          const label =
            FORM_FIELD_DEFINITIONS.find((item) => item.key === field)?.label ??
            `Collect ${field}`;
          return {
            id: `form_${field}`,
            title: label,
            status: "open" as const,
            created_at: new Date().toISOString(),
          };
        });

      if (newTasks.length > 0) {
        onUpdateCandidate(candidate.id, {
          tasks: [...tasks, ...newTasks],
        });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create link.");
    } finally {
      setFormBusy(false);
    }
  };

  const handleCreateCvLink = async () => {
    if (!candidate) return;
    setCvLoading(true);
    setCvError(null);
    setCvCopied(false);
    try {
      const response = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          candidateName: candidate.name,
          candidateEmail: candidate.email ?? null,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to create CV link.");
      }

      const link = `${window.location.origin}/cv/${data.token}`;
      setCvLink(link);
      setCvStatus("pending");
      setCvSubmittedAt(null);
      try {
        await navigator.clipboard.writeText(link);
        setCvCopied(true);
      } catch {
        setCvCopied(false);
      }
    } catch (err) {
      setCvError(err instanceof Error ? err.message : "Failed to create CV link.");
    } finally {
      setCvLoading(false);
    }
  };

  const handleSaveName = () => {
    const next = nameDraft.trim();
    if (!next) return;
    onUpdateCandidate(candidate.id, { name: next });
    setEditingName(false);
  };

  const handleResumeUpload = (file: File | null) => {
    if (!file) return;
    setResumeUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      const newAttachment = {
        id: crypto.randomUUID(),
        name: file.name,
        mime: file.type,
        url,
        kind: "resume" as const,
        created_at: new Date().toISOString(),
        created_by: "Team",
      };
      const rest = (candidate.attachments ?? []).filter(
        (item) => item.kind !== "resume"
      );
      onUpdateCandidate(candidate.id, {
        attachments: [newAttachment, ...rest],
      });
      setResumeUploading(false);
    };
    reader.onerror = () => {
      setResumeUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleResumeRemove = () => {
    const rest = (candidate.attachments ?? []).filter(
      (item) => item.kind !== "resume"
    );
    onUpdateCandidate(candidate.id, { attachments: rest });
  };

  const handleScorecardThoughtsChange = (value: string) => {
    setScorecardDraft((prev) => ({
      ...prev,
      thoughts: value,
    }));
  };

  const handleScorecardOverallChange = (value: number) => {
    setScorecardDraft((prev) => ({
      ...prev,
      overall_rating: value,
    }));
  };

  const handleScorecardEntryChange = (
    key: string,
    updates: { rating?: number | null; notes?: string }
  ) => {
    setScorecardDraft((prev) => ({
      ...prev,
      entries: {
        ...(prev.entries ?? {}),
        [key]: {
          ...(prev.entries?.[key] ?? {}),
          ...updates,
        },
      },
    }));
  };

  const handleScorecardReset = () => {
    setScorecardDraft(buildScorecardDraft());
  };

  const handleScorecardSave = () => {
    onUpdateCandidate(candidate.id, { scorecard: scorecardDraft });
  };

  const renderScorecardRating = (
    value: number | null | undefined,
    onChange: (next: number) => void,
    withLabels = false
  ) => (
    <div className="flex w-full overflow-hidden rounded-md border border-slate-200 bg-white">
      {scorecardScale.map((option) => {
        const isActive = value === option.value;
        const tone =
          option.value <= 1
            ? "text-red-600"
            : option.value >= 3
            ? "text-emerald-600"
            : "text-slate-600";
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex flex-1 items-center justify-center gap-2 border-r border-slate-200 px-2 py-2 text-[11px] font-semibold transition last:border-r-0 ${
              isActive
                ? option.value <= 1
                  ? "bg-red-100"
                  : option.value >= 3
                  ? "bg-emerald-100"
                  : "bg-slate-200"
                : "bg-white hover:bg-slate-50"
            } ${tone}`}
          >
            <span className="text-xs">{option.icon}</span>
            {withLabels && option.label ? (
              <span className="hidden sm:inline">{option.label}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const handleSaveAll = () => {
    if (saving) return;
    setSaving(true);
    saveTimerRef.current = window.setTimeout(() => {
      setSaving(false);
      onClose();
    }, 800);
  };

  const handleAddWork = (event: FormEvent) => {
    event.preventDefault();
    if (!workRole.trim() || !workCompany.trim()) return;
    if (editingWorkId) {
      const updated = (candidate.work_history ?? []).map((item) =>
        item.id === editingWorkId
          ? {
              ...item,
              role: workRole.trim(),
              company: workCompany.trim(),
              start: workStart.trim() || undefined,
              end: workEnd.trim() || undefined,
              details: workDetails.trim() || undefined,
            }
          : item
      );
      onUpdateCandidate(candidate.id, { work_history: updated });
    } else {
      const entry: WorkHistoryItem = {
        id: crypto.randomUUID(),
        role: workRole.trim(),
        company: workCompany.trim(),
        start: workStart.trim() || undefined,
        end: workEnd.trim() || undefined,
        details: workDetails.trim() || undefined,
      };
      onUpdateCandidate(candidate.id, {
        work_history: [...(candidate.work_history ?? []), entry],
      });
    }
    setWorkRole("");
    setWorkCompany("");
    setWorkStart("");
    setWorkEnd("");
    setWorkDetails("");
    setEditingWorkId(null);
    setShowWorkForm(false);
  };

  const handleAddEducation = (event: FormEvent) => {
    event.preventDefault();
    if (!eduProgram.trim() || !eduInstitution.trim()) return;
    if (editingEducationId) {
      const updated = (candidate.education ?? []).map((item) =>
        item.id === editingEducationId
          ? {
              ...item,
              program: eduProgram.trim(),
              institution: eduInstitution.trim(),
              start: eduStart.trim() || undefined,
              end: eduEnd.trim() || undefined,
              details: eduDetails.trim() || undefined,
            }
          : item
      );
      onUpdateCandidate(candidate.id, { education: updated });
    } else {
      const entry: EducationItem = {
        id: crypto.randomUUID(),
        program: eduProgram.trim(),
        institution: eduInstitution.trim(),
        start: eduStart.trim() || undefined,
        end: eduEnd.trim() || undefined,
        details: eduDetails.trim() || undefined,
      };
      onUpdateCandidate(candidate.id, {
        education: [...(candidate.education ?? []), entry],
      });
    }
    setEduProgram("");
    setEduInstitution("");
    setEduStart("");
    setEduEnd("");
    setEduDetails("");
    setEditingEducationId(null);
    setShowEducationForm(false);
  };
  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="relative flex h-[92vh] w-[95vw] max-w-[1800px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${getAvatarClass(
                  candidate.name
                )}`}
              >
                {initials(candidate.name)}
              </div>
              <div className="flex flex-col gap-1">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="h-8 w-[220px] rounded-md border border-slate-200 px-2 text-sm"
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                    />
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
                      onClick={handleSaveName}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500"
                      onClick={() => {
                        setEditingName(false);
                        setNameDraft(candidate.name);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-900">
                      {candidate.name}
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      {candidate.status}
                    </span>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500"
                      onClick={() => setEditingName(true)}
                    >
                      Edit
                    </button>
                  </div>
                )}
                <div className="text-xs text-slate-500">{candidate.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  void handleCopyShareLink();
                }}
              >
                {shareCopied ? "Link copied" : "Copy link"}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                onClick={handleRefresh}
                disabled={
                  refreshing ||
                  timelineLoading ||
                  formLoading ||
                  cvLoading ||
                  snapshotLoading
                }
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                {refreshing ? "Refreshing" : "Refresh"}
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white hover:bg-black/90"
                onClick={onClose}
                aria-label="Close"
              >
                <span className="text-base leading-none">×</span>
              </button>
            </div>
          </div>

          <div className="grid h-full min-h-0 flex-1 grid-cols-[2.2fr_1.3fr_0.9fr] overflow-hidden">
          <section className="flex h-full min-h-0 flex-col border-r border-slate-200 px-6 py-4">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {[
                { id: "experience", label: "Experience" },
                { id: "resume", label: "Resume / CV" },
                { id: "documents", label: "Documents" },
                { id: "questionnaires", label: "Questionnaires" },
                { id: "more", label: "More" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLeftTab(tab.id as typeof leftTab)}
                  className={`border-b-2 pb-2 text-xs ${
                    leftTab === tab.id
                      ? "border-emerald-500 font-semibold text-slate-900"
                      : "border-transparent hover:text-slate-800"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {tab.label}
                    {tab.id === "documents" && documentAttachments.length > 0 ? (
                      <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {documentAttachments.length}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative mt-4 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div
                className={`flex h-full flex-col ${
                  leftTab === "resume"
                    ? "gap-4 overflow-hidden"
                    : "gap-6 overflow-y-auto"
                } p-6 text-sm text-slate-600`}
              >
                {leftTab === "experience" ? (
                  <>
                    {candidate.ai_summary_markdown ? (
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                        <div className="text-[11px] font-semibold uppercase text-slate-500">
                          AI Summary
                        </div>
                        <Markdown
                          content={candidate.ai_summary_markdown}
                          className="mt-2 text-sm text-slate-700"
                        />
                      </div>
                    ) : null}

                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        Summary
                      </div>
                      <textarea
                        className="mt-2 min-h-[90px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs"
                        placeholder="Add a short summary..."
                        value={summaryDraft}
                        onChange={(event) => setSummaryDraft(event.target.value)}
                      />
                      <button
                        type="button"
                        className="mt-2 rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600"
                        onClick={handleSaveSummary}
                      >
                        Save summary
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
                        <div className="text-xs font-semibold uppercase text-emerald-700">
                          Top Strengths
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-emerald-800">
                          {topStrengths.length > 0 ? (
                            topStrengths.map((item, idx) => (
                              <li key={`strength-${idx}`}>{item}</li>
                            ))
                          ) : (
                            <li>—</li>
                          )}
                        </ul>
                      </div>
                      <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-3">
                        <div className="text-xs font-semibold uppercase text-rose-700">
                          Top Concerns
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-rose-800">
                          {topConcerns.length > 0 ? (
                            topConcerns.map((item, idx) => (
                              <li key={`concern-${idx}`}>{item}</li>
                            ))
                          ) : (
                            <li>—</li>
                          )}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        Work History
                      </div>
                      <div className="mt-2 space-y-3">
                        {(candidate.work_history ?? []).length === 0 ? (
                          <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                            No work history yet.
                          </div>
                        ) : (
                          candidate.work_history?.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-slate-800">
                                    {item.role}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {item.company}{" "}
                                    {item.start || item.end
                                      ? `• ${item.start ?? ""} ${item.end ? `- ${item.end}` : ""}`
                                      : ""}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-500"
                                  onClick={() => {
                                    setShowWorkForm(true);
                                    setEditingWorkId(item.id);
                                    setWorkRole(item.role);
                                    setWorkCompany(item.company);
                                    setWorkStart(item.start ?? "");
                                    setWorkEnd(item.end ?? "");
                                    setWorkDetails(item.details ?? "");
                                  }}
                                >
                                  Edit
                                </button>
                              </div>
                              {item.details ? (
                                <div className="mt-2 text-xs text-slate-600">
                                  {item.details}
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600"
                          onClick={() => {
                            setShowWorkForm((prev) => !prev);
                            if (showWorkForm) {
                              setEditingWorkId(null);
                              setWorkRole("");
                              setWorkCompany("");
                              setWorkStart("");
                              setWorkEnd("");
                              setWorkDetails("");
                            }
                          }}
                        >
                          {(candidate.work_history ?? []).length > 0
                            ? showWorkForm
                              ? "Close editor"
                              : "Add / edit work history"
                            : showWorkForm
                            ? "Close editor"
                            : "Add work history"}
                        </button>
                        {editingWorkId ? (
                          <span className="text-xs text-slate-400">
                            Editing current entry
                          </span>
                        ) : null}
                      </div>
                      {showWorkForm ? (
                        <form onSubmit={handleAddWork} className="mt-3 grid gap-2">
                          <input
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
                            placeholder="Role"
                            value={workRole}
                            onChange={(event) => setWorkRole(event.target.value)}
                          />
                          <input
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
                            placeholder="Company"
                            value={workCompany}
                            onChange={(event) => setWorkCompany(event.target.value)}
                          />
                          <div className="flex gap-2">
                            <input
                              className="h-9 flex-1 rounded-md border border-slate-200 px-3 text-xs"
                              placeholder="Start (e.g. Sep 2021)"
                              value={workStart}
                              onChange={(event) => setWorkStart(event.target.value)}
                            />
                            <input
                              className="h-9 flex-1 rounded-md border border-slate-200 px-3 text-xs"
                              placeholder="End"
                              value={workEnd}
                              onChange={(event) => setWorkEnd(event.target.value)}
                            />
                          </div>
                          <textarea
                            className="min-h-[70px] rounded-md border border-slate-200 px-3 py-2 text-xs"
                            placeholder="Details"
                            value={workDetails}
                            onChange={(event) => setWorkDetails(event.target.value)}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600"
                            >
                              {editingWorkId ? "Save work history" : "Add work history"}
                            </button>
                            {editingWorkId ? (
                              <button
                                type="button"
                                className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-500"
                                onClick={() => {
                                  setEditingWorkId(null);
                                  setWorkRole("");
                                  setWorkCompany("");
                                  setWorkStart("");
                                  setWorkEnd("");
                                  setWorkDetails("");
                                }}
                              >
                                Cancel edit
                              </button>
                            ) : null}
                          </div>
                        </form>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        Education
                      </div>
                      <div className="mt-2 space-y-3">
                        {(candidate.education ?? []).length === 0 ? (
                          <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                            No education yet.
                          </div>
                        ) : (
                          candidate.education?.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-slate-800">
                                    {item.program}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {item.institution}{" "}
                                    {item.start || item.end
                                      ? `• ${item.start ?? ""} ${item.end ? `- ${item.end}` : ""}`
                                      : ""}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-500"
                                  onClick={() => {
                                    setShowEducationForm(true);
                                    setEditingEducationId(item.id);
                                    setEduProgram(item.program);
                                    setEduInstitution(item.institution);
                                    setEduStart(item.start ?? "");
                                    setEduEnd(item.end ?? "");
                                    setEduDetails(item.details ?? "");
                                  }}
                                >
                                  Edit
                                </button>
                              </div>
                              {item.details ? (
                                <div className="mt-2 text-xs text-slate-600">
                                  {item.details}
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600"
                          onClick={() => {
                            setShowEducationForm((prev) => !prev);
                            if (showEducationForm) {
                              setEditingEducationId(null);
                              setEduProgram("");
                              setEduInstitution("");
                              setEduStart("");
                              setEduEnd("");
                              setEduDetails("");
                            }
                          }}
                        >
                          {(candidate.education ?? []).length > 0
                            ? showEducationForm
                              ? "Close editor"
                              : "Add / edit education"
                            : showEducationForm
                            ? "Close editor"
                            : "Add education"}
                        </button>
                        {editingEducationId ? (
                          <span className="text-xs text-slate-400">
                            Editing current entry
                          </span>
                        ) : null}
                      </div>
                      {showEducationForm ? (
                        <form onSubmit={handleAddEducation} className="mt-3 grid gap-2">
                          <input
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
                            placeholder="Program / Degree"
                            value={eduProgram}
                            onChange={(event) => setEduProgram(event.target.value)}
                          />
                          <input
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
                            placeholder="Institution"
                            value={eduInstitution}
                            onChange={(event) => setEduInstitution(event.target.value)}
                          />
                          <div className="flex gap-2">
                            <input
                              className="h-9 flex-1 rounded-md border border-slate-200 px-3 text-xs"
                              placeholder="Start"
                              value={eduStart}
                              onChange={(event) => setEduStart(event.target.value)}
                            />
                            <input
                              className="h-9 flex-1 rounded-md border border-slate-200 px-3 text-xs"
                              placeholder="End"
                              value={eduEnd}
                              onChange={(event) => setEduEnd(event.target.value)}
                            />
                          </div>
                          <textarea
                            className="min-h-[70px] rounded-md border border-slate-200 px-3 py-2 text-xs"
                            placeholder="Details"
                            value={eduDetails}
                            onChange={(event) => setEduDetails(event.target.value)}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600"
                            >
                              {editingEducationId ? "Save education" : "Add education"}
                            </button>
                            {editingEducationId ? (
                              <button
                                type="button"
                                className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-500"
                                onClick={() => {
                                  setEditingEducationId(null);
                                  setEduProgram("");
                                  setEduInstitution("");
                                  setEduStart("");
                                  setEduEnd("");
                                  setEduDetails("");
                                }}
                              >
                                Cancel edit
                              </button>
                            ) : null}
                          </div>
                        </form>
                      ) : null}
                    </div>
                  </>
                ) : leftTab === "resume" ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-800">
                        Resume / CV Preview
                      </div>
                      <div className="flex items-center gap-2">
                        {cvLink ? (
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(cvLink);
                                setCvCopied(true);
                              } catch {
                                setCvCopied(false);
                              }
                            }}
                          >
                            {cvCopied ? "Link copied" : "Copy CV link"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            onClick={handleCreateCvLink}
                            disabled={cvLoading}
                          >
                            {cvLoading ? "Creating..." : "Create CV link"}
                          </button>
                        )}
                        {resumeAttachment ? (
                          <button
                            type="button"
                            className="rounded-full border border-slate-900 px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                            onClick={handleResumeRemove}
                          >
                            Remove
                          </button>
                        ) : null}
                        <label className="cursor-pointer rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                          {resumeUploading ? "Uploading..." : "Upload file"}
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,image/*"
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              handleResumeUpload(file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>
                    {cvError ? (
                      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
                        {cvError}
                      </div>
                    ) : null}
                    {cvLink ? (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold">CV form link ready</div>
                          <div className="text-[10px] uppercase text-emerald-600">
                            Pending
                          </div>
                        </div>
                        <div className="mt-2 break-all text-[11px] text-emerald-800/80">
                          {cvLink}
                        </div>
                        <div className="mt-2 text-[10px] text-emerald-700/70">
                          Share this link with the candidate to build a CV.
                        </div>
                      </div>
                    ) : cvStatus === "submitted" ? (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                        <div className="font-semibold">CV submitted</div>
                        <div className="mt-1 text-[10px] text-emerald-700/70">
                          {cvSubmittedAt
                            ? `Submitted ${formatTimestamp(cvSubmittedAt)}`
                            : "The CV has been generated."}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 flex min-h-0 flex-1">
                      <div className="flex h-full w-full overflow-hidden rounded-lg border border-dashed border-slate-200 bg-white">
                        {resumeUrl ? (
                          isResumePdf ? (
                            <iframe
                              title="Resume preview"
                              className="h-full w-full"
                              src={`${resumeUrl}#zoom=page-width`}
                            />
                          ) : isResumeImage ? (
                            <img
                              src={resumeUrl}
                              alt={resumeAttachment?.name ?? "Resume"}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                              Preview not available.
                            </div>
                          )
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                            Upload a PDF or image to preview here.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : leftTab === "documents" ? (
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-800">
                        Documents
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                        {documentUploading ? "Uploading..." : "Add document"}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,image/*,video/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            void handleDocumentUpload(file);
                            event.currentTarget.value = "";
                          }}
                          disabled={documentUploading}
                        />
                      </label>
                    </div>
                    {documentUploading ? (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate font-semibold">
                            Uploading {documentUploadName ?? "file"}...
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                            <span>In progress</span>
                          </div>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
                          <div className="h-full w-2/5 animate-pulse rounded-full bg-emerald-400" />
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 flex-1 overflow-y-auto">
                      {documentAttachments.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
                          No documents uploaded yet.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {documentEntries.map(({ doc, path }) => {
                            const signedUrl = path ? signedDocUrls[path] : undefined;
                            const fallbackUrl = doc.url ?? undefined;
                            const docUrl = signedUrl ?? fallbackUrl;
                            const canOpen = Boolean(path || docUrl);
                            const isActive = activeDocumentId === doc.id;
                            const displayTimestamp = formatTimestamp(
                              resolveAttachmentTimestamp(
                                doc.created_at,
                                path,
                                doc.url
                              )
                            );
                            const displayBy =
                              doc.created_by && doc.created_by !== "Candidate"
                                ? doc.created_by
                                : candidate.name ?? doc.created_by ?? "Unknown";
                            const extension = getExtension(doc.name, doc.mime);
                            const icon = getFileIcon(extension);
                            return (
                              <div
                                key={doc.id}
                                role="button"
                                tabIndex={canOpen ? 0 : -1}
                                aria-disabled={!canOpen}
                                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                                  !canOpen
                                    ? "cursor-not-allowed border-slate-200 bg-white text-slate-300"
                                    : isActive
                                    ? "cursor-pointer border-emerald-300 bg-emerald-50 text-slate-800"
                                    : "cursor-pointer border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-slate-800"
                                }`}
                                onClick={(event) => {
                                  event.preventDefault();
                                  if (!canOpen) return;
                                  void handleSelectDocument(
                                    doc.id,
                                    doc.name ?? null,
                                    doc.mime ?? null,
                                    path,
                                    fallbackUrl ?? null
                                  );
                                }}
                                onKeyDown={(event) => {
                                  if (!canOpen) return;
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    void handleSelectDocument(
                                      doc.id,
                                      doc.name ?? null,
                                      doc.mime ?? null,
                                      path,
                                      fallbackUrl ?? null
                                    );
                                  }
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center">
                                    <Image
                                      src={icon}
                                      alt={`${extension.toUpperCase()} file`}
                                      className="h-9 w-9"
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">
                                      {doc.name ?? "Document"}
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-400">
                                      Added {displayTimestamp} • {displayBy}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={!canOpen}
                                  className={`ml-3 rounded-full px-3 py-1 text-[11px] font-semibold ${
                                    !canOpen
                                      ? "bg-slate-200 text-slate-500"
                                      : "bg-slate-900 text-white hover:bg-black"
                                  }`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!canOpen) return;
                                    void handleSelectDocument(
                                      doc.id,
                                      doc.name ?? null,
                                      doc.mime ?? null,
                                      path,
                                      fallbackUrl ?? null
                                    );
                                  }}
                                >
                                  {signingDocId === doc.id ? "Opening..." : "Open"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {documentUploadError ? (
                      <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
                        {documentUploadError}
                      </div>
                    ) : null}
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-400">
                      Click a document to preview in a popup window.
                    </div>
                  </div>
                ) : leftTab === "questionnaires" ? (
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-800">
                        Questionnaires
                      </div>
                      <button
                        type="button"
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                        onClick={() => setIsQuestionnaireModalOpen(true)}
                      >
                        Send questionnaire
                      </button>
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
                      {sentQuestionnairesSorted.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-slate-400">
                          No questionnaires sent yet.
                        </div>
                      ) : (
                        sentQuestionnairesSorted.map((item, index) => (
                          <div
                            key={`${item.id}-${item.sent_at}-${index}`}
                            className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm last:border-b-0"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                <Send className="h-4 w-4" />
                              </span>
                              <div>
                                <div className="font-semibold text-slate-900">
                                  {item.name}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Sent {formatTimestamp(item.sent_at)}
                                  {item.sent_by ? ` by ${item.sent_by}` : ""}
                                </div>
                              </div>
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
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
                      Choose a questionnaire to send to this candidate.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-slate-800">
                      Content
                    </div>
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
                      Content placeholder.
                    </div>
                    <div className="space-y-2 text-xs text-slate-500">
                      <div>Position: {candidate.source ?? "Candidate"}</div>
                      <div>Email: {candidate.email}</div>
                      <div>Phone: {candidate.phone ?? "—"}</div>
                    </div>
                  </>
                )}
              </div>
              {leftTab === "experience" ? (
                <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex flex-col items-end gap-3">
                  {aiChatOpen ? (
                    <div
                      className="pointer-events-auto w-[320px] overflow-hidden rounded-2xl border border-slate-800 bg-[#0b0b0c] text-slate-100 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.65)]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                        <div className="text-sm font-semibold">AI Assistant</div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Not saved</span>
                    <button
                      type="button"
                      className="rounded-full border border-white/10 p-2 text-slate-300 hover:bg-white/10"
                      onClick={() => setAiChatOpen(false)}
                      aria-label="Collapse"
                      title="Collapse"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  </div>
                      </div>
                      <div
                        ref={aiChatScrollRef}
                        className="hide-scrollbar max-h-[280px] space-y-2 overflow-y-auto px-4 py-3 text-xs"
                      >
                        {aiChatMessages.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-slate-400">
                            Ask about concerns, gaps, strengths, or anything in the
                            transcript or summary.
                          </div>
                        ) : (
                          aiChatMessages.map((message, index) => (
                            <div
                              key={`${message.role}-${index}`}
                              className={`rounded-xl px-3 py-2 ${
                                message.role === "user"
                                  ? "bg-emerald-500/15 text-emerald-100"
                                  : "bg-white/5 text-slate-100"
                              }`}
                            >
                              <div className="text-[10px] font-semibold uppercase text-slate-400">
                                {message.role === "user" ? "You" : "AI"}
                              </div>
                              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-100">
                                {message.content}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      {aiChatError ? (
                        <div className="px-4 pb-2 text-xs text-rose-300">
                          {aiChatError}
                        </div>
                      ) : null}
                      <div className="border-t border-white/10 px-4 py-3">
                        <textarea
                          className="min-h-[68px] w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                          placeholder="Ask something about the candidate..."
                          value={aiChatInput}
                          onChange={(event) => setAiChatInput(event.target.value)}
                        />
                        <div className="mt-3 flex items-center justify-between">
                          <button
                            type="button"
                            className="text-[11px] text-slate-400 hover:text-slate-200"
                            onClick={() => setAiChatMessages([])}
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            className="rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
                            onClick={handleAskAi}
                            disabled={aiChatLoading || !aiChatInput.trim()}
                          >
                            {aiChatLoading ? "Asking..." : "Ask AI"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/90 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.7)] transition hover:-translate-y-0.5 hover:bg-black"
                    onClick={(event) => {
                      event.stopPropagation();
                      setAiChatOpen((prev) => !prev);
                    }}
                    aria-label="Open AI chat"
                  >
                    <Image
                      src={aiSearchIcon}
                      alt="AI"
                      className="h-8 w-8"
                    />
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="flex h-full min-h-0 flex-col border-r border-slate-200 px-5 py-4">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {[
                { id: "discussion", label: "Discussion" },
                { id: "email", label: "Email" },
                {
                  id: "meetings",
                  label: "Meetings",
                  badge: candidate.meeting_link ? "Awaiting" : null,
                },
                { id: "scorecards", label: "Scorecards" },
                { id: "tasks", label: "Tasks", count: openTaskCount },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRightTab(tab.id as RightTab)}
                  className={`border-b-2 pb-2 text-xs ${
                    rightTab === tab.id
                      ? "border-emerald-500 font-semibold text-slate-900"
                      : "border-transparent hover:text-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {tab.label}
                    {"badge" in tab && tab.badge ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        {tab.badge}
                      </span>
                    ) : null}
                    {tab.id === "tasks" && tab.count && tab.count > 0 ? (
                      <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {tab.count}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
            <div
              ref={discussionScrollRef}
              className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 hide-scrollbar"
              style={{
                backgroundImage: `url(${chatBackground.src})`,
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            >
              {rightTab === "discussion" ? (
                <>
                  <div className="mt-3 space-y-3">
                    {timelineLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div
                            key={index}
                            className="h-12 w-full animate-pulse rounded-2xl border border-slate-200 bg-white/80"
                          />
                        ))}
                      </div>
                    ) : null}
                    {timelineError ? (
                      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                        {timelineError}
                      </div>
                    ) : null}
                    {activity.length === 0 && notes.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                        No team activity yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {[...activity, ...notes]
                          .sort(
                            (a, b) =>
                              new Date(a.created_at).getTime() -
                              new Date(b.created_at).getTime()
                          )
                          .map((item) => {
                            const isActivity = "type" in item;
                            const isSystemEvent =
                              isActivity && item.type !== "note";
                            const label = isActivity
                              ? item.type === "move"
                                ? "Stage update"
                                : item.type === "note"
                                ? "Note"
                                : "System"
                              : "Note";
                            const author =
                              "author_name" in item
                                ? (item.author_name as string | undefined) ??
                                  (item.author_email as string | undefined)
                                : undefined;
                            const authorEmail =
                              "author_email" in item
                                ? (item.author_email as string | undefined)
                                : undefined;
                            const authorId =
                              "author_id" in item
                                ? (item.author_id as string | undefined)
                                : undefined;
                            const currentEmail = currentUser?.email?.toLowerCase();
                            const isMine =
                              (!!currentUser?.id && authorId === currentUser.id) ||
                              (!!currentEmail &&
                                typeof authorEmail === "string" &&
                                authorEmail.toLowerCase() === currentEmail) ||
                              (!!currentUser?.name &&
                                typeof author === "string" &&
                                author.toLowerCase() ===
                                  currentUser.name.toLowerCase());
                            const avatarLabel =
                              author ??
                              (isMine ? currentUser?.name ?? "Me" : "User");
                            const avatarUrl = resolveAvatar(
                              authorId,
                              authorEmail,
                              isMine
                            );
                            const isAutoCanceled =
                              isSystemEvent &&
                              typeof item.body === "string" &&
                              item.body.startsWith("Auto-canceled");
                            const bubbleClass = isSystemEvent
                              ? isAutoCanceled
                                ? "border border-rose-200 bg-rose-50 text-rose-900"
                                : "border border-slate-900 bg-slate-900 text-white"
                              : isMine
                              ? "bg-emerald-100 text-emerald-900"
                              : "border border-slate-200 bg-white text-slate-800";
                            const metaClass = isSystemEvent
                              ? isAutoCanceled
                                ? "text-rose-700/70"
                                : "text-white/70"
                              : isMine
                              ? "text-emerald-700/70"
                              : "text-slate-400";
                            const isMeetingSystem =
                              isSystemEvent &&
                              typeof item.body === "string" &&
                              (item.body.startsWith(
                                "Scheduled a Google Meet interview"
                              ) ||
                                item.body.startsWith(
                                  "Canceled the scheduled interview"
                                ));
                            const isLegacyMeetingMessage =
                              isMeetingSystem &&
                              typeof item.body === "string" &&
                              !item.body.includes("•");
                            let meetingMeta = "";
                            if (candidate?.meeting_start) {
                              const startLabel = formatTimestamp(
                                candidate.meeting_start
                              );
                              let durationLabel = "";
                              if (candidate.meeting_end) {
                                const start = new Date(candidate.meeting_start);
                                const end = new Date(candidate.meeting_end);
                                const diffMinutes = Math.max(
                                  1,
                                  Math.round(
                                    (end.getTime() - start.getTime()) / 60000
                                  )
                                );
                                durationLabel = `${diffMinutes} min`;
                              }
                              meetingMeta = [startLabel, durationLabel]
                                .filter(Boolean)
                                .join(" • ");
                            }
                            return (
                              <div
                                key={item.id}
                                className={`flex items-end gap-2 ${
                                  isMine ? "justify-end" : "justify-start"
                                }`}
                              >
                                {!isMine ? (
                                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-100 text-[10px] font-semibold text-slate-600">
                                    {avatarUrl ? (
                                      <img
                                        src={avatarUrl}
                                        alt={avatarLabel}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      initials(avatarLabel)
                                    )}
                                  </div>
                                ) : null}
                                <div
                                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-xs shadow-sm ${bubbleClass}`}
                                >
                                  <div
                                    className={`flex items-center gap-2 text-[10px] ${metaClass}`}
                                  >
                                    <span>
                                      {label}
                                      {author ? ` • ${author}` : ""}
                                    </span>
                                    <span className="ml-auto">
                                      {formatDate(item.created_at)}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-sm">
                                    {isMeetingSystem &&
                                    typeof item.body === "string" &&
                                    item.body.includes("•") ? (
                                      (() => {
                                        const dividerIndex = item.body.indexOf("•");
                                        const prefix = item.body.slice(0, dividerIndex).trim();
                                        const suffix = item.body
                                          .slice(dividerIndex + 1)
                                          .trim();
                                        return (
                                          <span>
                                            {prefix}
                                            <span className="mt-1 block">
                                              <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[13px] text-slate-900">
                                                {suffix}
                                              </span>
                                            </span>
                                          </span>
                                        );
                                      })()
                                    ) : (
                                      renderMentionedBody(
                                        item.body,
                                        mentionLabels,
                                        isMine && !isSystemEvent
                                      )
                                    )}
                                  </div>
                                  {isLegacyMeetingMessage && meetingMeta ? (
                                    <div className={`mt-1 text-[11px] ${metaClass}`}>
                                      Meeting: {meetingMeta}
                                    </div>
                                  ) : null}
                                </div>
                                {isMine ? (
                                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-900 text-[10px] font-semibold text-white">
                                    {avatarUrl ? (
                                      <img
                                        src={avatarUrl}
                                        alt={avatarLabel}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      initials(avatarLabel)
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </>
              ) : rightTab === "meetings" ? (
                <div className="flex h-full flex-col gap-4">
                  {candidate.meeting_link ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        Upcoming interview
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {candidate.meeting_start
                          ? `Starts ${formatTimestamp(candidate.meeting_start)}`
                          : "Meeting scheduled"}
                      </div>
                      {candidate.meeting_interviewers ? (
                        <div className="mt-1 text-xs text-slate-500">
                          With {candidate.meeting_interviewers}
                        </div>
                      ) : null}
                      {candidate.meeting_rsvp_status ? (
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <span className="text-[11px] uppercase text-slate-400">
                            RSVP
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              candidate.meeting_rsvp_status === "accepted"
                                ? "bg-emerald-100 text-emerald-700"
                                : candidate.meeting_rsvp_status === "declined"
                                ? "bg-rose-100 text-rose-700"
                                : candidate.meeting_rsvp_status === "tentative"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {candidate.meeting_rsvp_status === "accepted"
                              ? "Confirmed"
                              : candidate.meeting_rsvp_status === "declined"
                              ? "Declined"
                              : candidate.meeting_rsvp_status === "tentative"
                              ? "Maybe"
                              : "Awaiting"}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-3 flex items-center gap-2">
                        <a
                          className="rounded-md bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600"
                          href={candidate.meeting_link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Join Google Meet
                        </a>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              candidate.meeting_link ?? ""
                            );
                          }}
                        >
                          Copy link
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-rose-200 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50"
                          onClick={handleCancelMeeting}
                        >
                          Cancel meeting
                        </button>
                      </div>
                      {meetingArtifactsError ? (
                        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                          {meetingArtifactsError}
                        </div>
                      ) : null}
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                          <div className="text-[11px] font-semibold uppercase text-slate-500">
                            Recording
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">
                            {candidate.meeting_recording_url ? "Ready" : "Pending"}
                          </div>
                          {candidate.meeting_recording_url ? (
                            <a
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700"
                              href={candidate.meeting_recording_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open recording
                            </a>
                          ) : (
                            <div className="mt-2 text-[11px] text-slate-400">
                              {candidate.meeting_recording_state
                                ? `Status: ${candidate.meeting_recording_state}`
                                : "No recording yet."}
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                          <div className="text-[11px] font-semibold uppercase text-slate-500">
                            Transcript
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">
                            {candidate.meeting_transcript_url ? "Ready" : "Pending"}
                          </div>
                          {candidate.meeting_transcript_url ? (
                            <a
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700"
                              href={candidate.meeting_transcript_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open transcript
                            </a>
                          ) : (
                            <div className="mt-2 text-[11px] text-slate-400">
                              {candidate.meeting_transcript_state
                                ? `Status: ${candidate.meeting_transcript_state}`
                                : "No transcript yet."}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                          onClick={() => syncMeetingArtifacts()}
                          disabled={meetingArtifactsLoading}
                        >
                          {meetingArtifactsLoading ? "Syncing..." : "Sync artifacts"}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                          onClick={() => syncMeetingRsvp()}
                          disabled={meetingRsvpLoading}
                        >
                          {meetingRsvpLoading ? "Syncing RSVP..." : "Sync RSVP"}
                        </button>
                        {candidate.meeting_transcript_excerpt &&
                        !candidate.meeting_transcript_summary ? (
                          <button
                            type="button"
                            className="rounded-md border border-emerald-200 px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                            onClick={() =>
                              syncMeetingArtifacts({ generateSummary: true })
                            }
                            disabled={meetingArtifactsLoading}
                          >
                            Generate summary
                          </button>
                        ) : null}
                      </div>
                      {candidate.meeting_transcript_summary ? (
                        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
                          <div className="text-[11px] font-semibold uppercase text-emerald-700">
                            Summary
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-emerald-900">
                            {candidate.meeting_transcript_summary}
                          </div>
                        </div>
                      ) : null}
                      {meetingRsvpError ? (
                        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                          {meetingRsvpError}
                        </div>
                      ) : null}
                      {candidate.meeting_transcript_excerpt ? (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                          <div className="text-[11px] font-semibold uppercase text-slate-500">
                            Transcript preview
                          </div>
                          <div className="mt-2 line-clamp-4 text-sm text-slate-700">
                            {candidate.meeting_transcript_excerpt}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-500">
                        📅
                      </div>
                      <div className="space-y-1">
                        <div className="text-lg font-semibold text-slate-800">
                          No meetings yet
                        </div>
                        <div className="text-sm text-slate-500">
                          There haven't been any meetings scheduled yet.
                        </div>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-600"
                    onClick={() => setShowMeetingModal(true)}
                  >
                    <span>📅</span>
                    Schedule Interview
                  </button>
                </div>
              ) : rightTab === "scorecards" ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">
                      Scorecard
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={handleScorecardReset}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600"
                        onClick={handleScorecardSave}
                      >
                        Save Scorecard
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="space-y-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          Thoughts on this Candidate?
                        </div>
                        <textarea
                          className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700"
                          rows={4}
                          value={scorecardDraft.thoughts ?? ""}
                          onChange={(event) =>
                            handleScorecardThoughtsChange(event.target.value)
                          }
                        />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          Overall Rating?
                        </div>
                        <div className="mt-2">
                          {renderScorecardRating(
                            scorecardDraft.overall_rating ?? null,
                            handleScorecardOverallChange,
                            true
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {scorecardSections.map((section) => (
                    <div key={section.title} className="space-y-3">
                      <div className="text-sm font-semibold uppercase text-slate-700">
                        {section.title}
                      </div>
                      <div className="space-y-3">
                        {section.items.map((item) => {
                          const entry = scorecardEntries[item.key] ?? {};
                          return (
                            <div
                              key={item.key}
                              className="rounded-xl border border-slate-200 bg-white p-4"
                            >
                              <div className="text-sm font-semibold text-slate-900">
                                {item.label}
                              </div>
                              <div className="mt-3">
                                {renderScorecardRating(
                                  entry.rating ?? null,
                                  (value) =>
                                    handleScorecardEntryChange(item.key, {
                                      rating: value,
                                    })
                                )}
                              </div>
                              <textarea
                                className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700"
                                rows={3}
                                value={entry.notes ?? ""}
                                onChange={(event) =>
                                  handleScorecardEntryChange(item.key, {
                                    notes: event.target.value,
                                  })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : rightTab === "tasks" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      Tasks
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                      onClick={handleAddTask}
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700"
                      placeholder="Add a task..."
                      value={taskDraft}
                      onChange={(event) => setTaskDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddTask();
                        }
                      }}
                    />
                  </div>
                  {tasks.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                      No tasks yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                        >
                          <button
                            type="button"
                            className="flex items-center gap-2 text-left"
                            onClick={() => handleToggleTask(task.id)}
                          >
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded border ${
                                task.status === "done"
                                  ? "border-emerald-400 bg-emerald-400 text-white"
                                  : "border-slate-300 text-transparent"
                              }`}
                            >
                              ✓
                            </span>
                            <span
                              className={
                                task.status === "done"
                                  ? "text-slate-400 line-through"
                                  : "text-slate-700"
                              }
                            >
                              {task.title}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="text-slate-400 hover:text-slate-600"
                            onClick={() => handleRemoveTask(task.id)}
                            aria-label="Remove task"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">
                      Request Missing Info
                    </div>
                    <div className="mt-3 space-y-2">
                      {requestedFields.length === 0 ? (
                        <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-3 text-center text-[11px] text-slate-400">
                          No fields selected yet.
                        </div>
                      ) : (
                        requestedFields.map((field) => {
                        const checked = selectedFormFields.includes(field.key);
                        return (
                          <label
                            key={field.key}
                            className="flex cursor-pointer items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded border ${
                                  checked
                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                    : "border-slate-300 text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                              <span className="text-xs text-slate-700">
                                {field.label}
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={checked}
                              onChange={() => toggleFormField(field.key)}
                              disabled={hasExistingForm || formLoading}
                            />
                          </label>
                        );
                      })
                      )}
                    </div>
                    {!hasExistingForm ? (
                      <button
                        type="button"
                        className="mt-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleCreateFormLink}
                        disabled={formBusy || selectedFormFields.length === 0}
                      >
                        {formBusy ? "Creating link..." : "Create form link"}
                      </button>
                    ) : null}
                    {formLink ? (
                      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
                        {formCopied ? "Link copied." : "Form link created."}{" "}
                        <span className="break-all">{formLink}</span>
                      </div>
                    ) : null}
                    {hasExistingForm && formStatus === "submitted" ? (
                      <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                        Form submitted. Updates will sync automatically.
                      </div>
                    ) : null}
                    {formError ? (
                      <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
                        {formError}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                  This section is coming soon.
                </div>
              )}
            </div>
            {rightTab === "discussion" ? (
              <div className="shrink-0 bg-white p-4">
                <AddNoteForm onAddNote={handleAddNote} teamUsers={teamUsers} />
              </div>
            ) : null}
          </section>

          <aside className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-2 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase">Stage</span>
                <select
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                  value={candidate.stage_id}
                  onChange={(event) => onStageChange(event.target.value)}
                >
                  {stages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase">Pipeline</span>
                <select
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                  value={candidate.pipeline_id}
                  onChange={(event) => onPipelineChange(event.target.value)}
                >
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase">Country</span>
                <span>
                  {country.label !== "—"
                    ? `${country.flag ? `${country.flag} ` : ""}${country.label}`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase">Status</span>
                <span className="capitalize">{candidate.status}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase">Created</span>
                <span>{formatDate(candidate.created_at)}</span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-900 bg-slate-950 px-4 py-3 text-xs text-slate-100">
              <div className="font-semibold uppercase text-slate-300">Details</div>
              <div className="mt-2 space-y-1 text-slate-100">
                <div>Desired position: {desiredPosition}</div>
                <div>Email: {candidate.email ?? "—"}</div>
                <div>Phone: {candidate.phone ?? "—"}</div>
                <div>
                  Country:{" "}
                  {country.label !== "—"
                    ? `${country.flag ? `${country.flag} ` : ""}${country.label}`
                    : "—"}
                </div>
                <div>Source: {candidate.source ?? "—"}</div>
                <div>Stage: {stage?.name ?? "—"}</div>
                {breezy?.desired_salary ? (
                  <div>Desired salary: {breezy.desired_salary}</div>
                ) : null}
                {breezy?.match_score ? (
                  <div>Match score: {breezy.match_score}</div>
                ) : null}
                {breezy?.score ? <div>Score: {breezy.score}</div> : null}
                {breezy?.address ? <div>Address: {breezy.address}</div> : null}
                {breezy?.sourced_by ? (
                  <div>Sourced by: {breezy.sourced_by}</div>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <div className="font-semibold uppercase text-slate-500">
                {mailerlite && isRecord(mailerlite)
                  ? "Subscriber Details"
                  : "Transcript Details"}
              </div>
              {mailerlite && isRecord(mailerlite) ? (
                <div className="mt-3 space-y-3">
                  {[
                    "id",
                    "email",
                    "created_at",
                  ].map((key) =>
                    key in mailerlite ? (
                      <div
                        key={key}
                        className="grid grid-cols-[120px_1fr] gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="text-[11px] uppercase text-slate-400">
                          {formatKey(key)}
                        </div>
                        <div className="text-xs text-slate-700">
                          {formatValue(mailerlite[key])}
                        </div>
                      </div>
                    ) : null
                  )}

                  {Array.isArray(mailerlite.groups) ? (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase text-slate-400">
                        Groups
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {mailerlite.groups.length > 0 ? (
                          mailerlite.groups.map((group, index) => (
                            <span
                              key={`${(group as { id?: string }).id ?? index}`}
                              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]"
                            >
                              {formatValue(group)}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {mailerliteFields ? (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase text-slate-400">
                        Fields
                      </div>
                      <div className="space-y-2">
                        {Object.entries(mailerliteFields)
                          .filter(([key]) => {
                            const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
                            const blocked = new Set([
                              "city",
                              "phone",
                              "state",
                              "surname",
                              "company",
                              "zip",
                              "zipcode",
                              "postalcode",
                              "postcode",
                              "z_i_p".replace(/[^a-z0-9]/g, ""),
                            ]);
                            return !blocked.has(normalized);
                          })
                          .sort(([a], [b]) => {
                            const priority = [
                              "position_or_department_desired",
                              "desired_position",
                              "preferred_role",
                            ];
                            const ai = priority.indexOf(a);
                            const bi = priority.indexOf(b);
                            if (ai === -1 && bi === -1) return 0;
                            if (ai === -1) return 1;
                            if (bi === -1) return -1;
                            return ai - bi;
                          })
                          .map(([key, value]) => (
                            <div
                              key={key}
                              className="grid grid-cols-[120px_1fr] gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
                            >
                              <div className="text-[11px] uppercase text-slate-400">
                                {formatKey(key)}
                              </div>
                              <div className="text-xs text-slate-700">
                                {formatValue(value)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : isTranscriptSource ? (
                <div className="mt-3 space-y-2">
                  {transcriptDetails.map((item) => (
                    <div
                      key={item.label}
                      className="grid grid-cols-[120px_1fr] gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
                    >
                      <div className="text-[11px] uppercase text-slate-400">
                        {item.label}
                      </div>
                      <div className="text-xs text-slate-700">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : mailerliteLoading ? (
                <div className="mt-3 rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                  Loading MailerLite details…
                </div>
              ) : mailerliteError ? (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-600">
                  {mailerliteError}
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                  No details yet.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <div className="flex items-center justify-between font-semibold uppercase text-slate-500">
                <span>Tags</span>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-[14px] text-slate-500 hover:bg-slate-100"
                  onClick={() => setShowTagInput((prev) => !prev)}
                  aria-label="Add tag"
                >
                  +
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                    >
                      {tag}
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-600"
                        onClick={() => handleRemoveTag(tag)}
                        aria-label={`Remove ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">No tags yet.</span>
                )}
              </div>
              {showTagInput ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className="h-9 w-44 rounded-md border border-slate-200 bg-white px-3 text-xs"
                    placeholder="Add tag..."
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="h-9 rounded-md border border-slate-200 px-3 text-xs text-slate-600"
                    onClick={handleAddTag}
                  >
                    Add
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
        <div className="flex items-center justify-end border-t border-slate-200 px-6 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:opacity-60"
            onClick={handleSaveAll}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
      {showMeetingModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowMeetingModal(false)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div className="space-y-1">
                <div className="text-2xl font-semibold text-slate-900">
                  Schedule Interviews
                </div>
                <div className="text-sm text-slate-500">
                  Plan, organize and schedule one or more interviews.{" "}
                  <button type="button" className="text-sky-500">
                    Learn More
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg text-slate-500 hover:bg-slate-50"
                onClick={() => setShowMeetingModal(false)}
              >
                ×
              </button>
            </div>
            <div className="space-y-4 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    Instant interview
                  </div>
                  <div className="text-xs text-slate-500">
                    Create a Google Meet link that starts now.
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  onClick={handleInstantMeeting}
                  disabled={meetingSubmitting}
                >
                  <Zap className="h-4 w-4" />
                  Start now
                </button>
              </div>
              {googleConnected === false ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span>Google account not connected.</span>
                  <a
                    className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                    href="/api/google/oauth/start?next=/pipeline"
                  >
                    Connect Google
                  </a>
                </div>
              ) : googleNeedsReconnect ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span>Google connection expired. Reconnect to schedule meetings.</span>
                  <a
                    className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                    href="/api/google/oauth/start?next=/pipeline"
                  >
                    Reconnect Google
                  </a>
                </div>
              ) : googleHasScopes === false ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span>Google is connected but missing Calendar permissions.</span>
                  <a
                    className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                    href="/api/google/oauth/start?next=/pipeline"
                  >
                    Reconnect Google
                  </a>
                </div>
              ) : googleConnected ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                  Google Calendar connected.
                </div>
              ) : null}
              {meetingError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
                  {meetingError}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <input
                  type="date"
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm"
                  value={meetingForm.date}
                  onChange={(event) =>
                    setMeetingForm((prev) => ({
                      ...prev,
                      date: event.target.value,
                    }))
                  }
                />
                <select
                  className="h-10 min-w-[220px] rounded-md border border-slate-200 px-3 text-sm"
                  value={meetingForm.timezone}
                  onChange={(event) =>
                    setMeetingForm((prev) => ({
                      ...prev,
                      timezone: event.target.value,
                    }))
                  }
                >
                  <option>GMT+02:00 - Europe/Vilnius</option>
                  <option>GMT+01:00 - Europe/Warsaw</option>
                  <option>GMT+00:00 - UTC</option>
                  <option>GMT-05:00 - America/New York</option>
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-[120px_140px_1fr_auto]">
                <select
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm"
                  value={meetingForm.time}
                  onChange={(event) =>
                    setMeetingForm((prev) => ({
                      ...prev,
                      time: event.target.value,
                    }))
                  }
                >
                  {["09:00", "10:00", "11:00", "13:00", "15:00"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm"
                  value={meetingForm.duration}
                  onChange={(event) =>
                    setMeetingForm((prev) => ({
                      ...prev,
                      duration: event.target.value,
                    }))
                  }
                >
                  {["30 min", "45 min", "60 min", "90 min"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <div className="relative">
                  <input
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                    placeholder="Interviewers"
                    value={interviewerQuery}
                    onChange={(event) => {
                      const next = event.target.value;
                      setInterviewerQuery(next);
                      setMeetingForm((prev) => ({
                        ...prev,
                        interviewers: next,
                      }));
                      setShowInterviewerMenu(true);
                    }}
                    onFocus={() => setShowInterviewerMenu(true)}
                    onBlur={() => {
                      window.setTimeout(() => setShowInterviewerMenu(false), 120);
                    }}
                  />
                  {showInterviewerMenu &&
                  interviewerQuery.trim().length > 0 ? (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                      {interviewerOptions
                        .filter((option) =>
                          option.name
                            .toLowerCase()
                            .includes(interviewerQuery.toLowerCase())
                        )
                        .map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setInterviewerQuery(option.name);
                              setMeetingForm((prev) => ({
                                ...prev,
                                interviewers: option.name,
                              }));
                              setShowInterviewerMenu(false);
                            }}
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 text-xs font-semibold text-white">
                              {initials(option.name)}
                            </span>
                            <span>{option.name}</span>
                          </button>
                        ))}
                      {interviewerOptions.filter((option) =>
                        option.name
                          .toLowerCase()
                          .includes(interviewerQuery.toLowerCase())
                      ).length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-400">
                          No matches.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="h-10 rounded-md border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600"
                >
                  Availability
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_260px]">
                <input
                  className="h-11 rounded-md border border-slate-200 px-3 text-sm"
                  value={meetingForm.title}
                  onChange={(event) =>
                    setMeetingForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                />
                <div className="flex items-center gap-2">
                  <select
                    className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                    value={meetingForm.interviewerName}
                    onChange={(event) =>
                      setMeetingForm((prev) => ({
                        ...prev,
                        interviewerName: event.target.value,
                      }))
                    }
                  >
                    <option>Audrius Gadisauskas</option>
                    <option>Ismira Recruiter</option>
                  </select>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 text-slate-500"
                  >
                    i
                  </button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_260px]">
                <textarea
                  className="min-h-[180px] rounded-md border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Interview description"
                  value={meetingForm.description}
                  onChange={(event) =>
                    setMeetingForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
                <div className="space-y-3">
                  <input
                    className="h-11 rounded-md border border-slate-200 px-3 text-sm"
                    placeholder="Location"
                    value={meetingForm.location}
                    onChange={(event) =>
                      setMeetingForm((prev) => ({
                        ...prev,
                        location: event.target.value,
                      }))
                    }
                  />
                  <select
                    className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                    value={meetingForm.interviewGuide}
                    onChange={(event) =>
                      setMeetingForm((prev) => ({
                        ...prev,
                        interviewGuide: event.target.value,
                      }))
                    }
                  >
                    <option>Interview Guide</option>
                    <option>Standard Interview</option>
                    <option>Service Role Interview</option>
                  </select>
                  <select
                    className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                    value={meetingForm.meetingType}
                    onChange={(event) =>
                      setMeetingForm((prev) => ({
                        ...prev,
                        meetingType: event.target.value,
                      }))
                    }
                  >
                    <option>Meeting Type</option>
                    <option>Zoom</option>
                    <option>Teams</option>
                    <option>Google Meet</option>
                  </select>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">Request Scorecards?</span>
                    <div className="flex overflow-hidden rounded-md border border-slate-200">
                      {[
                        { label: "Yes", value: true },
                        { label: "No", value: false },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className={`px-3 py-1 text-xs font-semibold ${
                            meetingForm.requestScorecards === item.value
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-white text-slate-500"
                          }`}
                          onClick={() =>
                            setMeetingForm((prev) => ({
                              ...prev,
                              requestScorecards: item.value,
                            }))
                          }
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">Send SMS Reminders</span>
                    <div className="flex overflow-hidden rounded-md border border-slate-200">
                      {[
                        { label: "Yes", value: true },
                        { label: "No", value: false },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className={`px-3 py-1 text-xs font-semibold ${
                            meetingForm.sendSms === item.value
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-white text-slate-500"
                          }`}
                          onClick={() =>
                            setMeetingForm((prev) => ({
                              ...prev,
                              sendSms: item.value,
                            }))
                          }
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-sky-500"
              >
                + Add Interview
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600"
              >
                Save as Template
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                  onClick={() => setShowMeetingModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white"
                  onClick={handleCreateMeeting}
                  disabled={meetingSubmitting}
                >
                  {meetingSubmitting ? "Creating..." : "Create Google Meet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </div>
      {isDocumentModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setIsDocumentModalOpen(false)}
        >
          <div
            className="flex h-[85vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {activeDocumentName ?? "Document"}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {activeDocumentId ? "Preview" : "No document selected"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    if (!activeDocumentId) return;
                    const entry = documentEntries.find(
                      (item) => item.doc.id === activeDocumentId
                    );
                    if (!entry) return;
                    void handleOpenDocument(
                      entry.doc.id,
                      entry.path,
                      entry.doc.url ?? null
                    );
                  }}
                >
                  Open in new tab
                </button>
                <button
                  type="button"
                  className="rounded-full bg-black px-3 py-1 text-[11px] font-semibold text-white"
                  onClick={() => setIsDocumentModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-slate-50">
              {activeDocumentUrl ? (
                isPdfFile(activeDocumentMime, activeDocumentUrl) ? (
                  <iframe
                    title={activeDocumentName ?? "Document"}
                    className="h-full w-full"
                    src={`${activeDocumentUrl}#zoom=100`}
                  />
                ) : isImageFile(activeDocumentMime, activeDocumentUrl) ? (
                  <img
                    src={activeDocumentUrl}
                    alt={activeDocumentName ?? "Document"}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                    Preview not available. Use “Open in new tab.”
                  </div>
                )
              ) : signingDocId === activeDocumentId ? (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                  Loading preview...
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                  Preview not available.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {isQuestionnaireModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setIsQuestionnaireModalOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">
                Send questionnaire
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Choose which questionnaire to send.
              </div>
            </div>
            <div className="px-5 py-4">
              <label className="text-xs font-semibold uppercase text-slate-500">
                Questionnaire
              </label>
              <select
                className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                value={selectedQuestionnaire}
                onChange={(event) => setSelectedQuestionnaire(event.target.value)}
                disabled={questionnaires.length === 0}
              >
                <option value="">Select questionnaire</option>
                {questionnaires.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {questionnaires.length === 0
                    ? "No questionnaires yet."
                    : "Can't find the right one?"}
                </span>
                <button
                  type="button"
                  className="font-semibold text-emerald-700"
                  onClick={() => handleOpenCreateQuestionnaire(true)}
                >
                  Create new questionnaire
                </button>
              </div>
              {selectedQuestionnaire ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300 text-xs font-semibold text-emerald-700">
                    i
                  </span>
                  <div>
                    You are about to send this questionnaire to{" "}
                    <span className="font-semibold text-emerald-800">
                      {candidate?.email ?? "this candidate"}
                    </span>
                    .
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                onClick={() => setIsQuestionnaireModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                disabled={!selectedQuestionnaire}
                onClick={handleSendQuestionnaire}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isCreateQuestionnaireModalOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          onClick={() => handleCloseCreateQuestionnaireModal()}
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
                  value={questionnaireDraftName}
                  onChange={(event) => {
                    setQuestionnaireDraftName(event.target.value);
                    if (questionnaireDraftError) {
                      setQuestionnaireDraftError(null);
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Status
                </label>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                  value={questionnaireDraftStatus}
                  onChange={(event) =>
                    setQuestionnaireDraftStatus(
                      event.target.value as QuestionnaireStatus
                    )
                  }
                >
                  <option value="Active">Active</option>
                  <option value="Draft">Draft</option>
                </select>
              </div>
              {questionnaireDraftError ? (
                <div className="text-xs text-rose-600">
                  {questionnaireDraftError}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                onClick={() => handleCloseCreateQuestionnaireModal()}
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
    </>
  );
}

type AddNoteFormProps = {
  onAddNote: (body: string) => void;
  teamUsers: TeamUser[];
};

function AddNoteForm({ onAddNote, teamUsers }: AddNoteFormProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isCompact, setIsCompact] = useState(true);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionCaretRef = useRef<number | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    onAddNote(value.trim());
    setValue("");
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMentionIndex(0);
  };
  const isEmpty = value.trim().length === 0;

  const updateMentions = (text: string, caret: number | null) => {
    if (caret === null || caret === undefined) {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionStart(null);
      return;
    }
    const uptoCaret = text.slice(0, caret);
    const atIndex = uptoCaret.lastIndexOf("@");
    if (atIndex === -1) {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionStart(null);
      return;
    }
    const charBefore = atIndex > 0 ? uptoCaret[atIndex - 1] : " ";
    if (charBefore && !/\s/.test(charBefore)) {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionStart(null);
      return;
    }
    const query = uptoCaret.slice(atIndex + 1);
    if (query.length > 0 && /\s/.test(query)) {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionStart(null);
      return;
    }
    setMentionOpen(true);
    setMentionQuery(query);
    setMentionStart(atIndex);
    setMentionIndex(0);
  };

  const mentionOptions = useMemo(() => {
    const cleanedQuery = mentionQuery.trim().toLowerCase();
    const options = teamUsers
      .map((user) => {
        const name = user.name?.trim();
        const email = user.email?.trim();
        const label = name || email || "Team member";
        return { ...user, label };
      })
      .filter((user) => {
        if (!cleanedQuery) return true;
        const name = user.name?.toLowerCase() ?? "";
        const email = user.email?.toLowerCase() ?? "";
        return name.includes(cleanedQuery) || email.includes(cleanedQuery);
      })
      .sort((a, b) => {
        if (!cleanedQuery) return a.label.localeCompare(b.label);
        const aName = a.label.toLowerCase();
        const bName = b.label.toLowerCase();
        const aStarts = aName.startsWith(cleanedQuery);
        const bStarts = bName.startsWith(cleanedQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 6);
    return options;
  }, [mentionQuery, teamUsers]);

  useEffect(() => {
    if (mentionIndex >= mentionOptions.length) {
      setMentionIndex(0);
    }
  }, [mentionIndex, mentionOptions.length]);

  const applyMention = (user: TeamUser & { label?: string }) => {
    if (mentionStart === null || mentionCaretRef.current === null) return;
    const label = user.label ?? user.name ?? user.email ?? "Team member";
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionCaretRef.current);
    const insert = `@${label} `;
    const next = `${before}${insert}${after}`;
    setValue(next);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = before.length + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  useEffect(() => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    if (value.trim().length === 0) {
      el.style.height = "32px";
      setIsCompact(true);
      return;
    }
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 160);
    const clamped = Math.max(next, 32);
    el.style.height = `${clamped}px`;
    setIsCompact(clamped <= 32);
  }, [value]);

  return (
    <div className="mt-4">
      <form onSubmit={handleSubmit} className="mt-auto flex items-center gap-3">
        <div
          className={`relative flex flex-1 gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm ${
            isCompact ? "items-center" : "items-end"
          }`}
        >
          {mentionOpen ? (
            <div className="absolute bottom-full left-10 z-20 mb-2 w-[360px] max-w-[calc(100vw-5rem)] rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-lg">
              {mentionOptions.length === 0 ? (
                <div className="px-2 py-1.5 text-slate-400">
                  {teamUsers.length === 0
                    ? "No team members loaded."
                    : "No matching team members."}
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto">
                  {mentionOptions.map((user, index) => (
                    <button
                      key={user.id || user.email || user.label || index}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                        index === mentionIndex
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applyMention(user);
                      }}
                    >
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                        @
                      </span>
                      <span className="text-xs font-semibold text-slate-900">
                        {user.label}
                      </span>
                      {user.email ? (
                        <span className="ml-auto text-[11px] text-slate-400">
                          {user.email}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            aria-label="Add emoji"
          >
            <Smile className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            className={`max-h-40 min-h-[32px] flex-1 resize-none bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none ${
              isCompact ? "h-8 py-2 leading-4" : "py-1.5 leading-5"
            }`}
            placeholder="Type a message"
            value={value}
            onChange={(event) => {
              const nextValue = event.target.value;
              const caret = event.target.selectionStart;
              mentionCaretRef.current = caret;
              setValue(nextValue);
              updateMentions(nextValue, caret);
            }}
            onClick={(event) => {
              const caret = event.currentTarget.selectionStart;
              mentionCaretRef.current = caret;
              updateMentions(event.currentTarget.value, caret);
            }}
            onKeyUp={(event) => {
              const caret = event.currentTarget.selectionStart;
              mentionCaretRef.current = caret;
              updateMentions(event.currentTarget.value, caret);
            }}
            onKeyDown={(event) => {
              if (!mentionOpen) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMentionIndex((prev) =>
                  mentionOptions.length === 0
                    ? 0
                    : (prev + 1) % mentionOptions.length
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setMentionIndex((prev) =>
                  mentionOptions.length === 0
                    ? 0
                    : (prev - 1 + mentionOptions.length) % mentionOptions.length
                );
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                if (mentionOptions.length > 0) {
                  event.preventDefault();
                  applyMention(mentionOptions[mentionIndex]);
                }
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setMentionOpen(false);
                setMentionQuery("");
                setMentionStart(null);
                return;
              }
            }}
          />
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </div>
        <button
          type="submit"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-slate-800"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
