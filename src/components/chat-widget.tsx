"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MessageCircle, Send as SendIcon, X } from "lucide-react";

const OPEN_PROFILE_EVENT = "pipeline-open-profile";
const TEAM_CHAT_EVENT = "app-team-chat";
const TEAM_CHAT_UNREAD_EVENT = "app-team-chat-unread";

const resolveDisplayName = (member: { name?: string | null; email?: string | null }) => {
  if (member.name && member.name.trim()) return member.name.trim();
  const email = member.email ?? "";
  if (email.includes("@")) return email.split("@")[0];
  return "User";
};

const resolveUserName = (user: { user_metadata?: Record<string, unknown> | null; email?: string | null }) => {
  const metadata = user.user_metadata ?? {};
  const first = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const last = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  const fallback =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    (typeof metadata.display_name === "string" && metadata.display_name.trim()) ||
    "";
  if (fallback) return fallback;
  const email = user.email ?? "";
  return email.split("@")[0] || "You";
};

const formatTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
};

type Member = {
  user_id: string;
  email: string | null;
  name: string | null;
  avatar_path: string | null;
  avatar_url?: string | null;
};

type Thread = {
  id: string;
  name: string | null;
  is_group: boolean;
  created_by: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string | null;
  memberIds: string[];
};

type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string | null;
};

type MentionChunk = { type: "mention"; label: string };
type MentionLabel = { label: string; lower: string };
type ProfileLinkChunk = {
  type: "profile_link";
  href: string;
  shareSlug: string;
  label: string;
};
type CandidateAvatarTheme = { bgClass: string; textClass: string };
type ComposerProfileEntity = {
  id: string;
  shareSlug: string;
  href: string;
  label: string;
  start: number;
  end: number;
};

const PROFILE_LINK_PATTERN =
  /https?:\/\/[^\s]+|\/pipeline\?profile=\d{8}-[a-z0-9-]+|pipeline\?profile=\d{8}-[a-z0-9-]+|\[\[\s*profile\s*:\s*\d{8}-[a-z0-9-]+\s*\]\]/gi;
const PROFILE_SHARE_PATTERN = /^\d{8}-[a-z0-9-]+$/i;
const PROFILE_TOKEN_PATTERN = /\[\[\s*profile\s*:\s*(\d{8}-[a-z0-9-]+)\s*\]\]/i;

const encodeProfileToken = (shareSlug: string) => `[[profile:${shareSlug}]]`;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
};

const formatProfileLabel = (shareSlug: string) => {
  const [, ...slugParts] = shareSlug.split("-");
  const rawLabel = slugParts.join(" ").trim();
  if (!rawLabel) return "Candidate profile";
  return rawLabel.replace(/\b\w/g, (char) => char.toUpperCase());
};

const resolveProfileLink = (value: string): Omit<ProfileLinkChunk, "type"> | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[[")) {
    const match = trimmed.match(PROFILE_TOKEN_PATTERN);
    const shareSlug = match?.[1]?.toLowerCase() ?? "";
    if (!PROFILE_SHARE_PATTERN.test(shareSlug)) return null;
    return {
      href: `/pipeline?profile=${shareSlug}`,
      shareSlug,
      label: formatProfileLabel(shareSlug),
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://chat.local");
  } catch {
    return null;
  }

  if (parsed.pathname !== "/pipeline") return null;

  const shareSlug = (parsed.searchParams.get("profile") ?? "").toLowerCase();
  if (!PROFILE_SHARE_PATTERN.test(shareSlug)) return null;

  return {
    href: `/pipeline?profile=${shareSlug}`,
    shareSlug,
    label: formatProfileLabel(shareSlug),
  };
};

const parseAvatarTheme = (avatarClass?: string | null): CandidateAvatarTheme | null => {
  if (!avatarClass) return null;
  const tokens = avatarClass.split(/\s+/).filter(Boolean);
  const bgClass = tokens.find((token) => token.startsWith("bg-"));
  const textClass = tokens.find((token) => token.startsWith("text-"));
  if (!bgClass || !textClass) return null;
  return { bgClass, textClass };
};

const resolveCandidateThemeForShareSlug = (shareSlug: string): CandidateAvatarTheme | null => {
  if (typeof window === "undefined") return null;
  const mapping = (
    window as Window &
      typeof globalThis & {
        __pipelineCandidateAvatarClassByShareSlug?: Record<string, string>;
      }
  ).__pipelineCandidateAvatarClassByShareSlug;
  const avatarClass = mapping?.[shareSlug] ?? null;
  return parseAvatarTheme(avatarClass);
};

const splitProfileLinks = (text: string): Array<string | ProfileLinkChunk> => {
  if (!/profile=|\[\[\s*profile\s*:/i.test(text)) return [text];

  const chunks: Array<string | ProfileLinkChunk> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(PROFILE_LINK_PATTERN)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const trailing = raw.match(/[),.;!?]+$/)?.[0] ?? "";
    const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
    const resolved = resolveProfileLink(candidate);

    if (!resolved) continue;

    if (start > lastIndex) {
      chunks.push(text.slice(lastIndex, start));
    }

    chunks.push({ type: "profile_link", ...resolved });

    if (trailing) {
      chunks.push(trailing);
    }

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    chunks.push(text.slice(lastIndex));
  }

  return chunks.length > 0 ? chunks : [text];
};

const extractProfileLinks = (text: string) => {
  const unique = new Map<string, Omit<ProfileLinkChunk, "type">>();

  for (const chunk of splitProfileLinks(text)) {
    if (typeof chunk === "string") continue;
    unique.set(chunk.shareSlug, {
      href: chunk.href,
      shareSlug: chunk.shareSlug,
      label: chunk.label,
    });
  }

  return Array.from(unique.values());
};

const toThreadPreview = (text?: string | null) => {
  const source = text?.trim() ?? "";
  if (!source) return "No messages yet";

  return splitProfileLinks(source)
    .map((chunk) =>
      typeof chunk === "string" ? chunk : `Profile: ${chunk.label}`
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
};

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
  onDark?: boolean
) =>
  splitMentions(text, labels).map((chunk, index) => {
    if (typeof chunk === "string") {
      return <span key={`txt-${index}`}>{chunk}</span>;
    }

    return (
      <span
        key={`mention-${index}`}
        className={`mx-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          onDark ? "bg-cyan-300 text-slate-950" : "bg-cyan-100 text-cyan-900"
        }`}
      >
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
            onDark ? "bg-cyan-500 text-white" : "bg-cyan-200 text-cyan-900"
          }`}
        >
          @
        </span>
      <span>{chunk.label}</span>
    </span>
  );
  });

function ProfileLinkPill({
  href,
  shareSlug,
  label,
  compact = false,
  onDark = false,
  theme,
  onOpen,
}: {
  href: string;
  shareSlug: string;
  label: string;
  compact?: boolean;
  onDark?: boolean;
  theme?: CandidateAvatarTheme | null;
  onOpen?: (href: string, shareSlug: string) => void;
}) {
  const shellClass = compact
    ? theme
      ? `mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200/60 pl-[8px] pr-[12px] py-[5px] text-slate-950 align-middle ${theme.bgClass}`
      : onDark
        ? "mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-cyan-300/60 bg-cyan-300/95 pl-[8px] pr-[12px] py-[5px] text-slate-950 align-middle"
        : "mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-cyan-300/70 bg-cyan-100 pl-[8px] pr-[12px] py-[5px] text-cyan-950 align-middle"
    : theme
      ? `my-1 inline-flex max-w-full items-center gap-2 rounded-2xl border border-slate-200/60 px-3 py-2 text-slate-950 shadow-sm ${theme.bgClass}`
      : "my-1 inline-flex max-w-full items-center gap-2 rounded-2xl border border-cyan-300/70 bg-cyan-50 px-3 py-2 text-cyan-950 shadow-sm";
  const iconClass = compact
    ? onDark
      ? "inline-flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-cyan-600 text-[8px] font-bold text-white"
      : "inline-flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-cyan-500 text-[8px] font-bold text-white"
    : "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-[11px] font-bold text-white";
  const labelClass = compact
    ? "block truncate text-[10px] font-semibold leading-none"
    : "block truncate text-sm font-semibold";
  const themedIconClass = theme
    ? compact
      ? `inline-flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-white/80 text-[8px] font-bold ${theme.textClass}`
      : `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 text-[11px] font-bold ${theme.textClass}`
    : null;

  return (
    <a
      href={href}
      onClick={(event) => {
        if (!onOpen) return;
        event.preventDefault();
        onOpen(href, shareSlug);
      }}
      className={`${shellClass} text-left transition hover:border-cyan-400 hover:bg-cyan-100`}
    >
      <span className={themedIconClass ?? iconClass}>
        P
      </span>
      <span className={`min-w-0 ${labelClass}`}>{label}</span>
    </a>
  );
}

const renderRichBody = (
  text: string,
  labels: MentionLabel[],
  onDark?: boolean,
  onOpenProfile?: (href: string, shareSlug: string) => void
) => {
  const chunks = splitProfileLinks(text);
  const hasPlainText = chunks.some(
    (chunk) => typeof chunk === "string" && chunk.trim().length > 0
  );

  return chunks.map((chunk, index) => {
    if (typeof chunk === "string") {
      return (
        <Fragment key={`text-${index}`}>
          {renderMentionedBody(chunk, labels, onDark)}
        </Fragment>
      );
    }

    return (
      <ProfileLinkPill
        key={`profile-${chunk.shareSlug}-${index}`}
        href={chunk.href}
        shareSlug={chunk.shareSlug}
        label={chunk.label}
        compact={hasPlainText}
        onDark={onDark}
        theme={resolveCandidateThemeForShareSlug(chunk.shareSlug)}
        onOpen={onOpenProfile}
      />
    );
  });
};

const renderComposerHighlight = (text: string, entities: ComposerProfileEntity[]) => {
  if (entities.length === 0) return text;

  const sorted = [...entities]
    .filter((entity) => entity.start >= 0 && entity.end > entity.start)
    .sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  sorted.forEach((entity) => {
    if (entity.start > cursor) {
      nodes.push(text.slice(cursor, entity.start));
    }

    nodes.push(
      <span
        key={`composer-entity-${entity.id}-${entity.start}`}
        className="rounded-sm bg-cyan-100 text-cyan-900"
      >
        {text.slice(entity.start, entity.end)}
      </span>
    );

    cursor = entity.end;
  });

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
};

const getInitials = (member: { name?: string | null; email?: string | null }) => {
  const displayName = resolveDisplayName(member);
  const parts = displayName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

function AvatarThumb({
  member,
  className,
}: {
  member?: Member | null;
  className?: string;
}) {
  const classes = className ?? "h-11 w-11";
  const avatarUrl = member?.avatar_url?.trim();

  if (avatarUrl) {
    return (
      <div
        className={`${classes} shrink-0 rounded-full border border-white/80 bg-slate-200 bg-cover bg-center shadow-sm`}
        style={{ backgroundImage: `url("${avatarUrl}")` }}
        aria-label={resolveDisplayName(member ?? { name: null, email: null })}
      />
    );
  }

  return (
    <div
      className={`${classes} shrink-0 rounded-full border border-white/80 bg-slate-900 text-[11px] font-semibold text-white shadow-sm flex items-center justify-center`}
      aria-label={resolveDisplayName(member ?? { name: null, email: null })}
    >
      {getInitials(member ?? { name: null, email: null })}
    </div>
  );
}

export function ChatWidget() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"threads" | "messages" | "new">("threads");
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [composerEntities, setComposerEntities] = useState<ComposerProfileEntity[]>([]);
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerHighlightRef = useRef<HTMLDivElement | null>(null);
  const composerEntityIdRef = useRef(1);
  const mentionCaretRef = useRef<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const lastLoadedAtRef = useRef(0);
  const hydratePromiseRef = useRef<Promise<string | null> | null>(null);
  const avatarsLoadedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<number>(0);

  const lastSeenKey = useMemo(() => {
    if (!currentUser?.id) return null;
    return `teamChat:lastSeen:${currentUser.id}`;
  }, [currentUser?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (
      event: Event
    ) => {
      const detail = (event as CustomEvent<{
        open?: boolean;
        toggle?: boolean;
        view?: "threads" | "messages" | "new";
      }>).detail;

      if (detail?.view) {
        setView(detail.view);
      } else {
        setView("threads");
      }

      if (detail?.toggle) {
        void ensureAudioContext().catch(() => null);
        setOpen((prev) => !prev);
        return;
      }

      if (typeof detail?.open === "boolean") {
        if (detail.open) {
          void ensureAudioContext().catch(() => null);
        }
        setOpen(detail.open);
        return;
      }

      void ensureAudioContext().catch(() => null);
      setOpen(true);
    };

    window.addEventListener(TEAM_CHAT_EVENT, handler as EventListener);
    return () => window.removeEventListener(TEAM_CHAT_EVENT, handler as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!lastSeenKey) return;

    const raw = window.localStorage.getItem(lastSeenKey);
    if (raw) {
      const parsed = Number(raw);
      setLastSeenAt(Number.isFinite(parsed) ? parsed : 0);
      return;
    }

    const now = Date.now();
    window.localStorage.setItem(lastSeenKey, String(now));
    setLastSeenAt(now);
  }, [lastSeenKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!lastSeenKey) return;
    if (!open) return;

    const now = Date.now();
    window.localStorage.setItem(lastSeenKey, String(now));
    setLastSeenAt(now);
  }, [open, lastSeenKey]);

  const unreadThreadCount = useMemo(() => {
    if (!currentUser?.id) return 0;
    if (!lastSeenAt) return 0;

    return threads.filter((thread) => {
      const ms = thread.last_message_at ? new Date(thread.last_message_at).getTime() : 0;
      return Number.isFinite(ms) && ms > lastSeenAt;
    }).length;
  }, [threads, lastSeenAt, currentUser?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!currentUser?.id) return;
    window.dispatchEvent(
      new CustomEvent(TEAM_CHAT_UNREAD_EVENT, {
        detail: { count: unreadThreadCount },
      })
    );
  }, [unreadThreadCount, currentUser?.id]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  };

  const resizeComposer = (node?: HTMLTextAreaElement | null) => {
    const el = node ?? messageInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 140; // ~6 lines
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  useEffect(() => {
    if (!open || view !== "messages") return;
    resizeComposer();
  }, [open, view, activeThreadId, messageDraft]);

  const isMessagesNearBottom = () => {
    const node = messagesScrollRef.current;
    if (!node) return true;
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    return remaining < 140;
  };

  const ensureAudioContext = async () => {
    if (typeof window === "undefined") return null;

    const browserWindow = window as Window &
      typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };
    const AudioContextCtor =
      browserWindow.AudioContext ?? browserWindow.webkitAudioContext;

    if (!AudioContextCtor) return null;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  };

  const playNotificationTone = async () => {
    const context = await ensureAudioContext().catch(() => null);
    if (!context) return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
  };

  const loadMembers = async (
    userId: string,
    includeAvatars = false,
    throwOnError = false
  ) => {
    try {
      const query = includeAvatars ? "?include_avatars=1" : "";
      const res = await fetch(`/api/chat/members${query}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load members.");
      }
      const list = (data?.members as Member[] | null) ?? [];
      setMembers((prev) => {
        const prevMap = new Map(prev.map((member) => [member.user_id, member]));
        return list.map((member) => {
          const previous = prevMap.get(member.user_id);
          return {
            ...previous,
            ...member,
            avatar_url: member.avatar_url ?? previous?.avatar_url ?? null,
          };
        });
      });
      if (includeAvatars) {
        avatarsLoadedRef.current = true;
      }
      if (!newMemberIds.length) {
        setNewMemberIds(
          list
            .filter((item) => item.user_id !== userId)
            .slice(0, 1)
            .map((item) => item.user_id)
        );
      }
      return true;
    } catch (error) {
      if (throwOnError) {
        throw new Error(getErrorMessage(error, "Failed to load members."));
      }
      return false;
    }
  };

  const loadThreads = async (userId: string) => {
    const { data: memberships, error: membershipError } = await supabase
      .from("chat_thread_members")
      .select("thread_id")
      .eq("user_id", userId);

    if (membershipError) throw membershipError;
    const membershipRows = (memberships as { thread_id: string }[] | null) ?? [];
    const threadIds = membershipRows.map((row) => row.thread_id);
    if (threadIds.length === 0) {
      setThreads([]);
      return;
    }

    const { data: threadRows, error: threadsError } = await supabase
      .from("chat_threads")
      .select("id, name, is_group, created_by, last_message_at, last_message_preview, created_at")
      .in("id", threadIds);

    if (threadsError) throw threadsError;

    const { data: threadMembers, error: membersError } = await supabase
      .from("chat_thread_members")
      .select("thread_id, user_id")
      .in("thread_id", threadIds);

    if (membersError) throw membersError;

    const memberMap = new Map<string, string[]>();
    (threadMembers as { thread_id: string; user_id: string }[] | null)?.forEach((row) => {
      const list = memberMap.get(row.thread_id) ?? [];
      list.push(row.user_id);
      memberMap.set(row.thread_id, list);
    });

    const nextThreads = ((threadRows as Omit<Thread, "memberIds">[] | null) ?? []).map((thread) => ({
      ...thread,
      memberIds: memberMap.get(thread.id) ?? [],
    }));

    nextThreads.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

    setThreads(nextThreads);
  };

  const loadMessages = async (threadId: string) => {
    const { data, error: messagesError } = await supabase
      .from("chat_messages")
      .select("id, thread_id, sender_id, body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;
    setMessages((data as Message[] | null) ?? []);
    scrollToBottom();
  };

  const hydrateChat = async ({
    showSpinner = false,
    force = false,
  }: {
    showSpinner?: boolean;
    force?: boolean;
  } = {}) => {
    const hasCachedData = Boolean(currentUser) && (threads.length > 0 || members.length > 0);
    const isFresh = Date.now() - lastLoadedAtRef.current < 60_000;

    if (!force && hasCachedData && isFresh) {
      return currentUser?.id ?? null;
    }

    if (hydratePromiseRef.current) {
      return hydratePromiseRef.current;
    }

    const shouldShowSpinner = showSpinner && !hasCachedData;
    if (shouldShowSpinner) {
      setLoading(true);
    }
    if (showSpinner) {
      setError(null);
    }

    hydratePromiseRef.current = (async () => {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data?.user) {
        throw userError ?? new Error("Not authenticated");
      }

      const nextUser = {
        id: data.user.id,
        name: resolveUserName(data.user),
      };
      setCurrentUser(nextUser);

      const [membersResult, threadsResult] = await Promise.allSettled([
        loadMembers(data.user.id, false, showSpinner),
        loadThreads(data.user.id),
      ]);

      if (threadsResult.status === "rejected") {
        throw threadsResult.reason;
      }

      if (membersResult.status === "rejected" && showSpinner) {
        throw membersResult.reason;
      }

      lastLoadedAtRef.current = Date.now();

      if (!avatarsLoadedRef.current) {
        void loadMembers(data.user.id, true).catch(() => {});
      }

      return nextUser.id;
    })();

    try {
      return await hydratePromiseRef.current;
    } catch (err) {
      if (!hasCachedData || showSpinner) {
        setError(getErrorMessage(err, "Unable to load chat."));
      }
      return null;
    } finally {
      hydratePromiseRef.current = null;
      if (shouldShowSpinner) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const timer = window.setTimeout(() => {
      if (!mounted) return;
      void hydrateChat();
    }, 300);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [supabase]);

  useEffect(() => {
    if (!open) return;

    const hasCachedData = Boolean(currentUser) && (threads.length > 0 || members.length > 0);
    const isFresh = Date.now() - lastLoadedAtRef.current < 60_000;

    void hydrateChat({
      showSpinner: !hasCachedData,
      force: !isFresh,
    });
  }, [open, currentUser, threads.length, members.length, supabase]);

  useEffect(() => {
    if (!activeThreadId) return;
    let active = true;
    loadMessages(activeThreadId).catch((err) => {
      if (active) setError(getErrorMessage(err, "Unable to load messages."));
    });
    const channel = supabase
      .channel(`chat-thread-${activeThreadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${activeThreadId}`,
        },
        (payload) => {
          const next = payload.new as Message;
          const shouldScroll = isMessagesNearBottom();
          setMessages((prev) => {
            if (prev.some((item) => item.id === next.id)) return prev;
            return [...prev, next];
          });
          if (shouldScroll) {
            scrollToBottom();
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [activeThreadId, supabase]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!open) return;
    if (!currentUser?.id) return;
    if (document.visibilityState === "hidden") return;

    if (view === "threads") {
      const interval = window.setInterval(() => {
        void loadThreads(currentUser.id).catch(() => null);
      }, 6_000);
      return () => window.clearInterval(interval);
    }

    if (view !== "messages" || !activeThreadId) return;

    const interval = window.setInterval(() => {
      const since = messages.length > 0 ? messages[messages.length - 1]?.created_at : null;
      let query = supabase
        .from("chat_messages")
        .select("id, thread_id, sender_id, body, created_at")
        .eq("thread_id", activeThreadId)
        .order("created_at", { ascending: true });

      if (since) {
        query = query.gt("created_at", since);
      } else {
        query = query.limit(50);
      }

      void query.then(({ data, error }) => {
        if (error) return;
        const incoming = (data as Message[] | null) ?? [];
        if (incoming.length === 0) return;
        const shouldScroll = isMessagesNearBottom();
        setMessages((prev) => {
          const ids = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const item of incoming) {
            if (!ids.has(item.id)) merged.push(item);
          }
          return merged;
        });
        if (shouldScroll) {
          scrollToBottom();
        }
      });
    }, 4_000);

    return () => window.clearInterval(interval);
  }, [open, view, activeThreadId, currentUser?.id, supabase, messages]);

  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel(`chat-notifications-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const next = payload.new as Message;
          if (next.sender_id === currentUser.id) return;

          void playNotificationTone();
          void loadThreads(currentUser.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, supabase]);

  const getThreadTitle = (thread: Thread) => {
    if (thread.is_group) return thread.name?.trim() || "Group chat";
    const otherId = thread.memberIds.find((id) => id !== currentUser?.id);
    if (!otherId) return "Direct chat";
    const member = members.find((item) => item.user_id === otherId);
    return resolveDisplayName(member ?? { name: null, email: null });
  };

  const getThreadAvatarMembers = (thread: Thread) => {
    const orderedIds = thread.is_group
      ? thread.memberIds.filter((id) => id !== currentUser?.id)
      : [thread.memberIds.find((id) => id !== currentUser?.id) ?? currentUser?.id ?? ""];

    return orderedIds
      .filter(Boolean)
      .map((id) => members.find((member) => member.user_id === id) ?? null)
      .slice(0, thread.is_group ? 3 : 1);
  };

  const getThreadSubtitle = (thread: Thread) => {
    if (!thread.is_group) return "Direct message";
    const memberCount = thread.memberIds.filter((id) => id !== currentUser?.id).length + 1;
    return `${memberCount} members`;
  };

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;

  const mentionableMembers = activeThread?.is_group
    ? activeThread.memberIds
        .filter((id) => id !== currentUser?.id)
        .map((id) => members.find((member) => member.user_id === id) ?? null)
        .filter((member): member is Member => Boolean(member))
    : [];

  const mentionLabels: MentionLabel[] = (activeThread?.memberIds ?? [])
    .map((id) => members.find((member) => member.user_id === id) ?? null)
    .filter((member): member is Member => Boolean(member))
    .map((member) => {
      const label = resolveDisplayName(member);
      return { label, lower: label.toLowerCase() };
    });

  const mentionOptions = (() => {
    if (!activeThread?.is_group || !mentionOpen) return [];

    const cleanedQuery = mentionQuery.trim().toLowerCase();
    return mentionableMembers
      .map((member) => ({
        ...member,
        label: resolveDisplayName(member),
      }))
      .filter((member) => {
        if (!cleanedQuery) return true;
        const name = member.name?.toLowerCase() ?? "";
        const email = member.email?.toLowerCase() ?? "";
        const label = member.label.toLowerCase();
        return (
          name.includes(cleanedQuery) ||
          email.includes(cleanedQuery) ||
          label.includes(cleanedQuery)
        );
      })
      .sort((a, b) => {
        if (!cleanedQuery) return a.label.localeCompare(b.label);
        const aStarts = a.label.toLowerCase().startsWith(cleanedQuery);
        const bStarts = b.label.toLowerCase().startsWith(cleanedQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.label.localeCompare(b.label);
      })
      .slice(0, 6);
  })();

  const activeMentionIndex =
    mentionOptions.length === 0 ? 0 : Math.min(mentionIndex, mentionOptions.length - 1);

  const draftProfileLinks = useMemo(() => {
    const merged = new Map<string, Omit<ProfileLinkChunk, "type">>();
    composerEntities.forEach((entity) => {
      merged.set(entity.shareSlug, {
        href: entity.href,
        shareSlug: entity.shareSlug,
        label: entity.label,
      });
    });
    extractProfileLinks(messageDraft).forEach((link) => merged.set(link.shareSlug, link));
    return Array.from(merged.values());
  }, [messageDraft, composerEntities]);

  const closeMentions = () => {
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMentionIndex(0);
  };

  const updateMentions = (text: string, caret: number | null) => {
    if (!activeThread?.is_group || caret === null || caret === undefined) {
      closeMentions();
      return;
    }

    const uptoCaret = text.slice(0, caret);
    const atIndex = uptoCaret.lastIndexOf("@");

    if (atIndex === -1) {
      closeMentions();
      return;
    }

    const charBefore = atIndex > 0 ? uptoCaret[atIndex - 1] : " ";
    if (charBefore && !/\s/.test(charBefore)) {
      closeMentions();
      return;
    }

    const query = uptoCaret.slice(atIndex + 1);
    if (query.length > 0 && /\s/.test(query)) {
      closeMentions();
      return;
    }

    setMentionOpen(true);
    setMentionQuery(query);
    setMentionStart(atIndex);
    setMentionIndex(0);
  };

  const applyMention = (member: Member & { label?: string }) => {
    if (mentionStart === null || mentionCaretRef.current === null) return;

    const label = member.label ?? resolveDisplayName(member);
    const before = messageDraft.slice(0, mentionStart);
    const after = messageDraft.slice(mentionCaretRef.current);
    const insert = `@${label} `;
    const nextValue = `${before}${insert}${after}`;

    setMessageDraft(nextValue);
    closeMentions();

    requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) return;
      const position = before.length + insert.length;
      input.focus();
      input.setSelectionRange(position, position);
    });
  };

  const handleOpenThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setView("messages");
    closeMentions();
  };

  const applyComposerEdit = ({
    text,
    entities,
    start,
    end,
    insertText,
    insertEntities,
  }: {
    text: string;
    entities: ComposerProfileEntity[];
    start: number;
    end: number;
    insertText: string;
    insertEntities: Array<Omit<ComposerProfileEntity, "start" | "end"> & { start: number; end: number }>;
  }) => {
    const safeStart = Math.max(0, Math.min(start, text.length));
    const safeEnd = Math.max(safeStart, Math.min(end, text.length));
    const removedLen = safeEnd - safeStart;
    const delta = insertText.length - removedLen;

    const kept = entities
      .filter((entity) => entity.end <= safeStart || entity.start >= safeEnd)
      .map((entity) => {
        if (entity.start >= safeEnd) {
          return {
            ...entity,
            start: entity.start + delta,
            end: entity.end + delta,
          };
        }
        return entity;
      });

    const absoluteInserted = insertEntities.map((entity) => ({
      ...entity,
      start: safeStart + entity.start,
      end: safeStart + entity.end,
    }));

    const nextText = `${text.slice(0, safeStart)}${insertText}${text.slice(safeEnd)}`;
    const nextEntities = [...kept, ...absoluteInserted].sort((a, b) => a.start - b.start);

    return { nextText, nextEntities, caret: safeStart + insertText.length };
  };

  const reconcileEntitiesForTextChange = (
    prevText: string,
    nextText: string,
    entities: ComposerProfileEntity[]
  ) => {
    if (entities.length === 0) return entities;
    if (prevText === nextText) return entities;

    let prefix = 0;
    const prevLen = prevText.length;
    const nextLen = nextText.length;
    const maxPrefix = Math.min(prevLen, nextLen);
    while (prefix < maxPrefix && prevText[prefix] === nextText[prefix]) prefix += 1;

    let suffix = 0;
    while (
      suffix < prevLen - prefix &&
      suffix < nextLen - prefix &&
      prevText[prevLen - 1 - suffix] === nextText[nextLen - 1 - suffix]
    ) {
      suffix += 1;
    }

    const prevChangeStart = prefix;
    const prevChangeEnd = prevLen - suffix;
    const delta = nextLen - prevLen;

    return entities
      .filter((entity) => entity.end <= prevChangeStart || entity.start >= prevChangeEnd)
      .map((entity) => {
        if (entity.start >= prevChangeEnd) {
          return { ...entity, start: entity.start + delta, end: entity.end + delta };
        }
        return entity;
      })
      .filter((entity) => entity.end <= nextText.length);
  };

  const removeProfileFromDraft = (shareSlug: string) => {
    const escaped = escapeRegex(shareSlug);
    const tokenPattern = new RegExp(`\\[\\[\\s*profile\\s*:\\s*${escaped}\\s*\\]\\]`, "gi");
    const urlPattern = new RegExp(`(?:https?:\\/\\/[^\\s]+)?\\/pipeline\\?profile=${escaped}`, "gi");

    // Remove any composer entities for this profile by deleting their label ranges (from end -> start).
    const entitiesToRemove = composerEntities
      .filter((entity) => entity.shareSlug === shareSlug)
      .sort((a, b) => b.start - a.start);

    let nextText = messageDraft;
    let nextEntities = composerEntities;

    entitiesToRemove.forEach((entity) => {
      const edited = applyComposerEdit({
        text: nextText,
        entities: nextEntities,
        start: entity.start,
        end: entity.end,
        insertText: "",
        insertEntities: [],
      });
      nextText = edited.nextText;
      nextEntities = edited.nextEntities;
    });

    const cleanedText = nextText
      .replace(tokenPattern, "")
      .replace(urlPattern, "")
      .replace(/\s{2,}/g, " ");
    const cleanedEntities = reconcileEntitiesForTextChange(nextText, cleanedText, nextEntities);

    setMessageDraft(cleanedText.trim());
    setComposerEntities(cleanedEntities);
    requestAnimationFrame(() => resizeComposer());
  };

  const maybeDeleteProfileTokenAtCaret = (
    value: string,
    caret: number,
    direction: "backspace" | "delete"
  ) => {
    const pattern = /\[\[\s*profile\s*:\s*(\d{8}-[a-z0-9-]+)\s*\]\]/gi;
    const tokens: Array<{ start: number; end: number }> = [];
    for (const match of value.matchAll(pattern)) {
      const start = match.index ?? -1;
      if (start < 0) continue;
      tokens.push({ start, end: start + match[0].length });
    }
    if (tokens.length === 0) return null;

    const hit = tokens.find(({ start, end }) => {
      if (direction === "backspace") return caret > start && caret <= end;
      return caret >= start && caret < end;
    });
    if (!hit) return null;

    const nextValue = `${value.slice(0, hit.start)}${value.slice(hit.end)}`;
    return { nextValue, nextCaret: hit.start };
  };

  const handleSendMessage = async () => {
    if (!currentUser || !activeThreadId) return;
    const originalDraft = messageDraft;
    const originalEntities = composerEntities;

    let body = messageDraft;
    const sortedEntities = [...composerEntities].sort((a, b) => b.start - a.start);
    sortedEntities.forEach((entity) => {
      if (entity.start < 0 || entity.end > body.length || entity.end <= entity.start) return;
      body = `${body.slice(0, entity.start)}${encodeProfileToken(entity.shareSlug)}${body.slice(entity.end)}`;
    });
    body = body.replace(/\s{2,}/g, " ").trim();
    if (!body) return;
    setMessageDraft("");
    setComposerEntities([]);
    resizeComposer();
    closeMentions();
    const { error: insertError } = await supabase
      .from("chat_messages")
      .insert({ thread_id: activeThreadId, sender_id: currentUser.id, body });
    if (insertError) {
      setError(insertError.message ?? "Failed to send message.");
      setMessageDraft(originalDraft);
      setComposerEntities(originalEntities);
      return;
    }
    await loadThreads(currentUser.id);
  };

  const handleCreateThread = async () => {
    if (!currentUser) return;
    setError(null);
    const selected = newMemberIds.filter((id) => id !== currentUser.id);
    if (selected.length === 0) {
      setError("Pick at least one teammate.");
      return;
    }
    try {
      const res = await fetch("/api/chat/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          member_ids: selected,
          name: groupName.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.thread_id !== "string") {
        setError(data?.error ?? "Failed to create chat.");
        return;
      }

      await ensureAudioContext().catch(() => null);
      await loadThreads(currentUser.id);
      setActiveThreadId(data.thread_id);
      setView("messages");
      setGroupName("");
      setNewMemberIds([]);
    } catch (error) {
      setError(getErrorMessage(error, "Failed to create chat."));
    }
  };

  const handleToggleMember = (userId: string) => {
    setNewMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handlePasteComposer = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const raw = event.clipboardData?.getData("text") ?? "";
    if (!raw) return;

    const parts = splitProfileLinks(raw);
    const hasProfileLinks = parts.some((chunk) => typeof chunk !== "string");
    if (!hasProfileLinks) return;

    event.preventDefault();

    let content = "";
    const insertedEntities: Array<Omit<ComposerProfileEntity, "start" | "end"> & { start: number; end: number }> =
      [];
    let offset = 0;

    parts.forEach((chunk) => {
      if (typeof chunk === "string") {
        content += chunk;
        offset += chunk.length;
        return;
      }

      const labelText = chunk.label;
      const start = offset;
      content += labelText;
      offset += labelText.length;
      insertedEntities.push({
        id: String(composerEntityIdRef.current++),
        shareSlug: chunk.shareSlug,
        href: chunk.href,
        label: chunk.label,
        start,
        end: start + labelText.length,
      });
    });

    const target = event.currentTarget;
    const start = target.selectionStart ?? messageDraft.length;
    const end = target.selectionEnd ?? start;
    const before = messageDraft.slice(0, start);
    const after = messageDraft.slice(end);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
    const prefix = needsLeadingSpace ? " " : "";
    const suffix = needsTrailingSpace ? " " : "";
    const replacement = `${prefix}${content}${suffix}`;

    const shiftedInsertedEntities = insertedEntities.map((entity) => ({
      ...entity,
      start: entity.start + prefix.length,
      end: entity.end + prefix.length,
    }));

    const edited = applyComposerEdit({
      text: messageDraft,
      entities: composerEntities,
      start,
      end,
      insertText: replacement,
      insertEntities: shiftedInsertedEntities,
    });

    mentionCaretRef.current = edited.caret;
    setMessageDraft(edited.nextText);
    setComposerEntities(edited.nextEntities);
    updateMentions(edited.nextText, edited.caret);

    requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(edited.caret, edited.caret);
      resizeComposer(target);
    });
  };

  const handleOpenProfileLink = (href: string, shareSlug: string) => {
    if (typeof window === "undefined") return;

    if (window.location.pathname === "/pipeline") {
      window.history.replaceState(window.history.state, "", href);
      window.dispatchEvent(
        new CustomEvent(OPEN_PROFILE_EVENT, {
          detail: { shareSlug },
        })
      );
      setOpen(false);
      return;
    }

    window.location.assign(href);
  };

  return (
    <div className="fixed bottom-6 right-10 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-4 flex h-[min(70vh,520px)] max-h-[calc(100vh-6rem)] w-[min(90vw,380px)] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_30px_80px_-45px_rgba(15,23,42,0.8)]">
          <div className="flex items-center justify-between border-b border-slate-200/70 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-5 py-4 text-white">
            {view === "messages" && activeThread ? (
              <div className="flex min-w-0 items-center gap-3">
                <div className="shrink-0">
                  {activeThread.is_group ? (
                    <div className="flex -space-x-3">
                      {getThreadAvatarMembers(activeThread).map((member, index) => (
                        <AvatarThumb
                          key={`${activeThread.id}-header-${member?.user_id ?? index}`}
                          member={member}
                          className="h-10 w-10"
                        />
                      ))}
                    </div>
                  ) : (
                    <AvatarThumb
                      member={getThreadAvatarMembers(activeThread)[0]}
                      className="h-11 w-11"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">
                    {getThreadTitle(activeThread)}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                    {getThreadSubtitle(activeThread)}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                  Team chat
                </div>
                <div className="text-lg font-semibold">Stay in sync</div>
              </div>
            )}
            {view === "messages" && (
              <button
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/90 hover:bg-white/10"
                onClick={() => setView("threads")}
                type="button"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {loading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                Loading chat…
              </div>
            ) : error ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-rose-500">
                {error}
              </div>
            ) : view === "threads" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3">
                  <div className="text-sm font-semibold text-slate-700">Recent chats</div>
                  <button
                    className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    onClick={() => setView("new")}
                    type="button"
                  >
                    New chat
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {threads.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                      Start a new conversation with your team.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {threads.map((thread) => (
                        <button
                          key={thread.id}
                          onClick={() => handleOpenThread(thread.id)}
                          type="button"
                          className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200/60 bg-white px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex shrink-0 items-center">
                              {thread.is_group ? (
                                <div className="flex -space-x-3">
                                  {getThreadAvatarMembers(thread).map((member, index) => (
                                    <AvatarThumb
                                      key={`${thread.id}-${member?.user_id ?? index}`}
                                      member={member}
                                      className="h-10 w-10"
                                    />
                                  ))}
                                </div>
                              ) : (
                                <AvatarThumb
                                  member={getThreadAvatarMembers(thread)[0]}
                                  className="h-11 w-11"
                                />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-800">
                                {getThreadTitle(thread)}
                              </div>
                              <div className="truncate text-xs text-slate-500">
                                {toThreadPreview(thread.last_message_preview)}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-slate-400">
                            {thread.last_message_at ? formatDate(thread.last_message_at) : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : view === "new" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-slate-200/70 px-5 py-3">
                  <div className="text-sm font-semibold text-slate-700">Start a new chat</div>
                  <div className="text-xs text-slate-500">Pick teammates to create a direct or group chat.</div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Group name (optional)
                  </label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    placeholder="e.g. Hiring squad"
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                  />
                  <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Members
                  </div>
                  <div className="mt-3 space-y-2">
                    {members
                      .filter((member) => member.user_id !== currentUser?.id)
                      .map((member) => {
                        const selected = newMemberIds.includes(member.user_id);
                        return (
                          <button
                            key={member.user_id}
                            type="button"
                            onClick={() => handleToggleMember(member.user_id)}
                            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                              selected
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <span>{resolveDisplayName(member)}</span>
                            <span className="text-xs opacity-70">{selected ? "Selected" : "Tap"}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
                <div className="border-t border-slate-200/70 px-5 py-4">
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      onClick={() => setView("threads")}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      onClick={handleCreateThread}
                      type="button"
                    >
                      Create chat
                    </button>
                  </div>
                </div>
              </div>
            ) : (
	      <div className="flex min-h-0 flex-1 flex-col">
	                <div
	                  ref={messagesScrollRef}
	                  className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4"
	                >
                  {messages.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                      No messages yet. Say hello.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((message) => {
                        const isMine = message.sender_id === currentUser?.id;
                        const senderName = isMine
                          ? "You"
                          : resolveDisplayName(
                              members.find((member) => member.user_id === message.sender_id) ??
                                ({ name: "" } as Member)
                            );
                        return (
                          <div
                            key={message.id}
                            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-3 text-[16px] leading-[1.35] shadow-sm ${
                                isMine
                                  ? "bg-slate-900 text-white"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {!isMine && (
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  {senderName}
                                </div>
                              )}
                              <div className="space-y-1 break-words">
                                {renderRichBody(
                                  message.body,
                                  mentionLabels,
                                  isMine,
                                  handleOpenProfileLink
                                )}
                              </div>
                              <div className={`mt-2 text-[10px] ${isMine ? "text-white/70" : "text-slate-400"}`}>
                                {formatTime(message.created_at)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-200/70 px-4 py-3">
                  {draftProfileLinks.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {draftProfileLinks.map((link) => (
                        <div key={`draft-${link.shareSlug}`} className="flex items-center gap-2">
                          <ProfileLinkPill
                            href={link.href}
                            shareSlug={link.shareSlug}
                            label={link.label}
                            compact
                            theme={resolveCandidateThemeForShareSlug(link.shareSlug)}
                            onOpen={handleOpenProfileLink}
                          />
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                            onClick={() => removeProfileFromDraft(link.shareSlug)}
                            aria-label="Remove profile"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="relative flex items-end gap-2">
                    {activeThread?.is_group && mentionOpen ? (
                      <div className="absolute bottom-full left-0 z-20 mb-2 w-[min(320px,calc(100vw-6rem))] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                        {mentionOptions.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-slate-400">
                            No matching members.
                          </div>
                        ) : (
                          <div className="max-h-52 space-y-1 overflow-y-auto">
                            {mentionOptions.map((member, index) => (
                              <button
                                key={member.user_id}
                                type="button"
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${
                                  index === activeMentionIndex
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-700 hover:bg-slate-50"
                                }`}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  applyMention(member);
                                }}
                              >
                                <AvatarThumb member={member} className="h-8 w-8" />
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold">
                                    {member.label}
                                  </div>
                                  {member.email ? (
                                    <div className="truncate text-[11px] text-slate-400">
                                      {member.email}
                                    </div>
                                  ) : null}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    <div className="relative flex-1">
                      <div className="relative min-h-11 max-h-[140px] overflow-hidden rounded-3xl border border-slate-200 bg-white">
                        <div
                          ref={composerHighlightRef}
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 overflow-y-auto px-4 py-2 text-sm leading-6 text-slate-700 whitespace-pre-wrap break-words [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        >
                          {renderComposerHighlight(messageDraft, composerEntities)}
                        </div>
                        <textarea
                          ref={messageInputRef}
                          rows={1}
                          className="relative block min-h-11 max-h-[140px] w-full resize-none overflow-y-auto bg-transparent px-4 py-2 text-sm leading-6 text-transparent caret-slate-700 outline-none placeholder:text-slate-400 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                          placeholder={
                            activeThread?.is_group
                              ? "Write a message... Use @ to mention"
                              : "Write a message..."
                          }
                          value={messageDraft}
                          onScroll={(event) => {
                            if (composerHighlightRef.current) {
                              composerHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
                            }
                          }}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            const caret = event.target.selectionStart;
                            mentionCaretRef.current = caret;
                            setComposerEntities(
                              reconcileEntitiesForTextChange(
                                messageDraft,
                                nextValue,
                                composerEntities
                              )
                            );
                            setMessageDraft(nextValue);
                            updateMentions(nextValue, caret);
                            resizeComposer(event.currentTarget);
                            if (composerHighlightRef.current) {
                              composerHighlightRef.current.scrollTop = event.currentTarget.scrollTop;
                            }
                          }}
                          onPaste={handlePasteComposer}
                          onClick={(event) => {
                            void ensureAudioContext().catch(() => null);
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
                          if (event.key === "Backspace" || event.key === "Delete") {
                            const target = event.currentTarget;
                            const caret = event.currentTarget.selectionStart ?? 0;
                            const selectionEnd = event.currentTarget.selectionEnd ?? caret;
                            if (caret === selectionEnd) {
                              const entityHit = composerEntities.find((entity) => {
                                if (event.key === "Backspace") {
                                  return caret > entity.start && caret <= entity.end;
                                }
                                return caret >= entity.start && caret < entity.end;
                              });
                              if (entityHit) {
                                event.preventDefault();
                                const edited = applyComposerEdit({
                                  text: messageDraft,
                                  entities: composerEntities,
                                  start: entityHit.start,
                                  end: entityHit.end,
                                  insertText: "",
                                  insertEntities: [],
                                });
                                mentionCaretRef.current = edited.caret;
                                setMessageDraft(edited.nextText);
                                setComposerEntities(edited.nextEntities);
                                requestAnimationFrame(() => {
                                  target.focus();
                                  target.setSelectionRange(edited.caret, edited.caret);
                                  updateMentions(edited.nextText, edited.caret);
                                  resizeComposer(target);
                                });
                                return;
                              }

                              const deletion = maybeDeleteProfileTokenAtCaret(
                                event.currentTarget.value,
                                caret,
                                event.key === "Backspace" ? "backspace" : "delete"
                              );
                              if (deletion) {
                                event.preventDefault();
                                setMessageDraft(deletion.nextValue);
                                requestAnimationFrame(() => {
                                  target.focus();
                                  target.setSelectionRange(
                                    deletion.nextCaret,
                                    deletion.nextCaret
                                  );
                                  updateMentions(deletion.nextValue, deletion.nextCaret);
                                  resizeComposer(target);
                                });
                                return;
                              }
                            }
                          }

                          if (activeThread?.is_group && mentionOpen) {
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
                                applyMention(mentionOptions[activeMentionIndex]);
                              }
                              return;
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              closeMentions();
                              return;
                            }
                          }

                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void handleSendMessage();
                          }
                          }}
                        />
                      </div>
                    </div>
                    <button
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-slate-800"
                      onClick={handleSendMessage}
                      type="button"
                      aria-label="Send message"
                    >
                      <SendIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

	      <button
	        type="button"
	        onClick={() => {
	          void ensureAudioContext().catch(() => null);
	          setOpen((prev) => !prev);
	        }}
	        className="relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-full bg-slate-900 text-white shadow-[0_20px_40px_-20px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-slate-800"
	        aria-label={open ? "Close chat" : "Open chat"}
	      >
	        {!open && unreadThreadCount > 0 ? (
	          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900" />
	        ) : null}
	        {open ? (
	          <X className="h-6 w-6" />
	        ) : (
	          <>
	            <MessageCircle className="h-6 w-6" />
            <span className="text-[11px] font-semibold leading-none">Chat</span>
          </>
        )}
      </button>
    </div>
  );
}
