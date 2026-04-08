import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getGmailAttachmentsFromMessage,
  getValidGmailAccessToken,
  gmailFetchJson,
  type GmailMailboxRow,
} from "@/lib/email/gmail";
import { ensureCompanyMembership } from "@/lib/company/membership";

export const runtime = "nodejs";

const decodeBase64UrlToBuffer = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64");
};

const sanitizeFilename = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "attachment";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const messageId = url.searchParams.get("id") ?? "";
    const attachmentId = url.searchParams.get("aid") ?? "";

    if (!messageId || !attachmentId) {
      return NextResponse.json({ error: "Missing id or aid." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const { companyId } = await ensureCompanyMembership(admin, user.id);

    const { data: message, error: messageError } = await admin
      .from("email_messages")
      .select("id,provider,provider_message_id,mailbox_id,raw")
      .eq("id", messageId)
      .maybeSingle();
    if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 });
    if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });

    if (message.provider !== "gmail") {
      return NextResponse.json({ error: "Attachments supported for Gmail only." }, { status: 400 });
    }

    const { data: mailbox } = await admin
      .from("company_mailboxes")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", message.mailbox_id)
      .maybeSingle();
    if (!mailbox) return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });

    const mailboxRow = mailbox as unknown as GmailMailboxRow;
    const accessToken = await getValidGmailAccessToken(admin, mailboxRow);

    const attachments = getGmailAttachmentsFromMessage(message.raw);
    const meta = attachments.find((item) => item.attachmentId === attachmentId) ?? null;
    if (!meta) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });

    const data = (await gmailFetchJson(
      accessToken,
      `/users/me/messages/${encodeURIComponent(
        message.provider_message_id
      )}/attachments/${encodeURIComponent(attachmentId)}`
    )) as Record<string, unknown> | null;

    const encoded = data && typeof data.data === "string" ? data.data : "";
    if (!encoded) return NextResponse.json({ error: "Attachment download failed." }, { status: 502 });

    const buffer = decodeBase64UrlToBuffer(encoded);
    const filename = sanitizeFilename(meta.filename);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": meta.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to download attachment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
