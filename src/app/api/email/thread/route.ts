import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureCompanyMembership } from "@/lib/company/membership";
import {
  getValidGmailAccessToken,
  gmailFetchJson,
  getGmailAttachmentsFromMessage,
  parseGmailMessage,
  type GmailMailboxRow,
} from "@/lib/email/gmail";

export const runtime = "nodejs";

const asString = (value: unknown) => (typeof value === "string" ? value : "");

type EmailUpsertRow = {
  candidate_id: string;
  mailbox_id: string;
  provider: string;
  provider_message_id: string;
  provider_thread_id: string | null;
  direction: string;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  subject: string | null;
  snippet: string | null;
  body_html: string | null;
  body_text: string | null;
  sent_at: string | null;
  received_at: string | null;
  raw: Record<string, unknown>;
};

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const candidateId = url.searchParams.get("candidateId") ?? "";
    const sync = url.searchParams.get("sync") === "1";

    if (!candidateId) {
      return NextResponse.json({ error: "candidateId is required." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { companyId } = await ensureCompanyMembership(admin, user.id);

    const { data: candidateRow, error: candidateError } = await admin
      .from("candidates")
      .select("id,data")
      .eq("id", candidateId)
      .maybeSingle();
    if (candidateError) {
      return NextResponse.json({ error: candidateError.message }, { status: 500 });
    }
    if (!candidateRow) {
      return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
    }

    const candidateData = (candidateRow.data ?? {}) as Record<string, unknown>;
    const candidateEmail = asString(candidateData.email).trim().toLowerCase();

    const { data: mailbox } = await admin
      .from("company_mailboxes")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_shared", true)
      .maybeSingle();

    if (mailbox?.provider === "gmail" && mailbox.id && sync) {
      if (!candidateEmail) {
        return NextResponse.json(
          { error: "Candidate has no email address." },
          { status: 400 }
        );
      }
      const mailboxRow = mailbox as unknown as GmailMailboxRow;
      const accessToken = await getValidGmailAccessToken(admin, mailboxRow);

      // Include cc: because Google Calendar notifications often list attendees in CC.
      const query = `(from:${candidateEmail} OR to:${candidateEmail} OR cc:${candidateEmail})`;
      const list = (await gmailFetchJson(
        accessToken,
        `/users/me/messages?q=${encodeURIComponent(query)}&includeSpamTrash=true&maxResults=50`
      )) as Record<string, unknown> | null;
      const items = Array.isArray(list?.messages)
        ? (list?.messages as Array<Record<string, unknown>>)
        : [];
      const providerIds = items
        .map((item) => (typeof item?.id === "string" ? item.id : null))
        .filter((value): value is string => Boolean(value));

      const existingRes =
        providerIds.length > 0
          ? await admin
              .from("email_messages")
              .select("provider_message_id")
              .eq("mailbox_id", mailboxRow.id)
              .in("provider_message_id", providerIds)
          : { data: [] as Array<{ provider_message_id: string }>, error: null as { message?: string } | null };
      if (existingRes.error) {
        return NextResponse.json(
          { error: existingRes.error.message ?? "Failed to load existing email ids." },
          { status: 500 }
        );
      }
      const existing = new Set(
        (existingRes.data ?? [])
          .map((row) => (row as { provider_message_id?: string }).provider_message_id)
          .filter((value): value is string => typeof value === "string" && Boolean(value))
      );

      const toFetch = providerIds.filter((id) => !existing.has(id));
      const rows: EmailUpsertRow[] = [];

      const fetchOne = async (id: string) => {
        try {
          const message = await gmailFetchJson(accessToken, `/users/me/messages/${id}?format=full`);
          const parsed = parseGmailMessage(message, mailboxRow.email_address);
          if (!parsed.provider_message_id) return null;
          return {
            candidate_id: candidateId,
            mailbox_id: mailboxRow.id,
            provider: "gmail",
            provider_message_id: parsed.provider_message_id,
            provider_thread_id: parsed.provider_thread_id,
            direction: parsed.direction,
            from_email: parsed.from_email,
            from_name: parsed.from_name,
            to_emails: parsed.to_emails,
            cc_emails: parsed.cc_emails,
            bcc_emails: parsed.bcc_emails,
            subject: parsed.subject,
            snippet: parsed.snippet,
            body_html: parsed.body_html,
            body_text: parsed.body_text,
            sent_at: parsed.sent_at,
            received_at: parsed.received_at,
            raw: parsed.raw,
          } satisfies EmailUpsertRow;
        } catch (err) {
          console.error("[email thread sync] gmail fetch failed", err);
          return null;
        }
      };

      for (const group of chunk(toFetch, 6)) {
        const batch = await Promise.all(group.map(fetchOne));
        batch.forEach((row) => {
          if (row) rows.push(row);
        });
      }

      if (rows.length > 0) {
        await admin.from("email_messages").upsert(rows, {
          onConflict: "mailbox_id,provider_message_id",
        });
      }
    }

    const { data: messages, error: msgError } = await admin
      .from("email_messages")
      .select(
        [
          "id",
          "provider",
          "provider_thread_id",
          "direction",
          "from_email",
          "from_name",
          "to_emails",
          "cc_emails",
          "bcc_emails",
          "subject",
          "snippet",
          "body_html",
          "body_text",
          "sent_at",
          "received_at",
          "opens_count",
          "clicks_count",
          "raw",
          "created_at",
        ].join(",")
      )
      .eq("candidate_id", candidateId)
      .order("sent_at", { ascending: false, nullsFirst: false });

    if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

    const formatted = (messages ?? []).map((row) => {
      const record = row as unknown as Record<string, unknown>;
      const raw = record.raw ?? null;
      const attachments = getGmailAttachmentsFromMessage(raw);
      const { raw: _omit, ...rest } = record;
      return { ...rest, attachments };
    });

    return NextResponse.json({
      configured: Boolean(mailbox?.id),
      provider: mailbox?.provider ?? null,
      mailboxEmail: mailbox?.email_address ?? null,
      messages: formatted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load email thread.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
