import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureCompanyMembership } from "@/lib/company/membership";
import {
  buildGmailRawMessage,
  getValidGmailAccessToken,
  gmailFetchJson,
  type GmailMailboxRow,
} from "@/lib/email/gmail";
import {
  addOpenPixelToHtml,
  buildOpenPixelUrl,
  rewriteLinksForTracking,
} from "@/lib/email/tracking";

export const runtime = "nodejs";

type SendBody = {
  candidateId?: string;
  subject?: string;
  body?: string;
  bodyHtml?: string;
};

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const toBasicHtml = (text: string) => {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="white-space:pre-wrap;font-family:ui-sans-serif,system-ui">${escaped}</div>`;
};

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as SendBody | null;
    const candidateId = asString(body?.candidateId).trim();
    const subject = asString(body?.subject).trim();
    const plain = asString(body?.body).trim();
    const htmlRaw = asString(body?.bodyHtml).trim();

    if (!candidateId || !subject || (!plain && !htmlRaw)) {
      return NextResponse.json(
        { error: "candidateId, subject, and body are required." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    const { companyId } = await ensureCompanyMembership(admin, user.id);

    const { data: candidateRow } = await admin
      .from("candidates")
      .select("id,data")
      .eq("id", candidateId)
      .maybeSingle();
    if (!candidateRow) {
      return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
    }
    const candidateData = (candidateRow.data ?? {}) as Record<string, unknown>;
    const candidateEmail = asString(candidateData.email).trim().toLowerCase();
    if (!candidateEmail) {
      return NextResponse.json({ error: "Candidate has no email address." }, { status: 400 });
    }

    const { data: mailbox } = await admin
      .from("company_mailboxes")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_shared", true)
      .maybeSingle();

    if (!mailbox?.id || !mailbox?.provider) {
      return NextResponse.json({ error: "Shared inbox is not configured." }, { status: 400 });
    }

    const messageId = crypto.randomUUID();
    const trackingToken = crypto.randomUUID();
    const configuredOrigin = (process.env.PUBLIC_APP_URL ?? "").trim().replace(/\/+$/g, "");
    const origin = configuredOrigin || new URL(request.url).origin;

    const baseHtml = htmlRaw || toBasicHtml(plain);
    const htmlWithPixel = addOpenPixelToHtml(
      baseHtml,
      buildOpenPixelUrl(origin, messageId, trackingToken)
    );
    const finalHtml = rewriteLinksForTracking(htmlWithPixel, origin, messageId, trackingToken);

    const nowIso = new Date().toISOString();
    let providerMessageId = messageId;
    let providerThreadId: string | null = null;
    const mailboxEmail = asString(mailbox.email_address).trim().toLowerCase();
    const fromHeader = mailbox.display_name
      ? `${mailbox.display_name} <${mailboxEmail}>`
      : mailboxEmail;

    if (mailbox.provider === "gmail") {
      const mailboxRow = mailbox as unknown as GmailMailboxRow;
      const accessToken = await getValidGmailAccessToken(admin, mailboxRow);

      const latest = await admin
        .from("email_messages")
        .select("provider_thread_id")
        .eq("candidate_id", candidateId)
        .eq("provider", "gmail")
        .not("provider_thread_id", "is", null)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const threadId = (latest.data?.provider_thread_id as string | null) ?? null;

      const raw = buildGmailRawMessage(
        {
          To: candidateEmail,
          From: fromHeader,
          Subject: subject,
        },
        finalHtml
      );

      const sendRes = await gmailFetchJson(accessToken, "/users/me/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
      });

      const sendData = (sendRes ?? null) as Record<string, unknown> | null;
      providerMessageId =
        sendData && typeof sendData.id === "string" ? sendData.id : providerMessageId;
      providerThreadId =
        sendData && typeof sendData.threadId === "string"
          ? sendData.threadId
          : threadId;
    } else if (mailbox.provider === "smtp_imap") {
      type NodemailerModule = {
        createTransport?: unknown;
        default?: { createTransport?: unknown };
      };
      const nodemailerMod = (await import("nodemailer")) as unknown as NodemailerModule;
      const createTransport =
        typeof nodemailerMod.createTransport === "function"
          ? nodemailerMod.createTransport
          : typeof nodemailerMod.default?.createTransport === "function"
          ? nodemailerMod.default.createTransport
          : null;
      if (typeof createTransport !== "function") {
        return NextResponse.json(
          { error: "SMTP library is not available on the server." },
          { status: 500 }
        );
      }
      const host = asString(mailbox.smtp_host).trim();
      const port = typeof mailbox.smtp_port === "number" ? mailbox.smtp_port : 0;
      const userName = asString(mailbox.smtp_user).trim();
      const password = asString(mailbox.smtp_password).trim();
      if (!host || !port || !userName || !password) {
        return NextResponse.json(
          { error: "SMTP is not fully configured for the shared inbox." },
          { status: 400 }
        );
      }

      const secure =
        typeof mailbox.smtp_tls === "boolean"
          ? mailbox.smtp_tls && port === 465
          : port === 465;

      const transport = createTransport({
        host,
        port,
        secure,
        auth: { user: userName, pass: password },
      });

      const info = await transport.sendMail({
        from: fromHeader,
        to: candidateEmail,
        subject,
        html: finalHtml,
        text: plain || undefined,
      });
      providerMessageId = typeof info?.messageId === "string" ? info.messageId : providerMessageId;
    } else {
      return NextResponse.json({ error: "Unsupported shared inbox provider." }, { status: 400 });
    }

    const insert = await admin
      .from("email_messages")
      .insert({
        id: messageId,
        candidate_id: candidateId,
        mailbox_id: mailbox.id,
        provider: mailbox.provider,
        provider_message_id: providerMessageId,
        provider_thread_id: providerThreadId,
        direction: "out",
        from_email: mailboxEmail || null,
        from_name: mailbox.display_name ?? null,
        to_emails: [candidateEmail],
        subject,
        snippet: plain ? plain.slice(0, 180) : null,
        body_html: finalHtml,
        body_text: plain || null,
        sent_at: nowIso,
        received_at: nowIso,
        tracking_token: trackingToken,
        raw: {},
      })
      .select(
        [
          "id",
          "provider",
          "provider_thread_id",
          "direction",
          "from_email",
          "from_name",
          "to_emails",
          "subject",
          "snippet",
          "body_html",
          "body_text",
          "sent_at",
          "opens_count",
          "clicks_count",
          "created_at",
        ].join(",")
      )
      .single();

    if (insert.error) {
      return NextResponse.json({ error: insert.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: insert.data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
