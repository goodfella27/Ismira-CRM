import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

export type GmailMailboxRow = {
  id: string;
  company_id: string;
  provider: string;
  email_address: string;
  display_name: string | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_scope: string | null;
  oauth_token_type: string | null;
  oauth_expires_at: string | null;
};

export type GmailAttachmentMeta = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  partId?: string | null;
  isInline?: boolean;
};

export const getValidGmailAccessToken = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  mailbox: GmailMailboxRow
) => {
  const now = Date.now();
  const expiresAtMs = mailbox.oauth_expires_at
    ? new Date(mailbox.oauth_expires_at).getTime()
    : 0;
  if (mailbox.oauth_access_token && expiresAtMs - now > 2 * 60 * 1000) {
    return mailbox.oauth_access_token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET");
  }
  if (!mailbox.oauth_refresh_token) {
    throw new Error("Gmail mailbox refresh token missing");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: mailbox.oauth_refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData?.access_token) {
    throw new Error("Failed to refresh Gmail access token");
  }

  const nextExpiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  await admin
    .from("company_mailboxes")
    .update({
      oauth_access_token: tokenData.access_token,
      oauth_expires_at: nextExpiresAt,
      oauth_scope: tokenData.scope ?? mailbox.oauth_scope,
      oauth_token_type: tokenData.token_type ?? mailbox.oauth_token_type,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mailbox.id);

  return tokenData.access_token as string;
};

export const gmailFetchJson = async (
  accessToken: string,
  path: string,
  init?: RequestInit
) => {
  const res = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = typeof data?.error?.message === "string" ? data.error.message : "Gmail API error";
    throw new Error(message);
  }
  return data as unknown;
};

const getHeader = (headers: Array<{ name: string; value: string }> | null, name: string) => {
  if (!headers) return "";
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? "";
};

export const extractEmailAddress = (value: string) => {
  const trimmed = value.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  const candidate = (angle?.[1] ?? trimmed).trim();
  const emailMatch = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch ? emailMatch[0].toLowerCase() : "";
};

export const extractEmailList = (value: string) =>
  value
    .split(",")
    .map((part) => extractEmailAddress(part))
    .filter(Boolean);

type GmailPayload = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPayload[];
};

const extractBodies = (payload: GmailPayload | null) => {
  let text = "";
  let html = "";

  const walk = (node: GmailPayload | null) => {
    if (!node) return;
    const mime = node.mimeType?.toLowerCase() ?? "";
    const data = node.body?.data ?? "";
    if (data && (mime === "text/plain" || mime === "text/html")) {
      const decoded = decodeBase64Url(data);
      if (mime === "text/plain" && !text) text = decoded;
      if (mime === "text/html" && !html) html = decoded;
    }
    (node.parts ?? []).forEach(walk);
  };

  walk(payload);
  return { text, html };
};

const extractAttachmentsMeta = (payload: GmailPayload | null) => {
  const attachments: GmailAttachmentMeta[] = [];

  const walk = (node: GmailPayload | null) => {
    if (!node) return;

    const filename = (node.filename ?? "").trim();
    const attachmentId = node.body?.attachmentId;
    const mimeType = (node.mimeType ?? "").trim() || "application/octet-stream";
    const size = typeof node.body?.size === "number" ? node.body.size : 0;

    if (attachmentId && filename) {
      const disposition = getHeader(node.headers ?? null, "Content-Disposition").toLowerCase();
      const isInline = disposition.includes("inline");
      attachments.push({
        attachmentId,
        filename,
        mimeType,
        size,
        partId: node.partId ?? null,
        isInline,
      });
    }

    (node.parts ?? []).forEach(walk);
  };

  walk(payload);
  return attachments;
};

export const getGmailAttachmentsFromMessage = (message: unknown) => {
  const msg = (message ?? {}) as Record<string, unknown>;
  const payload = (msg.payload ?? null) as GmailPayload | null;
  const existing = msg.attachments_meta;
  if (Array.isArray(existing)) {
    return existing
      .map((item) => item as Partial<GmailAttachmentMeta>)
      .filter((item) => typeof item.attachmentId === "string" && typeof item.filename === "string")
      .map((item) => ({
        attachmentId: item.attachmentId as string,
        filename: item.filename as string,
        mimeType: typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream",
        size: typeof item.size === "number" ? item.size : 0,
        partId: typeof item.partId === "string" ? item.partId : null,
        isInline: Boolean(item.isInline),
      }));
  }
  return extractAttachmentsMeta(payload);
};

export const parseGmailMessage = (
  message: unknown,
  mailboxEmail: string
) => {
  const msg = (message ?? {}) as Record<string, unknown>;
  const payload = (msg.payload ?? null) as GmailPayload | null;
  const headers = payload?.headers ?? null;
  const subject = getHeader(headers, "Subject");
  const fromHeader = getHeader(headers, "From");
  const toHeader = getHeader(headers, "To");
  const ccHeader = getHeader(headers, "Cc");
  const bccHeader = getHeader(headers, "Bcc");

  const fromEmail = extractEmailAddress(fromHeader);
  const direction = fromEmail && fromEmail === mailboxEmail.toLowerCase() ? "out" : "in";
  const { text, html } = extractBodies(payload);
  const attachments = extractAttachmentsMeta(payload);

  const internalDateMs =
    typeof msg.internalDate === "string" ? Number(msg.internalDate) : null;
  const sentAt = internalDateMs && Number.isFinite(internalDateMs) ? new Date(internalDateMs).toISOString() : null;

  return {
    provider_message_id: typeof msg.id === "string" ? msg.id : "",
    provider_thread_id: typeof msg.threadId === "string" ? msg.threadId : null,
    subject: subject || null,
    snippet: typeof msg.snippet === "string" ? msg.snippet : null,
    from_email: fromEmail || null,
    from_name: null,
    to_emails: extractEmailList(toHeader),
    cc_emails: extractEmailList(ccHeader),
    bcc_emails: extractEmailList(bccHeader),
    direction,
    body_text: text || null,
    body_html: html || null,
    sent_at: sentAt,
    received_at: sentAt,
    raw: { ...msg, attachments_meta: attachments },
  };
};

export const buildGmailRawMessage = (headers: Record<string, string>, body: string) => {
  const lines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
  const mime = [
    ...lines,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
  ].join("\r\n");

  return Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};
