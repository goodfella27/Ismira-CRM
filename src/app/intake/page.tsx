"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCountryDisplay } from "@/lib/country";
import {
  CheckCircle2,
  FileAudio,
  Link2,
  Loader2,
  UploadCloud,
  XCircle,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import uploadIcon from "@/images/upload_icon.png";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const stripMarkdown = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeSummaryMarkdown = (value: string) => {
  if (!value) return value;
  let text = value.replace(/\r\n/g, "\n").trim();
  // Ensure headings start on new lines with spacing.
  text = text.replace(/(#+\s*)/g, "\n$1");
  text = text.replace(/\n{2,}(#+)/g, "\n\n$1");
  // Ensure list items start on new lines.
  text = text.replace(/([^\n])(\s*[-*]\s+)/g, "$1\n$2");
  // Convert inline timeline separators into real line breaks.
  text = text.replace(/\s*\|\|\s*/g, "\n");
  // Collapse excessive blank lines.
  text = text.replace(/\n{3,}/g, "\n\n");

  const lines = text.split("\n");
  const out: string[] = [];
  let inTimeline = false;
  let tableStarted = false;

  const isHeading = (line: string) => /^#{2,6}\s+/.test(line.trim());
  const isTimelineHeading = (line: string) =>
    /^#{2,6}\s+timeline of interview flow/i.test(line.trim());

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (isTimelineHeading(line)) {
      inTimeline = true;
      tableStarted = false;
      out.push(line.trim());
      continue;
    }

    if (inTimeline) {
      if (isHeading(line)) {
        inTimeline = false;
        out.push(line.trim());
        continue;
      }

      if (!tableStarted) {
        if (
          /time/i.test(trimmed) &&
          /topic/i.test(trimmed) &&
          /details/i.test(trimmed)
        ) {
          out.push("| Time | Topic | Details |");
          out.push("| --- | --- | --- |");
          tableStarted = true;
          continue;
        }
        const pipeCount = (trimmed.match(/\|/g) ?? []).length;
        if (pipeCount >= 2) {
          out.push("| Time | Topic | Details |");
          out.push("| --- | --- | --- |");
          tableStarted = true;
          let row = trimmed;
          if (!row.startsWith("|")) row = `| ${row}`;
          if (!row.endsWith("|")) row = `${row} |`;
          out.push(row.replace(/\|\s*\|/g, "| "));
          continue;
        }
      }

      if (tableStarted) {
        if (!trimmed) {
          out.push("");
          continue;
        }
        if (/^[-| ]{3,}$/.test(trimmed)) {
          continue;
        }
        if (trimmed.includes("|")) {
          let row = trimmed;
          if (!row.startsWith("|")) row = `| ${row}`;
          if (!row.endsWith("|")) row = `${row} |`;
          out.push(row.replace(/\|\s*\|/g, "| "));
          continue;
        }
      }
    }

    out.push(line);
  }

  return out.join("\n").trim();
};

type UploadEntry = {
  id: string;
  name: string;
  uploadedAt: string;
  durationSeconds?: number | null;
  mode: "upload" | "youtube";
  status: "uploading" | "uploaded" | "processing" | "done" | "error";
  progress?: number | null;
  transcript?: string;
  error?: string;
  sizeBytes?: number;
  sourceUrl?: string;
  fileId?: string;
  storageBucket?: string;
  storagePath?: string;
  mime?: string;
};

const formatBytes = (value?: number) => {
  if (!value || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatDuration = (value?: number | null) => {
  if (!value || !Number.isFinite(value)) return "—";
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const buildYoutubeName = (url: string) => {
  try {
    const parsed = new URL(url);
    const id =
      parsed.searchParams.get("v") ||
      parsed.pathname.split("/").filter(Boolean).pop();
    return id ? `YouTube · ${id}` : "YouTube";
  } catch {
    return "YouTube";
  }
};

export default function IntakePage() {
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [candidates, setCandidates] = useState<
    Array<{ id: string; createdAt: string; profile: Record<string, unknown> }>
  >([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null
  );
  const [showRawJson, setShowRawJson] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [showCandidateJson, setShowCandidateJson] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);
  const [pipelineIds, setPipelineIds] = useState<Set<string>>(new Set());
  const [pipelineEmails, setPipelineEmails] = useState<Set<string>>(new Set());
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [uploadFilter, setUploadFilter] = useState("");
  const [uploadTab, setUploadTab] = useState<"upload" | "link">("upload");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    full_name: string;
    desired_position: string;
    email: string;
    phone: string;
    nationality: string;
    country: string;
    availability_date: string;
    salary_expectation: string;
    summary: string;
    experience_summary: string;
    education: string;
    tags: string[];
  } | null>(null);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const storageKey = "ismira.intake.candidates";
  const uploadsStorageKey = "ismira.intake.uploads";
  const pipelineStorageKey = "ismira.pipeline.v1";
  const pipelineStageId = "consultation";
  const pipelinePoolId = "roomy";
  const pipelineTargetId = "mailerlite";

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedCandidateId) ?? null,
    [candidates, selectedCandidateId]
  );

  const activeUploads = useMemo(
    () =>
      uploads.filter((upload) =>
        ["uploading", "uploaded", "processing"].includes(upload.status)
      ),
    [uploads]
  );

  const filteredUploads = useMemo(() => {
    if (!uploadFilter.trim()) return uploads;
    const query = uploadFilter.trim().toLowerCase();
    return uploads.filter((upload) =>
      `${upload.name} ${upload.mode}`.toLowerCase().includes(query)
    );
  }, [uploads, uploadFilter]);

  const getField = (candidate: Record<string, unknown> | null, key: string) => {
    if (!candidate) return null;
    const fields = candidate.fields as Record<string, unknown> | undefined;
    if (!fields) return null;
    return fields[key] ?? null;
  };

  const buildDraft = (
    candidate: { profile: Record<string, unknown> } | null
  ) => {
    if (!candidate) {
      return {
        full_name: "",
        desired_position: "",
        email: "",
        phone: "",
        nationality: "",
        country: "",
        availability_date: "",
        salary_expectation: "",
        summary: "",
        experience_summary: "",
        education: "",
        tags: [],
      };
    }
    return {
      full_name: String(getField(candidate.profile, "full_name") ?? ""),
      desired_position: String(getField(candidate.profile, "desired_position") ?? ""),
      email: String(getField(candidate.profile, "email") ?? ""),
      phone: String(getField(candidate.profile, "phone") ?? ""),
      nationality: String(getField(candidate.profile, "nationality") ?? ""),
      country: String(
        getField(candidate.profile, "current_country") ??
          getField(candidate.profile, "nationality") ??
          ""
      ),
      availability_date: String(
        getField(candidate.profile, "availability_date") ?? ""
      ),
      salary_expectation: String(
        getField(candidate.profile, "salary_expectation") ?? ""
      ),
      summary: String(candidate.profile.summary ?? ""),
      experience_summary: String(
        getField(candidate.profile, "experience_summary") ?? ""
      ),
      education: String(getField(candidate.profile, "education") ?? ""),
      tags: Array.isArray(getField(candidate.profile, "tags"))
        ? (getField(candidate.profile, "tags") as string[]).filter(Boolean)
        : [],
    };
  };

  useEffect(() => {
    if (selectedCandidate && showCandidateModal) {
      setEditDraft(buildDraft(selectedCandidate));
      setEditingField(null);
      setShowTagInput(false);
      setTagDraft("");
    }
  }, [selectedCandidateId, showCandidateModal]);

  const focusField = (key: string) => {
    window.requestAnimationFrame(() => {
      const el = fieldRefs.current[key];
      if (el) {
        el.focus();
        el.select();
      }
    });
  };

  const toggleFieldEdit = (key: string) => {
    if (editingField === key) {
      setEditingField(null);
      return;
    }
    setEditingField(key);
    focusField(key);
  };

  const normalizeTag = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9:\- ]/g, "");

  const handleAddTag = () => {
    if (!editDraft) return;
    const next = normalizeTag(tagDraft);
    if (!next) return;
    const exists = editDraft.tags.some((tag) => tag.toLowerCase() === next);
    if (exists) {
      setTagDraft("");
      setShowTagInput(false);
      return;
    }
    setEditDraft((prev) =>
      prev ? { ...prev, tags: [...prev.tags, next] } : prev
    );
    setTagDraft("");
    setShowTagInput(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditDraft((prev) =>
      prev ? { ...prev, tags: prev.tags.filter((tag) => tag !== tagToRemove) } : prev
    );
  };

  const persistCandidates = (
    next: Array<{ id: string; createdAt: string; profile: Record<string, unknown> }>
  ) => {
    setCandidates(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    }
  };

  const updateUploads = (updater: (prev: UploadEntry[]) => UploadEntry[]) => {
    setUploads((prev) => {
      const next = updater(prev);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(uploadsStorageKey, JSON.stringify(next));
      }
      return next;
    });
  };

  const addUpload = (entry: UploadEntry) => {
    updateUploads((prev) => [entry, ...prev]);
  };

  const updateUpload = (id: string, patch: Partial<UploadEntry>) => {
    updateUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeUpload = (id: string) => {
    updateUploads((prev) => prev.filter((item) => item.id !== id));
  };

  const removeCandidate = (id: string) => {
    const next = candidates.filter((candidate) => candidate.id !== id);
    persistCandidates(next);
    if (selectedCandidateId === id) {
      setSelectedCandidateId(next[0]?.id ?? null);
      setShowCandidateModal(false);
    }
  };

  const readPipelineState = () => {
    if (typeof window === "undefined") return { candidates: [], notes: [], activity: [] };
    const stored = window.localStorage.getItem(pipelineStorageKey);
    if (!stored) return { candidates: [], notes: [] };
    try {
      return JSON.parse(stored) as {
        candidates?: Array<Record<string, unknown>>;
        notes?: Array<Record<string, unknown>>;
        activity?: Array<Record<string, unknown>>;
      };
    } catch {
      return { candidates: [], notes: [], activity: [] };
    }
  };

  const writePipelineState = (state: {
    candidates?: Array<Record<string, unknown>>;
    notes?: Array<Record<string, unknown>>;
    activity?: Array<Record<string, unknown>>;
    pipelines?: unknown[];
    selectedPipelineId?: string;
  }) => {
    if (typeof window === "undefined") return;
    const stored = readPipelineState();
    window.localStorage.setItem(
      pipelineStorageKey,
      JSON.stringify({
        candidates: state.candidates ?? [],
        notes: state.notes ?? [],
        activity: state.activity ?? [],
        pipelines: state.pipelines ?? (stored as { pipelines?: unknown[] }).pipelines,
        selectedPipelineId:
          state.selectedPipelineId ??
          (stored as { selectedPipelineId?: string }).selectedPipelineId,
      })
    );
  };

  const buildPipelineIndex = (state: {
    candidates?: Array<Record<string, unknown>>;
  }) => {
    const ids = new Set<string>();
    const emails = new Set<string>();
    (state.candidates ?? []).forEach((candidate) => {
      const id = candidate.id;
      if (typeof id === "string") ids.add(id);
      const email = candidate.email;
      if (typeof email === "string") emails.add(email.toLowerCase());
    });
    return { ids, emails };
  };

  const buildCandidateRow = (candidate: Record<string, unknown>) => {
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

  const createId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now());

  const addSelectedToPipeline = async () => {
    if (!selectedCandidate) return;
    setPipelineLoading(true);
    setPipelineMessage(null);

    try {
      const draft = editDraft ?? buildDraft(selectedCandidate);
      const fields =
        (selectedCandidate.profile.fields as Record<string, unknown> | undefined) ??
        {};
      const email =
        draft.email.trim() ||
        (fields.email as string | undefined) ||
        `unknown-${selectedCandidate.id}@intake.local`;
      const name =
        draft.full_name.trim() ||
        (fields.full_name as string | undefined) ||
        (fields.name as string | undefined) ||
        "Unknown";
      const desiredPosition =
        draft.desired_position.trim() ||
        (fields.desired_position as string | undefined) ||
        (fields.preferred_role as string | undefined) ||
        (fields.position as string | undefined);
      const nationality =
        draft.nationality.trim() || (fields.nationality as string | undefined);
      const country =
        draft.country.trim() ||
        (fields.current_country as string | undefined) ||
        nationality;
      const rawEmail = draft.email.trim() || (fields.email as string | undefined) || "";
      const rawPhone = draft.phone.trim() || (fields.phone as string | undefined) || "";
      const rawNationality =
        draft.nationality.trim() || (fields.nationality as string | undefined) || "";
      const rawCountry =
        draft.country.trim() ||
        (fields.current_country as string | undefined) ||
        "";
      const rawAvailability =
        draft.availability_date.trim() ||
        (fields.availability_date as string | undefined) ||
        "";
      const rawSalary =
        draft.salary_expectation.trim() ||
        (fields.salary_expectation as string | undefined) ||
        "";
      const summaryText =
        draft.summary.trim() ||
        (selectedCandidate.profile.summary as string | undefined) ||
        (fields.summary as string | undefined) ||
        (fields.experience_summary as string | undefined);
      const experienceText =
        draft.experience_summary.trim() ||
        (fields.experience_summary as string | undefined) ||
        (fields.experience as string | undefined);
      const educationText =
        draft.education.trim() ||
        (fields.education as string | undefined) ||
        (fields.education_summary as string | undefined);
      const workHistoryRaw = fields.work_history;
      const educationRaw = fields.education_list ?? fields.education_items;
      const strengthsRaw =
        fields.strengths ?? (fields.top_strengths as unknown | undefined);
      const concernsRaw =
        fields.concerns ?? (fields.top_concerns as unknown | undefined);
      const tagsRaw = fields.tags;
      const pipelineCandidateId = `intake-${selectedCandidate.id}`;

      const state = readPipelineState();
      const existing = state.candidates ?? [];
      const index = buildPipelineIndex(state);

      if (
        index.ids.has(pipelineCandidateId) ||
        index.emails.has(email.toLowerCase())
      ) {
        setPipelineMessage("Candidate already in pipeline.");
        return;
      }

      const stageCandidates = existing.filter(
        (candidate) => candidate.stage_id === pipelineStageId
      );
      const minOrder =
        stageCandidates.length > 0
          ? Math.min(
              ...stageCandidates.map((candidate) =>
                typeof candidate.order === "number" ? candidate.order : 0
              )
            )
          : 0;

      const workHistory: Array<{
        id: string;
        role: string;
        company: string;
        start?: string;
        end?: string;
        details?: string;
      }> = [];

      if (Array.isArray(workHistoryRaw)) {
        workHistoryRaw.forEach((entry) => {
          if (!entry || typeof entry !== "object") return;
          const record = entry as Record<string, unknown>;
          workHistory.push({
            id: createId(),
            role:
              (record.role as string | undefined) ??
              (record.title as string | undefined) ??
              desiredPosition ??
              "Experience",
            company:
              (record.company as string | undefined) ??
              (record.employer as string | undefined) ??
              "—",
            start:
              (record.start as string | undefined) ??
              (record.from as string | undefined),
            end:
              (record.end as string | undefined) ??
              (record.to as string | undefined),
            details:
              (record.details as string | undefined) ??
              (record.description as string | undefined) ??
              undefined,
          });
        });
      } else if (typeof experienceText === "string" && experienceText.trim()) {
        workHistory.push({
          id: createId(),
          role: desiredPosition ?? "Experience",
          company: "—",
          details: experienceText.trim(),
        });
      }

      const education: Array<{
        id: string;
        program: string;
        institution: string;
        start?: string;
        end?: string;
        details?: string;
      }> = [];

      if (Array.isArray(educationRaw)) {
        educationRaw.forEach((entry) => {
          if (!entry || typeof entry !== "object") return;
          const record = entry as Record<string, unknown>;
          education.push({
            id: createId(),
            program:
              (record.program as string | undefined) ??
              (record.degree as string | undefined) ??
              (record.title as string | undefined) ??
              "Education",
            institution:
              (record.institution as string | undefined) ??
              (record.school as string | undefined) ??
              "—",
            start:
              (record.start as string | undefined) ??
              (record.from as string | undefined),
            end:
              (record.end as string | undefined) ??
              (record.to as string | undefined),
            details:
              (record.details as string | undefined) ??
              (record.description as string | undefined) ??
              undefined,
          });
        });
      } else if (typeof educationText === "string" && educationText.trim()) {
        education.push({
          id: createId(),
          program: educationText.trim(),
          institution: "—",
        });
      }

      const now = new Date().toISOString();
      const aiSummary = summaryText
        ? normalizeSummaryMarkdown(String(summaryText))
        : undefined;
      const strengths = Array.isArray(strengthsRaw)
        ? strengthsRaw
            .filter((item) => typeof item === "string" && item.trim())
            .map((item) => String(item).trim())
        : [];
      const concerns = Array.isArray(concernsRaw)
        ? concernsRaw
            .filter((item) => typeof item === "string" && item.trim())
            .map((item) => String(item).trim())
        : [];
      const tags = Array.isArray(tagsRaw)
        ? tagsRaw
            .filter((item) => typeof item === "string" && item.trim())
            .map((item) => String(item).trim())
        : [];
      const draftTags =
        draft.tags.length > 0
          ? draft.tags
          : tags;
      const tasks: Array<{
        id: string;
        title: string;
        status: "open" | "done";
        created_at: string;
      }> = [];
      const addTask = (title: string) => {
        tasks.push({
          id: createId(),
          title,
          status: "open",
          created_at: new Date().toISOString(),
        });
      };
      if (!desiredPosition) addTask("Add desired position");
      if (!rawEmail) addTask("Add email");
      if (!rawPhone) addTask("Add phone number");
      if (!rawNationality) addTask("Add nationality");
      if (!rawCountry) addTask("Add current country");
      if (!rawAvailability) addTask("Add availability");
      if (!rawSalary) addTask("Add salary expectation");
      const documents = fields.documents as Record<string, unknown> | undefined;
      if (documents && typeof documents === "object") {
        const passport = String(documents.passport ?? "").toLowerCase();
        const seaman = String(documents.seaman_book ?? "").toLowerCase();
        const medical = String(documents.medical ?? "").toLowerCase();
        if (!passport || passport !== "present") addTask("Collect passport");
        if (!seaman || seaman !== "present") addTask("Collect seaman book");
        if (!medical || medical !== "present") addTask("Collect medical");
      } else {
        addTask("Confirm required documents");
      }
      const candidatePayload = {
        id: pipelineCandidateId,
        name,
        email,
        phone: draft.phone.trim() || (fields.phone as string | undefined) || undefined,
        avatar_url: null,
        pipeline_id: pipelineTargetId,
        pool_id: pipelinePoolId,
        stage_id: pipelineStageId,
        country,
        nationality,
        status: "active",
        created_at: selectedCandidate.createdAt ?? now,
        updated_at: now,
        order: minOrder - 1,
        source: "Transcript",
        desired_position: desiredPosition,
        availability: rawAvailability || undefined,
        salary_expectation: rawSalary || undefined,
        ai_summary_markdown: aiSummary,
        experience_summary:
          (aiSummary ? stripMarkdown(aiSummary) : experienceText) ?? "",
        top_strengths: strengths,
        top_concerns: concerns,
        tags: draftTags,
        tasks,
        work_history: workHistory,
        education,
      };

      const { error: upsertError } = await supabase
        .from("candidates")
        .upsert(buildCandidateRow(candidatePayload), { onConflict: "id" });
      if (upsertError) {
        throw new Error(upsertError.message);
      }

      writePipelineState({
        ...state,
        candidates: [candidatePayload, ...existing],
      });

      index.ids.add(pipelineCandidateId);
      index.emails.add(email.toLowerCase());
      setPipelineIds(new Set(index.ids));
      setPipelineEmails(new Set(index.emails));
      setPipelineMessage("Added to pipeline.");
      setCandidates((prev) =>
        prev.map((candidate) =>
          candidate.id === selectedCandidate.id
            ? {
                ...candidate,
                profile: {
                  ...candidate.profile,
                  fields: {
                    ...(candidate.profile.fields as Record<string, unknown> | undefined),
                    pipeline_added_at: new Date().toISOString(),
                  },
                },
              }
            : candidate
        )
      );
    } catch (err) {
      setPipelineMessage(
        err instanceof Error ? err.message : "Failed to add to pipeline."
      );
    } finally {
      setPipelineLoading(false);
    }
  };

  const saveDraftToProfile = () => {
    if (!selectedCandidate || !editDraft) return;
    const nextProfile = { ...selectedCandidate.profile };
    const nextFields = {
      ...((nextProfile.fields as Record<string, unknown> | undefined) ?? {}),
    };

    nextFields.full_name = editDraft.full_name.trim() || null;
    nextFields.desired_position = editDraft.desired_position.trim() || null;
    nextFields.email = editDraft.email.trim() || null;
    nextFields.phone = editDraft.phone.trim() || null;
    nextFields.nationality = editDraft.nationality.trim() || null;
    nextFields.current_country = editDraft.country.trim() || null;
    nextFields.availability_date = editDraft.availability_date.trim() || null;
    nextFields.salary_expectation = editDraft.salary_expectation.trim() || null;
    nextFields.experience_summary = editDraft.experience_summary.trim() || null;
    nextFields.education = editDraft.education.trim() || null;
    nextFields.tags = editDraft.tags.length > 0 ? editDraft.tags : null;

    nextProfile.fields = nextFields;
    nextProfile.summary = editDraft.summary.trim() || null;

    const nextCandidates = candidates.map((candidate) =>
      candidate.id === selectedCandidate.id
        ? { ...candidate, profile: nextProfile }
        : candidate
    );
    persistCandidates(nextCandidates);
    setPipelineMessage("Profile updated.");
  };

  const handlePickAudio = () => {
    fileInputRef.current?.click();
  };

  const getAudioDuration = (file: File) =>
    new Promise<number | null>((resolve) => {
      const audio = document.createElement("audio");
      const url = URL.createObjectURL(file);
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(audio.duration) ? audio.duration : null);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      audio.src = url;
    });

  const handleUploadFile = async (file: File) => {
    setUploadError(null);
    const uploadId = createId();
    const uploadedAt = new Date().toISOString();
    const duration = await getAudioDuration(file);
    addUpload({
      id: uploadId,
      name: file.name || "Audio upload",
      uploadedAt,
      durationSeconds: duration,
      mode: "upload",
      status: "uploading",
      progress: 0,
      sizeBytes: file.size,
    });

    try {
      const signRes = await fetch("/api/storage/signed-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          contentType: file.type,
        }),
      });
      const signData = await signRes.json().catch(() => null);
      if (!signRes.ok) {
        const message =
          signData?.error ?? "Unable to prepare upload. Please try again.";
        updateUpload(uploadId, {
          status: "error",
          error: message,
          progress: null,
        });
        setUploadError(message);
        return;
      }

      const signedUrl =
        signData && typeof signData.signedUrl === "string"
          ? signData.signedUrl
          : "";
      const storageBucket =
        signData && typeof signData.bucket === "string" ? signData.bucket : "";
      const storagePath =
        signData && typeof signData.path === "string" ? signData.path : "";

      if (!signedUrl || !storageBucket || !storagePath) {
        const message = "Upload configuration is invalid.";
        updateUpload(uploadId, {
          status: "error",
          error: message,
          progress: null,
        });
        setUploadError(message);
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signedUrl);
        try {
          xhr.setRequestHeader("x-upsert", "false");
        } catch {
          // ignore header issues (CORS/preflight handled by storage provider)
        }
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const pct = Math.min(
            100,
            Math.round((event.loaded / event.total) * 100)
          );
          updateUpload(uploadId, { progress: pct });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateUpload(uploadId, {
              status: "uploaded",
              progress: 100,
              storageBucket,
              storagePath,
              mime: file.type,
            });
            resolve();
            return;
          }
          const message = xhr.status
            ? `Upload failed (${xhr.status})`
            : "Upload failed";
          updateUpload(uploadId, {
            status: "error",
            error: message,
            progress: null,
          });
          setUploadError(message);
          reject(new Error(message));
        };
        xhr.onerror = () => {
          const message = "Upload failed";
          updateUpload(uploadId, {
            status: "error",
            error: message,
            progress: null,
          });
          setUploadError(message);
          reject(new Error(message));
        };
        const body = new FormData();
        body.append("cacheControl", "3600");
        body.append("", file);
        xhr.send(body);
      });
    } catch {
      // error already handled in state
    }
  };

  const handleTranscribeUpload = async (upload: UploadEntry) => {
    if (!upload.storagePath && !upload.fileId) return;
    setTranscribeError(null);
    updateUpload(upload.id, {
      status: "processing",
      progress: null,
      error: undefined,
    });
    try {
      const res = upload.storagePath
        ? await fetch("/api/transcribe-storage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bucket: upload.storageBucket ?? "candidate-documents",
              path: upload.storagePath,
            }),
          })
        : await fetch("/api/transcribe-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: upload.fileId }),
          });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Transcription failed");
      }
      const text = (data?.text as string | undefined)?.trim();
      if (text) {
        setTranscript((prev) => (prev ? `${prev}\n${text}` : text));
      }
      updateUpload(upload.id, {
        status: "done",
        progress: null,
        transcript: text ?? "",
      });
    } catch (err) {
      updateUpload(upload.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Transcription failed",
      });
      setTranscribeError(
        err instanceof Error ? err.message : "Transcription failed"
      );
    }
  };

  const handleTranscribeYouTube = async () => {
    const value = youtubeUrl.trim();
    if (!value) return;
    setYoutubeLoading(true);
    setYoutubeError(null);
    const uploadId = createId();
    const uploadedAt = new Date().toISOString();
    addUpload({
      id: uploadId,
      name: buildYoutubeName(value),
      uploadedAt,
      durationSeconds: null,
      mode: "youtube",
      status: "processing",
      progress: null,
      sourceUrl: value,
    });
    try {
      const res = await fetch("/api/transcribe-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "YouTube transcription failed");
      }
      const text = (data?.text as string | undefined)?.trim();
      if (text) {
        setTranscript((prev) => (prev ? `${prev}\n${text}` : text));
      }
      updateUpload(uploadId, {
        status: "done",
        progress: null,
        transcript: text ?? "",
      });
    } catch (err) {
      updateUpload(uploadId, {
        status: "error",
        error: err instanceof Error ? err.message : "YouTube transcription failed",
      });
      setYoutubeError(
        err instanceof Error ? err.message : "YouTube transcription failed"
      );
    } finally {
      setYoutubeLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(uploadsStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as UploadEntry[];
      if (Array.isArray(parsed)) {
        setUploads(parsed);
      }
    } catch {
      // ignore invalid storage
    }
  }, []);

  const runExtraction = async () => {
    setLoading(true);
    setError(null);
    setResult("");
    setProfile(null);
    setShowRawJson(false);

    try {
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Extraction failed");
      }

      const nextProfile = data.profile ?? null;
      setProfile(nextProfile);
      setResult(JSON.stringify(nextProfile, null, 2));

      if (nextProfile) {
        const newCandidate = {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : String(Date.now()),
          createdAt: new Date().toISOString(),
          profile: nextProfile,
        };
        persistCandidates([newCandidate, ...candidates]);
        setSelectedCandidateId(newCandidate.id);
        setShowCandidateModal(true);
        setShowCandidateJson(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Array<{
        id: string;
        createdAt: string;
        profile: Record<string, unknown>;
      }>;
      if (Array.isArray(parsed)) {
        setCandidates(parsed);
        if (parsed.length > 0) {
          setSelectedCandidateId(parsed[0].id);
        }
      }
    } catch {
      // ignore invalid storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const state = readPipelineState();
    const index = buildPipelineIndex(state);
    setPipelineIds(index.ids);
    setPipelineEmails(index.emails);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[95vw] flex-col gap-4 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Transcript Intake</h1>
        <p className="text-sm text-muted-foreground">
          Paste the interview transcript and extract a structured profile.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr]">
        <section className="order-2 lg:order-2 lg:sticky lg:top-6 lg:h-[calc(98vh-8rem)] lg:self-start">
          {!result ? (
            <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4">
              <label className="text-sm font-medium" htmlFor="transcript">
                Transcript
              </label>
              <textarea
                id="transcript"
                className="mt-3 min-h-[260px] flex-1 rounded-md border border-input bg-background p-3 text-sm"
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                placeholder="Paste transcript text here..."
              />

              {error ? (
                <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  onClick={runExtraction}
                  disabled={loading || transcript.trim().length === 0}
                >
                  {loading ? "Creating..." : "Create Profile"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Extracted Profile</h2>
                <button
                  type="button"
                  className="rounded-md border border-input px-3 py-1 text-xs"
                  onClick={() => setShowRawJson((prev) => !prev)}
                >
                  {showRawJson ? "Hide Raw JSON" : "Show Raw JSON"}
                </button>
              </div>

              <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
                {result ? (
                  <>
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">Name</div>
                          <div className="text-sm font-medium">
                            {(profile?.fields as Record<string, unknown> | undefined)
                              ?.full_name
                              ? String(
                                  (profile?.fields as Record<string, unknown>).full_name
                                )
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Desired position
                          </div>
                          <div className="text-sm font-medium">
                            {(profile?.fields as Record<string, unknown> | undefined)
                              ?.desired_position
                              ? String(
                                  (profile?.fields as Record<string, unknown>)
                                    .desired_position
                                )
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Email
                          </div>
                          <div className="text-sm font-medium">
                            {(profile?.fields as Record<string, unknown> | undefined)?.email
                              ? String((profile?.fields as Record<string, unknown>).email)
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Phone
                          </div>
                          <div className="text-sm font-medium">
                            {(profile?.fields as Record<string, unknown> | undefined)?.phone
                              ? String((profile?.fields as Record<string, unknown>).phone)
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Current Country
                          </div>
                          <div className="text-sm font-medium">
                            {(() => {
                              const nationality = (profile?.fields as Record<string, unknown> | undefined)
                                ?.nationality as string | undefined;
                              const current = (profile?.fields as Record<string, unknown> | undefined)
                                ?.current_country as string | undefined;
                              const value = current ?? nationality;
                              const display = getCountryDisplay(value);
                              return display.flag
                                ? `${display.flag} ${display.label}`
                                : display.label;
                            })()}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Nationality
                          </div>
                          <div className="text-sm font-medium">
                            {(() => {
                              const nationality = (profile?.fields as Record<string, unknown> | undefined)
                                ?.nationality as string | undefined;
                              const display = getCountryDisplay(nationality);
                              return display.flag
                                ? `${display.flag} ${display.label}`
                                : display.label;
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs uppercase text-muted-foreground">
                          Tags
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Array.isArray(
                            (profile?.fields as Record<string, unknown> | undefined)?.tags
                          ) &&
                          (
                            (profile?.fields as Record<string, unknown>).tags as string[]
                          ).length > 0 ? (
                            (
                              (profile?.fields as Record<string, unknown>).tags as string[]
                            ).map((tag, idx) => (
                              <span
                                key={`tag-${idx}`}
                                className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground"
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-foreground">—</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs uppercase text-muted-foreground">
                          Summary
                        </div>
                        {profile?.summary ? (
                          <Markdown
                            content={normalizeSummaryMarkdown(String(profile.summary))}
                            className="text-sm text-foreground"
                          />
                        ) : (
                          <div className="text-sm text-foreground">—</div>
                        )}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Experience
                          </div>
                          <div className="text-sm text-foreground">
                            {(profile?.fields as Record<string, unknown> | undefined)
                              ?.experience_summary
                              ? String(
                                  (profile?.fields as Record<string, unknown>)
                                    .experience_summary
                                )
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Education
                          </div>
                          <div className="text-sm text-foreground">
                            {(profile?.fields as Record<string, unknown> | undefined)
                              ?.education
                              ? String(
                                  (profile?.fields as Record<string, unknown>).education
                                )
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Availability
                          </div>
                          <div className="text-sm text-foreground">
                            {(profile?.fields as Record<string, unknown> | undefined)
                              ?.availability_date
                              ? String(
                                  (profile?.fields as Record<string, unknown>)
                                    .availability_date
                                )
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Salary Expectation
                          </div>
                          <div className="text-sm text-foreground">
                            {(profile?.fields as Record<string, unknown> | undefined)
                              ?.salary_expectation
                              ? String(
                                  (profile?.fields as Record<string, unknown>)
                                    .salary_expectation
                                )
                              : "—"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
                          <div className="text-xs font-semibold uppercase text-emerald-700">
                            Top Strengths
                          </div>
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-emerald-800">
                            {Array.isArray(
                              (profile?.fields as Record<string, unknown> | undefined)
                                ?.strengths
                            ) &&
                            (
                              (profile?.fields as Record<string, unknown>).strengths as string[]
                            ).length > 0 ? (
                              (
                                (profile?.fields as Record<string, unknown>)
                                  .strengths as string[]
                              ).map((item, idx) => <li key={`strength-${idx}`}>{item}</li>)
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
                            {Array.isArray(
                              (profile?.fields as Record<string, unknown> | undefined)
                                ?.concerns
                            ) &&
                            (
                              (profile?.fields as Record<string, unknown>).concerns as string[]
                            ).length > 0 ? (
                              (
                                (profile?.fields as Record<string, unknown>)
                                  .concerns as string[]
                              ).map((item, idx) => <li key={`concern-${idx}`}>{item}</li>)
                            ) : (
                              <li>—</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {showRawJson ? (
                      <div className="rounded-lg border border-border bg-card p-4">
                        <pre className="whitespace-pre-wrap text-xs text-foreground">
                          {result}
                        </pre>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
                    Run an extraction to see the summary, key details, and timeline here.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="order-1 space-y-4 lg:order-1">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Upload & Transcribe
                </div>
                <div className="text-sm font-medium">
                  Audio, video, or video links
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 p-1 text-xs">
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 ${
                    uploadTab === "upload"
                      ? "bg-black text-white shadow-sm"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setUploadTab("upload")}
                >
                  Upload
                </button>
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 ${
                    uploadTab === "link"
                      ? "bg-black text-white shadow-sm"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setUploadTab("link")}
                >
                  Link
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleUploadFile(file);
                }
                event.target.value = "";
              }}
            />

            {uploadTab === "upload" ? (
              <div className="mt-4 min-h-[190px] rounded-lg border border-dashed border-border bg-background/60 p-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Image
                    src={uploadIcon}
                    alt="Upload"
                    className="h-14 w-14"
                  />
                  <div>
                    <div className="text-sm font-medium">
                      Drop files or click upload
                    </div>
                    <div className="text-xs text-muted-foreground">
                      MP3, M4A, WAV, or video audio.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-2 flex h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white shadow-sm hover:bg-black/90"
                    onClick={handlePickAudio}
                  >
                    <Image
                      src={uploadIcon}
                      alt=""
                      className="h-4 w-4 brightness-0 invert"
                    />
                    Upload file
                  </button>
                </div>

                {activeUploads.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {activeUploads.map((upload) => (
                      <div
                        key={upload.id}
                        className="rounded-md border border-border bg-card px-3 py-2"
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {upload.mode === "youtube" ? (
                              <Link2 className="h-4 w-4" />
                            ) : (
                              <FileAudio className="h-4 w-4" />
                            )}
                            <span className="font-medium text-foreground">
                              {upload.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {upload.status === "uploading" ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Uploading</span>
                              </>
                            ) : upload.status === "uploaded" ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                <span>Uploaded</span>
                              </>
                            ) : (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Transcribing</span>
                              </>
                            )}
                          </div>
                        </div>
                        {upload.status === "uploading" ? (
                          <>
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{
                                  width: `${upload.progress ?? 0}%`,
                                }}
                              />
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {upload.progress ?? 0}%
                            </div>
                          </>
                        ) : null}
                        {upload.status === "uploaded" ? (
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              className="h-9 rounded-md bg-black px-4 text-xs font-semibold text-white shadow-sm hover:bg-black/90"
                              onClick={() => handleTranscribeUpload(upload)}
                            >
                              Transcribe
                            </button>
                          </div>
                        ) : null}
                        {upload.status === "error" && upload.error ? (
                          <div className="mt-2 text-xs text-rose-600">
                            {upload.error}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 text-xs text-muted-foreground">
                    Upload a file to see progress here.
                  </div>
                )}
                {uploadError ? (
                  <div className="mt-2 text-xs text-red-600">{uploadError}</div>
                ) : null}
                {transcribeError ? (
                  <div className="mt-2 text-xs text-red-600">{transcribeError}</div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 min-h-[190px] rounded-lg border border-dashed border-border bg-background/60 p-6">
                <div className="text-sm font-medium">Video link</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <input
                    className="h-10 w-full flex-1 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Paste YouTube, Vimeo, or other video link..."
                    value={youtubeUrl}
                    onChange={(event) => setYoutubeUrl(event.target.value)}
                  />
                  <button
                    type="button"
                    className="h-10 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground shadow-sm hover:bg-accent"
                    onClick={handleTranscribeYouTube}
                    disabled={youtubeLoading || !youtubeUrl.trim()}
                  >
                    {youtubeLoading ? "Transcribing..." : "Transcribe link"}
                  </button>
                </div>
                {youtubeError ? (
                  <div className="mt-2 text-xs text-red-600">{youtubeError}</div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Powered by yt-dlp + Whisper. Supports YouTube, Vimeo, and more.
                  </div>
                )}
              </div>
            )}
          </div>

          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                          <FileAudio className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="text-lg font-semibold">Recent Files</div>
                          <div className="text-xs text-muted-foreground">
                            History of uploaded or YouTube transcriptions.
                          </div>
                        </div>
                      </div>
                  </div>

                    <div className="mt-4 overflow-x-auto">
                      {filteredUploads.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                          No uploads yet. Upload a file or paste a YouTube link.
                        </div>
                      ) : (
                        <table className="w-full min-w-[720px] text-left text-sm">
                          <thead className="text-xs uppercase text-muted-foreground">
                            <tr className="border-b border-border">
                              <th className="py-3 pr-4">Name</th>
                              <th className="py-3 pr-4">Uploaded</th>
                              <th className="py-3 pr-4">Duration</th>
                              <th className="py-3 pr-4">Mode</th>
                              <th className="py-3 pr-4">Status</th>
                              <th className="py-3 pr-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {filteredUploads.map((upload) => {
                              const uploadedAt = new Date(upload.uploadedAt).toLocaleString();
                              const statusLabel =
                                upload.status === "done"
                                  ? "Ready"
                                  : upload.status === "error"
                                  ? "Error"
                                  : upload.status === "uploaded"
                                  ? "Uploaded"
                                  : upload.status === "uploading"
                                  ? "Uploading"
                                  : "Transcribing";
                              return (
                                <tr key={upload.id} className="hover:bg-muted/40">
                                  <td className="py-3 pr-4">
                                    <div className="flex items-center gap-2">
                                      {upload.mode === "youtube" ? (
                                        <Link2 className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <FileAudio className="h-4 w-4 text-muted-foreground" />
                                      )}
                                      <div>
                                        <div className="text-sm font-medium">
                                          {upload.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {formatBytes(upload.sizeBytes)}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                                    {uploadedAt}
                                  </td>
                                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                                    {formatDuration(upload.durationSeconds)}
                                  </td>
                                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                                    {upload.mode === "youtube" ? "YouTube" : "Upload"}
                                  </td>
                                  <td className="py-3 pr-4">
                                    <div className="flex items-center gap-2 text-xs">
                                      {upload.status === "done" ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                      ) : upload.status === "error" ? (
                                        <XCircle className="h-4 w-4 text-rose-500" />
                                      ) : upload.status === "uploaded" ? (
                                        <UploadCloud className="h-4 w-4 text-slate-500" />
                                      ) : (
                                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                                      )}
                                      <span className="text-muted-foreground">
                                        {statusLabel}
                                      </span>
                                    </div>
                                    {upload.status === "uploading" ? (
                                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                          className="h-full rounded-full bg-primary transition-all"
                                          style={{
                                            width: `${upload.progress ?? 0}%`,
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                    {upload.status === "error" && upload.error ? (
                                      <div className="mt-1 text-[11px] text-rose-600">
                                        {upload.error}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="py-3 pr-2 text-right">
                                    <div className="flex items-center justify-end gap-2 text-xs">
                                      <button
                                        type="button"
                                        className="rounded-md border border-input px-3 py-1 text-xs"
                                        disabled={!upload.transcript}
                                        onClick={() => {
                                          if (upload.transcript) {
                                            setTranscript(upload.transcript);
                                            if (upload.sourceUrl) {
                                              setYoutubeUrl(upload.sourceUrl);
                                            }
                                          }
                                        }}
                                      >
                                        Open
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded-md border border-input px-3 py-1 text-xs"
                                        onClick={() => removeUpload(upload.id)}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </section>

          {candidates.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Saved Candidates</h2>
                  <div className="text-xs text-muted-foreground">
                    Extracted profiles ready to review.
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-input px-3 py-1.5 text-xs"
                  onClick={() => persistCandidates([])}
                >
                  Clear history
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Created</th>
                      <th className="py-3 pr-4">Role</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                  <tbody className="divide-y divide-border">
                    {candidates.map((candidate) => {
                      const email =
                        String(getField(candidate.profile, "email") ?? "")
                          .trim()
                          .toLowerCase();
                      const inPipeline =
                        pipelineIds.has(`intake-${candidate.id}`) ||
                        (email ? pipelineEmails.has(email) : false);
                      return (
                        <tr
                          key={candidate.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => {
                            setSelectedCandidateId(candidate.id);
                            setShowCandidateModal(true);
                            setShowCandidateJson(false);
                          }}
                        >
                          <td className="py-3 pr-4">
                            <div className="text-sm font-semibold">
                              {String(
                                getField(candidate.profile, "full_name") ?? "Unknown"
                              )}
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">
                            {new Date(candidate.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">
                            {String(
                              getField(candidate.profile, "desired_position") ?? "—"
                            )}
                          </td>
                    <td className="py-3 pr-4">
                        {inPipeline ? (
                          <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                            In Pipeline
                          </span>
                        ) : (
                          <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                            Draft
                          </span>
                        )}
                          </td>
                          <td className="py-3 pr-2 text-right">
                            <div className="flex items-center justify-end gap-2 text-xs">
                              <button
                                type="button"
                                className="rounded-md border border-input px-3 py-1 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedCandidateId(candidate.id);
                                  setShowCandidateModal(true);
                                  setShowCandidateJson(false);
                                }}
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-input px-3 py-1 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeCandidate(candidate.id);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedCandidate && showCandidateModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-4xl rounded-xl border border-border bg-card shadow-lg">
                    <div className="flex items-center justify-between border-b border-border px-6 py-4">
                      <div>
                        <h2 className="text-lg font-semibold">Candidate details</h2>
                        <p className="text-sm text-muted-foreground">
                          {String(
                            (editDraft?.full_name || "").trim() ||
                              getField(selectedCandidate.profile, "full_name") ||
                              "—"
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const email = String(
                            editDraft?.email ||
                              getField(selectedCandidate.profile, "email") ||
                              ""
                          )
                            .trim()
                            .toLowerCase();
                          const pipelineId = `intake-${selectedCandidate.id}`;
                          const inPipeline =
                            pipelineIds.has(pipelineId) ||
                            (email ? pipelineEmails.has(email) : false);
                          return (
                            <button
                              type="button"
                              className={`rounded-md border px-3 py-1.5 text-xs ${
                                inPipeline
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-input"
                              }`}
                              onClick={() => {
                                if (!inPipeline) addSelectedToPipeline();
                              }}
                              disabled={inPipeline || pipelineLoading}
                            >
                              {pipelineLoading
                                ? "Adding..."
                                : inPipeline
                                ? "In Pipeline"
                                : "Add to Pipeline"}
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          className="rounded-md border border-input px-3 py-1.5 text-xs"
                          onClick={saveDraftToProfile}
                        >
                          Save edits
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-input px-3 py-1.5 text-xs"
                          onClick={() => setShowCandidateModal(false)}
                        >
                          Close
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[75vh] overflow-y-auto px-6 py-4 text-sm">
                      {pipelineMessage ? (
                        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                          {pipelineMessage}
                        </div>
                      ) : null}
                    <div className="rounded-lg border border-border bg-card p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Name
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-2 rounded-md px-3 py-1 ${
                              editingField === "full_name"
                                ? "bg-background ring-1 ring-primary/40"
                                : "bg-muted/30"
                            }`}
                          >
                            <input
                              ref={(el) => {
                                fieldRefs.current.full_name = el;
                              }}
                              className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
                              value={editDraft?.full_name ?? ""}
                              onChange={(event) =>
                                setEditDraft((prev) => ({
                                  ...(prev ?? buildDraft(selectedCandidate)),
                                  full_name: event.target.value,
                                }))
                              }
                              readOnly={editingField !== "full_name"}
                              placeholder="Full name"
                            />
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                              onClick={() => toggleFieldEdit("full_name")}
                            >
                              {editingField === "full_name" ? "Save" : "Edit"}
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Desired position
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-2 rounded-md px-3 py-1 ${
                              editingField === "desired_position"
                                ? "bg-background ring-1 ring-primary/40"
                                : "bg-muted/30"
                            }`}
                          >
                            <input
                              ref={(el) => {
                                fieldRefs.current.desired_position = el;
                              }}
                              className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
                              value={editDraft?.desired_position ?? ""}
                              onChange={(event) =>
                                setEditDraft((prev) => ({
                                  ...(prev ?? buildDraft(selectedCandidate)),
                                  desired_position: event.target.value,
                                }))
                              }
                              readOnly={editingField !== "desired_position"}
                              placeholder="Desired position"
                            />
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                              onClick={() => toggleFieldEdit("desired_position")}
                            >
                              {editingField === "desired_position" ? "Save" : "Edit"}
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Email
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-2 rounded-md px-3 py-1 ${
                              editingField === "email"
                                ? "bg-background ring-1 ring-primary/40"
                                : "bg-muted/30"
                            }`}
                          >
                            <input
                              ref={(el) => {
                                fieldRefs.current.email = el;
                              }}
                              className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
                              value={editDraft?.email ?? ""}
                              onChange={(event) =>
                                setEditDraft((prev) => ({
                                  ...(prev ?? buildDraft(selectedCandidate)),
                                  email: event.target.value,
                                }))
                              }
                              readOnly={editingField !== "email"}
                              placeholder="Email"
                            />
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                              onClick={() => toggleFieldEdit("email")}
                            >
                              {editingField === "email" ? "Save" : "Edit"}
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Phone
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-2 rounded-md px-3 py-1 ${
                              editingField === "phone"
                                ? "bg-background ring-1 ring-primary/40"
                                : "bg-muted/30"
                            }`}
                          >
                            <input
                              ref={(el) => {
                                fieldRefs.current.phone = el;
                              }}
                              className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
                              value={editDraft?.phone ?? ""}
                              onChange={(event) =>
                                setEditDraft((prev) => ({
                                  ...(prev ?? buildDraft(selectedCandidate)),
                                  phone: event.target.value,
                                }))
                              }
                              readOnly={editingField !== "phone"}
                              placeholder="Phone"
                            />
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                              onClick={() => toggleFieldEdit("phone")}
                            >
                              {editingField === "phone" ? "Save" : "Edit"}
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Nationality
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-2 rounded-md px-3 py-1 ${
                              editingField === "nationality"
                                ? "bg-background ring-1 ring-primary/40"
                                : "bg-muted/30"
                            }`}
                          >
                            {(() => {
                              const display = getCountryDisplay(editDraft?.nationality);
                              return display.flag ? (
                                <span className="text-base">{display.flag}</span>
                              ) : null;
                            })()}
                            <input
                              ref={(el) => {
                                fieldRefs.current.nationality = el;
                              }}
                              className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
                              value={editDraft?.nationality ?? ""}
                              onChange={(event) =>
                                setEditDraft((prev) => ({
                                  ...(prev ?? buildDraft(selectedCandidate)),
                                  nationality: event.target.value,
                                }))
                              }
                              readOnly={editingField !== "nationality"}
                              placeholder="Nationality"
                            />
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                              onClick={() => toggleFieldEdit("nationality")}
                            >
                              {editingField === "nationality" ? "Save" : "Edit"}
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Current Country
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-2 rounded-md px-3 py-1 ${
                              editingField === "country"
                                ? "bg-background ring-1 ring-primary/40"
                                : "bg-muted/30"
                            }`}
                          >
                            {(() => {
                              const display = getCountryDisplay(editDraft?.country);
                              return display.flag ? (
                                <span className="text-base">{display.flag}</span>
                              ) : null;
                            })()}
                            <input
                              ref={(el) => {
                                fieldRefs.current.country = el;
                              }}
                              className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
                              value={editDraft?.country ?? ""}
                              onChange={(event) =>
                                setEditDraft((prev) => ({
                                  ...(prev ?? buildDraft(selectedCandidate)),
                                  country: event.target.value,
                                }))
                              }
                              readOnly={editingField !== "country"}
                              placeholder="Country"
                            />
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                              onClick={() => toggleFieldEdit("country")}
                            >
                              {editingField === "country" ? "Save" : "Edit"}
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Availability
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-2 rounded-md px-3 py-1 ${
                              editingField === "availability_date"
                                ? "bg-background ring-1 ring-primary/40"
                                : "bg-muted/30"
                            }`}
                          >
                            <input
                              ref={(el) => {
                                fieldRefs.current.availability_date = el;
                              }}
                              className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
                              value={editDraft?.availability_date ?? ""}
                              onChange={(event) =>
                                setEditDraft((prev) => ({
                                  ...(prev ?? buildDraft(selectedCandidate)),
                                  availability_date: event.target.value,
                                }))
                              }
                              readOnly={editingField !== "availability_date"}
                              placeholder="Availability"
                            />
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                              onClick={() => toggleFieldEdit("availability_date")}
                            >
                              {editingField === "availability_date" ? "Save" : "Edit"}
                            </button>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Salary Expectation
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-2 rounded-md px-3 py-1 ${
                              editingField === "salary_expectation"
                                ? "bg-background ring-1 ring-primary/40"
                                : "bg-muted/30"
                            }`}
                          >
                            <input
                              ref={(el) => {
                                fieldRefs.current.salary_expectation = el;
                              }}
                              className="h-9 flex-1 bg-transparent text-sm focus:outline-none"
                              value={editDraft?.salary_expectation ?? ""}
                              onChange={(event) =>
                                setEditDraft((prev) => ({
                                  ...(prev ?? buildDraft(selectedCandidate)),
                                  salary_expectation: event.target.value,
                                }))
                              }
                              readOnly={editingField !== "salary_expectation"}
                              placeholder="Salary expectation"
                            />
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                              onClick={() => toggleFieldEdit("salary_expectation")}
                            >
                              {editingField === "salary_expectation" ? "Save" : "Edit"}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                          <span>Tags</span>
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-input text-[14px] text-muted-foreground hover:text-foreground"
                            onClick={() => setShowTagInput((prev) => !prev)}
                            aria-label="Add tag"
                          >
                            +
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(editDraft?.tags ?? []).length > 0 ? (
                            (editDraft?.tags ?? []).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground"
                              >
                                {tag}
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => handleRemoveTag(tag)}
                                  aria-label={`Remove ${tag}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No tags yet.
                            </span>
                          )}
                        </div>
                        {showTagInput ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              className="h-9 w-48 rounded-md border border-input bg-background px-3 text-xs"
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
                              className="h-9 rounded-md border border-input px-3 text-xs text-foreground"
                              onClick={handleAddTag}
                            >
                              Add
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4">
                        <div className="text-xs uppercase text-muted-foreground">
                          Summary
                        </div>
                        {editDraft?.summary ? (
                          <div className="mt-2 rounded-md border border-border bg-card px-3 py-2">
                            <Markdown
                              content={normalizeSummaryMarkdown(editDraft.summary)}
                              className="text-sm text-foreground"
                            />
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-muted-foreground">—</div>
                        )}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Experience
                          </div>
                          <textarea
                            className="mt-2 min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={editDraft?.experience_summary ?? ""}
                            onChange={(event) =>
                              setEditDraft((prev) => ({
                                ...(prev ?? buildDraft(selectedCandidate)),
                                experience_summary: event.target.value,
                              }))
                            }
                            placeholder="Experience summary"
                          />
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">
                            Education
                          </div>
                          <textarea
                            className="mt-2 min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={editDraft?.education ?? ""}
                            onChange={(event) =>
                              setEditDraft((prev) => ({
                                ...(prev ?? buildDraft(selectedCandidate)),
                                education: event.target.value,
                              }))
                            }
                            placeholder="Education"
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
                          <div className="text-xs font-semibold uppercase text-emerald-700">
                            Top Strengths
                          </div>
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-emerald-800">
                            {Array.isArray(
                              (selectedCandidate.profile.fields as Record<string, unknown>)
                                ?.strengths
                            ) &&
                            (
                              (selectedCandidate.profile.fields as Record<string, unknown>)
                                .strengths as string[]
                            ).length > 0 ? (
                              (
                                (selectedCandidate.profile.fields as Record<string, unknown>)
                                  .strengths as string[]
                              ).map((item, idx) => (
                                <li key={`strength-modal-${idx}`}>{item}</li>
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
                            {Array.isArray(
                              (selectedCandidate.profile.fields as Record<string, unknown>)
                                ?.concerns
                            ) &&
                            (
                              (selectedCandidate.profile.fields as Record<string, unknown>)
                                .concerns as string[]
                            ).length > 0 ? (
                              (
                                (selectedCandidate.profile.fields as Record<string, unknown>)
                                  .concerns as string[]
                              ).map((item, idx) => (
                                <li key={`concern-modal-${idx}`}>{item}</li>
                              ))
                            ) : (
                              <li>—</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs uppercase text-muted-foreground">
                          Raw JSON
                        </div>
                        <button
                          type="button"
                          className="rounded-md border border-input px-3 py-1 text-xs"
                          onClick={() => setShowCandidateJson((prev) => !prev)}
                        >
                          {showCandidateJson ? "Hide" : "Show"}
                        </button>
                      </div>
                      {showCandidateJson ? (
                        <pre className="mt-3 whitespace-pre-wrap text-xs text-foreground">
                          {JSON.stringify(selectedCandidate.profile, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
        </aside>
      </div>

    </div>
  );
}
