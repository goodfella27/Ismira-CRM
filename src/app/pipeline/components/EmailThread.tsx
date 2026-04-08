import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type EmailMessage = {
  id: string;
  provider: string;
  provider_thread_id?: string | null;
  direction: "in" | "out" | string;
  from_email?: string | null;
  from_name?: string | null;
  to_emails?: string[] | null;
  subject?: string | null;
  snippet?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  sent_at?: string | null;
  received_at?: string | null;
  created_at?: string | null;
  opens_count?: number | null;
  clicks_count?: number | null;
  attachments?: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
    isInline?: boolean;
  }>;
};

type ThreadResponse = {
  configured: boolean;
  provider: string | null;
  mailboxEmail: string | null;
  messages: EmailMessage[];
};

type ThreadCard = {
  threadId: string;
  subject: string;
  count: number;
  latestAtMs: number;
  latestPreview: string;
  messagesAsc: EmailMessage[];
};

type TimelineItem =
  | { type: "thread"; key: string; latestAtMs: number; thread: ThreadCard }
  | { type: "message"; key: string; latestAtMs: number; message: EmailMessage };

const subjectKey = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(re|fw|fwd)\s*:\s*/gi, "")
    .trim()
    .toLowerCase();

const stripQuotedReplyForPreview = (value: string) => {
  const normalized = value.replace(/\r\n/g, "\n");
  const replyMarkers: RegExp[] = [
    /\nOn .+wrote:\s*\n/i,
    /\nFrom:\s.+\n/i,
    /\nSent:\s.+\n/i,
    /\n---+ Forwarded message ---+\n/i,
  ];

  let cutAt = -1;
  for (const marker of replyMarkers) {
    const match = marker.exec(normalized);
    if (!match?.index) continue;
    if (match.index > 40) {
      cutAt = cutAt === -1 ? match.index : Math.min(cutAt, match.index);
    }
  }

  const quoteLineMatch = normalized.match(/\n\s*>/);
  if (quoteLineMatch?.index && quoteLineMatch.index > 40) {
    cutAt = cutAt === -1 ? quoteLineMatch.index : Math.min(cutAt, quoteLineMatch.index);
  }

  return cutAt === -1 ? normalized : normalized.slice(0, cutAt);
};

const stripSignatureForPreview = (value: string) => {
  const normalized = value.replace(/\r\n/g, "\n");

  const signatureStartPatterns: RegExp[] = [
    /(?:^|\n)\s*(--|—|___)\s*(?:\n|$)/,
    /(?:^|\n)\s*\*?\s*(best regards|kind regards|warm regards|regards|sincerely|cheers|thanks|thank you|sent from my)\b/i,
    /(?:^|\n)\s*\*?\s*(pagarbiai|su pagarba|linkėjimai|linkejimai|ačiū|aciu|ačiū\suž|aciu uz)\b/i,
  ];

  let cutAt = -1;
  for (const pattern of signatureStartPatterns) {
    const match = pattern.exec(normalized);
    if (!match?.index && match?.index !== 0) continue;
    // Avoid cutting too early (false positives).
    if (match.index > 25) {
      cutAt = cutAt === -1 ? match.index : Math.min(cutAt, match.index);
    }
  }

  // Sometimes signatures get flattened into a single line (e.g. "...  Best regards, Name").
  const inlineMatch = /(\s{2,}|\.\s+)\*?\s*(best regards|kind regards|warm regards|regards|sincerely|cheers|thanks|thank you|pagarbiai|su pagarba)\b/i.exec(
    normalized
  );
  if (inlineMatch?.index && inlineMatch.index > 25) {
    cutAt = cutAt === -1 ? inlineMatch.index : Math.min(cutAt, inlineMatch.index);
  }

  if (cutAt === -1) return normalized;
  // If the signature marker is basically the whole email, keep original.
  if (cutAt < 20) return normalized;
  return normalized.slice(0, cutAt);
};

const previewTextForMessage = (message: EmailMessage, maxLen: number) => {
  const raw = (message.body_text?.trim() || message.snippet?.trim() || "").trim();
  if (!raw) return "";
  const withoutReply = stripQuotedReplyForPreview(raw);
  const withoutSignature = stripSignatureForPreview(withoutReply);
  return withoutSignature.replace(/\s+/g, " ").trim().slice(0, maxLen);
};

const messageTimestampMs = (message: EmailMessage) => {
  const raw = message.sent_at ?? message.received_at ?? message.created_at ?? "";
  const date = raw ? new Date(raw) : null;
  const ms = date ? date.getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
};

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelativeTime = (valueMs: number) => {
  if (!Number.isFinite(valueMs) || valueMs <= 0) return "";
  const deltaMs = Date.now() - valueMs;
  if (deltaMs < 0) return "just now";
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes <= 0) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
};

const monthKey = (valueMs: number) => {
  if (!Number.isFinite(valueMs) || valueMs <= 0) return "unknown";
  const date = new Date(valueMs);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (valueMs: number) => {
  if (!Number.isFinite(valueMs) || valueMs <= 0) return "Unknown date";
  const date = new Date(valueMs);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(date);
};

const groupByMonth = <T,>(items: T[], getMs: (item: T) => number) => {
  const sections: Array<{ key: string; label: string; items: T[] }> = [];
  let currentKey = "";
  items.forEach((item) => {
    const ms = getMs(item);
    const nextKey = monthKey(ms);
    if (!sections.length || nextKey !== currentKey) {
      currentKey = nextKey;
      sections.push({ key: nextKey, label: monthLabel(ms), items: [item] });
      return;
    }
    sections[sections.length - 1]?.items.push(item);
  });
  return sections;
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(padded), (c: string) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join("")
    );
  } catch {
    return "";
  }
};

const normalizeTrackedHtmlForUi = (html: string) => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // Remove our own open-tracking pixel to avoid inflating opens when staff view emails in-app.
  const withoutPixel = html.replace(
    /<img\b[^>]*\bsrc=(["'])([^"']*\/api\/email\/track\/open\?[^"']*)\1[^>]*>/gi,
    ""
  );

  // Replace tracked click URLs back to the original destination to avoid inflating clicks.
  const withoutTrackedLinks = withoutPixel.replace(
    /href=(["'])([^"']+)\1/gi,
    (match, quote: string, href: string) => {
    if (!href.includes("/api/email/track/click")) return match;
    try {
      const parsed = new URL(href, origin || "http://localhost");
      const encoded = parsed.searchParams.get("u") ?? "";
      const decoded = encoded ? decodeBase64Url(encoded) : "";
      if (decoded && /^https?:\/\//i.test(decoded)) {
        return `href=${quote}${decoded}${quote}`;
      }
    } catch {
      // ignore
    }
    return match;
    }
  );

  // Ensure links open in a new tab.
  const baseTag = `<base target="_blank" rel="noopener noreferrer" />`;
  if (/<head[\s>]/i.test(withoutTrackedLinks)) {
    return withoutTrackedLinks.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  if (/<html[\s>]/i.test(withoutTrackedLinks)) {
    return withoutTrackedLinks.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  }
  return `<head>${baseTag}</head>${withoutTrackedLinks}`;
};

const MessageBody = ({ message }: { message: EmailMessage }) => {
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {message.body_html ? (
        <iframe
          title={`email-${message.id}`}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          className="h-64 w-full rounded-xl border border-slate-200 bg-white"
          srcDoc={normalizeTrackedHtmlForUi(message.body_html)}
        />
      ) : message.body_text ? (
        <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">
          {message.body_text}
        </pre>
      ) : (
        <div className="text-[11px] text-slate-400">No content.</div>
      )}

      {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.attachments
            .filter((item) => !item.isInline)
            .map((attachment) => (
              <a
                key={attachment.attachmentId}
                href={`/api/email/attachment?id=${encodeURIComponent(
                  message.id
                )}&aid=${encodeURIComponent(attachment.attachmentId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                <span className="text-white/80">📎</span>
                <span className="max-w-[260px] truncate">
                  {attachment.filename}
                </span>
              </a>
            ))}
        </div>
      ) : null}
    </div>
  );
};

const MessageSummary = ({ message }: { message: EmailMessage }) => {
  const subject = message.subject?.trim() || "(no subject)";
  const sentAt = formatDate(message.sent_at);
  const from = message.from_email || "—";
  const to = Array.isArray(message.to_emails) ? message.to_emails.join(", ") : "—";
  const preview = previewTextForMessage(message, 240);
  const isOutbound = message.direction === "out";

  return (
    <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-900">Email — {subject}</div>
        <div className="mt-1 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">{from}</span> → {to}
        </div>
        {preview ? (
          <div data-preview className="mt-2 line-clamp-2 text-[11px] text-slate-600">
            {preview}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right text-[11px] text-slate-500">
        <div>{sentAt || "—"}</div>
        <div className="mt-1 flex items-center justify-end">
          {isOutbound ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Sent
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Received
            </span>
          )}
        </div>
        {isOutbound ? (
          <div className="mt-1 flex items-center justify-end gap-3 text-[11px]">
            <span>
              Opens:{" "}
              <span className="font-semibold text-slate-700">{message.opens_count ?? 0}</span>
            </span>
            <span>
              Clicks:{" "}
              <span className="font-semibold text-slate-700">{message.clicks_count ?? 0}</span>
            </span>
          </div>
        ) : null}
      </div>
    </summary>
  );
};

const MessageCard = ({ message }: { message: EmailMessage }) => {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white px-4 py-3 open:[&_[data-preview]]:hidden">
      <MessageSummary message={message} />
      <MessageBody message={message} />
    </details>
  );
};

export function EmailThread({
  candidateId,
  candidateEmail,
}: {
  candidateId: string;
  candidateEmail: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [mailboxEmail, setMailboxEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [lastSyncAtMs, setLastSyncAtMs] = useState<number>(0);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  const syncKey = useMemo(() => `emailThread:lastSync:${candidateId}`, [candidateId]);

  const loadThread = useCallback(
    async (
      sync: boolean,
      background = false,
      reportError = true
    ): Promise<ThreadResponse | null> => {
      if (background) setSyncing(true);
      else setLoading(true);
      try {
        const res = await fetch(
          `/api/email/thread?candidateId=${encodeURIComponent(candidateId)}${
            sync ? "&sync=1" : ""
          }`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Failed to load emails");

        const next: ThreadResponse = {
          configured: !!data?.configured,
          provider: typeof data?.provider === "string" ? data.provider : null,
          mailboxEmail: typeof data?.mailboxEmail === "string" ? data.mailboxEmail : null,
          messages: Array.isArray(data?.messages) ? (data.messages as EmailMessage[]) : [],
        };

        setConfigured(next.configured);
        setMailboxEmail(next.mailboxEmail);
        setMessages(next.messages);

        if (sync && typeof window !== "undefined") {
          const now = Date.now();
          window.localStorage.setItem(syncKey, String(now));
          setLastSyncAtMs(now);
        }

        return next;
      } catch (err) {
        if (reportError) setError(err instanceof Error ? err.message : "Failed to load emails");
        return null;
      } finally {
        if (background) setSyncing(false);
        else setLoading(false);
      }
    },
    [candidateId, syncKey]
  );

  useEffect(() => {
    let canceled = false;
    const run = async () => {
      setError(null);
      let storedMs = 0;
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(syncKey) ?? "";
        const parsed = raw ? Number(raw) : 0;
        if (Number.isFinite(parsed)) storedMs = parsed;
      }
      setLastSyncAtMs(storedMs);

      const initial = await loadThread(false, false, true);
      if (canceled) return;

      const autoSyncTtlMs = 5 * 60 * 1000;
      const stale = !storedMs || Date.now() - storedMs > autoSyncTtlMs;
      const shouldAutoSync = !initial || initial.messages.length === 0 || stale;
      if (shouldAutoSync) {
        void loadThread(true, true, false);
      }
    };
    void run();
    return () => {
      canceled = true;
    };
  }, [candidateId, syncKey, loadThread]);

  const canCompose =
    configured && Boolean(mailboxEmail) && Boolean(candidateEmail?.includes("@"));

  const defaultSubject = useMemo(() => {
    const latest = messages.find((m) => m?.subject);
    const base = latest?.subject?.trim() ?? "";
    if (!base) return "";
    return base.toLowerCase().startsWith("re:") ? base : `Re: ${base}`;
  }, [messages]);

  const grouped = useMemo(() => {
    const bucketsByProviderThreadId = new Map<string, EmailMessage[]>();
    const singles: EmailMessage[] = [];

    messages.forEach((message) => {
      const providerThreadId = message.provider_thread_id?.trim() ?? "";
      if (!providerThreadId) {
        singles.push(message);
        return;
      }
      const list = bucketsByProviderThreadId.get(providerThreadId) ?? [];
      list.push(message);
      bucketsByProviderThreadId.set(providerThreadId, list);
    });

    const threadCards: ThreadCard[] = [];

    // A "thread" should represent a real back-and-forth (sent + received), not a single email.
    bucketsByProviderThreadId.forEach((list, providerThreadId) => {
      const messagesAsc = [...list].sort(
        (a, b) => messageTimestampMs(a) - messageTimestampMs(b)
      );
      const hasInbound = messagesAsc.some((m) => m.direction === "in");
      const hasOutbound = messagesAsc.some((m) => m.direction === "out");
      const qualifiesAsThread = messagesAsc.length > 1 && hasInbound && hasOutbound;

      if (!qualifiesAsThread) {
        singles.push(...messagesAsc);
        return;
      }

      const latest = [...messagesAsc].sort(
        (a, b) => messageTimestampMs(b) - messageTimestampMs(a)
      )[0];
      const latestAtMs = latest ? messageTimestampMs(latest) : 0;
      const subject = latest?.subject?.trim() ?? "";
      threadCards.push({
        threadId: providerThreadId,
        subject,
        count: messagesAsc.length,
        latestAtMs,
        latestPreview: latest ? previewTextForMessage(latest, 180) : "",
        messagesAsc,
      });
    });

    // Fallback thread detection for providers without thread IDs: group by subject, but only
    // if there is a real back-and-forth (sent + received).
    const singlesSorted = [...singles].sort(
      (a, b) => messageTimestampMs(b) - messageTimestampMs(a)
    );
    const bucketsBySubject = new Map<string, EmailMessage[]>();
    const remainingSingles: EmailMessage[] = [];

    singlesSorted.forEach((message) => {
      const key = subjectKey(message.subject ?? "");
      if (!key) {
        remainingSingles.push(message);
        return;
      }
      const list = bucketsBySubject.get(key) ?? [];
      list.push(message);
      bucketsBySubject.set(key, list);
    });

    bucketsBySubject.forEach((list, key) => {
      if (list.length <= 1) {
        remainingSingles.push(...list);
        return;
      }
      const messagesAsc = [...list].sort(
        (a, b) => messageTimestampMs(a) - messageTimestampMs(b)
      );
      const hasInbound = messagesAsc.some((m) => m.direction === "in");
      const hasOutbound = messagesAsc.some((m) => m.direction === "out");
      const qualifiesAsThread = hasInbound && hasOutbound;
      if (!qualifiesAsThread) {
        remainingSingles.push(...messagesAsc);
        return;
      }
      const latest = [...messagesAsc].sort(
        (a, b) => messageTimestampMs(b) - messageTimestampMs(a)
      )[0];
      const latestAtMs = latest ? messageTimestampMs(latest) : 0;
      const subject = latest?.subject?.trim() ?? "";
      threadCards.push({
        threadId: `subject:${key}`,
        subject,
        count: messagesAsc.length,
        latestAtMs,
        latestPreview: latest ? previewTextForMessage(latest, 180) : "",
        messagesAsc,
      });
    });

    const mergedThreadCards = [...threadCards].sort((a, b) => b.latestAtMs - a.latestAtMs);
    const correctedSingles = [...remainingSingles].sort(
      (a, b) => messageTimestampMs(b) - messageTimestampMs(a)
    );

    return {
      threads: mergedThreadCards.sort((a, b) => b.latestAtMs - a.latestAtMs),
      singles: correctedSingles,
    };
  }, [messages]);

  const threadTimelineItems = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = [
      ...grouped.threads.map((thread) => ({
        type: "thread" as const,
        key: `thread:${thread.threadId}`,
        latestAtMs: thread.latestAtMs,
        thread,
      })),
      ...grouped.singles.map((message) => ({
        type: "message" as const,
        key: `message:${message.id}`,
        latestAtMs: messageTimestampMs(message),
        message,
      })),
    ];
    return items.sort((a, b) => b.latestAtMs - a.latestAtMs);
  }, [grouped.threads, grouped.singles]);

  const threadTimelineByMonth = useMemo(() => {
    return groupByMonth(threadTimelineItems, (item) => item.latestAtMs);
  }, [threadTimelineItems]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
          {lastSyncAtMs ? (
            <div className="text-[11px] text-slate-400">
              Last sync: {formatRelativeTime(lastSyncAtMs)}
            </div>
          ) : null}
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
            onClick={() => {
              setError(null);
              void loadThread(true, true, true);
            }}
            disabled={loading || syncing}
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
      </div>

      {!configured ? (
        <div className="rounded-md border border-dashed border-slate-200 bg-white px-4 py-4 text-xs text-slate-500">
          Shared inbox not configured. Go to <span className="font-semibold">Company → Integrations</span> to connect
          Gmail (recommended) or enter SMTP/IMAP settings.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {messages.length === 0 && configured && !loading ? (
        <div className="rounded-md border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
          No emails yet.
        </div>
      ) : null}

      <div className="space-y-3">
        {threadTimelineByMonth.map((section) => (
          <div key={section.key}>
            <div className="px-1 pt-2 text-lg font-semibold text-slate-700">
              {section.label}
            </div>
            <div className="mt-3 space-y-3">
              {section.items.map((item) =>
                item.type === "thread" ? (
                  <details
                    key={item.key}
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] before:bg-transparent before:transition-colors open:before:bg-slate-900 open:[&_[data-close-thread]]:flex open:[&_[data-thread-preview]]:hidden"
                  >
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-900">
                            Thread — {item.thread.subject || "(no subject)"}
                          </span>
                          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {item.thread.count}
                          </span>
                        </div>
                        {item.thread.latestPreview ? (
                          <div
                            data-thread-preview
                            className="mt-2 line-clamp-2 text-[11px] text-slate-600"
                          >
                            {item.thread.latestPreview}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-slate-500">
                        {item.thread.latestAtMs
                          ? formatDate(new Date(item.thread.latestAtMs).toISOString())
                          : "—"}
                      </div>
                    </summary>

                    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                      {[...item.thread.messagesAsc].reverse().map((message) => (
                        <MessageCard key={message.id} message={message} />
                      ))}

                      <div
                        data-close-thread
                        className="hidden items-center justify-start pt-2"
                      >
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700"
                          onClick={(event) => {
                            const details = (event.currentTarget as HTMLElement).closest(
                              "details"
                            ) as HTMLDetailsElement | null;
                            if (details) details.open = false;
                          }}
                        >
                          Close thread
                        </button>
                      </div>
                    </div>
                  </details>
                ) : (
                  <MessageCard key={item.key} message={item.message} />
                )
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pointer-events-none sticky bottom-4 z-20 flex translate-y-2 justify-end pt-4">
        <button
          type="button"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-[11px] font-semibold text-white shadow-[0_10px_28px_-10px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60 disabled:hover:translate-y-0"
          onClick={() => {
            setComposeSubject(defaultSubject || "Re:");
            setComposeBody("");
            setComposeOpen(true);
          }}
          disabled={!canCompose || composeOpen}
        >
          <Pencil className="h-4 w-4 text-white/90" />
          Create Email
        </button>
      </div>

      {composeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-10">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">New email</div>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                onClick={() => setComposeOpen(false)}
                disabled={sending}
              >
                Close
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="text-[11px] text-slate-500">
                From: <span className="font-semibold text-slate-700">{mailboxEmail}</span> → To:{" "}
                <span className="font-semibold text-slate-700">
                  {candidateEmail || "—"}
                </span>
              </div>
              <input
                className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm"
                placeholder="Subject"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                disabled={sending}
              />
              <textarea
                className="min-h-[220px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="Write your email…"
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                disabled={sending}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                  onClick={() => setComposeOpen(false)}
                  disabled={sending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  disabled={sending || !composeSubject.trim() || !composeBody.trim()}
                  onClick={async () => {
                    setSending(true);
                    setError(null);
                    try {
                      const res = await fetch("/api/email/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          candidateId,
                          subject: composeSubject,
                          body: composeBody,
                        }),
                      });
                      const data = await res.json().catch(() => null);
                      if (!res.ok) throw new Error(data?.error ?? "Failed to send");
                      setComposeOpen(false);
                      await loadThread(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to send");
                    } finally {
                      setSending(false);
                    }
                  }}
                >
                  {sending ? "Sending…" : "Send email"}
                </button>
              </div>
              <div className="text-[11px] text-slate-400">
                {isLocalhost
                  ? "On localhost, Gmail open-tracking won’t work (images are fetched by Google’s proxy). Use a public URL (tunnel/deploy) for real tracking."
                  : "Opens/clicks tracking is applied automatically to emails sent from here."}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
