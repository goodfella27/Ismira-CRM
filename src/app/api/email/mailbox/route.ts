import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureCompanyMembership } from "@/lib/company/membership";

export const runtime = "nodejs";

const maskSecret = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${"•".repeat(Math.max(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
};

type MailboxRow = {
  id: string;
  provider: string;
  email_address: string;
  display_name: string | null;
  oauth_expires_at: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_password: string | null;
  imap_tls: boolean | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_tls: boolean | null;
  updated_at: string | null;
};

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const companyId = membership.companyId;
    const role = (membership.role ?? "").toLowerCase();
    const canEdit = role === "admin";

    let mailbox: MailboxRow | null = null;
    const mailboxRes = await admin
      .from("company_mailboxes")
      .select(
        [
          "id",
          "provider",
          "email_address",
          "display_name",
          "oauth_expires_at",
          "imap_host",
          "imap_port",
          "imap_user",
          "imap_password",
          "imap_tls",
          "smtp_host",
          "smtp_port",
          "smtp_user",
          "smtp_password",
          "smtp_tls",
          "updated_at",
        ].join(",")
      )
      .eq("company_id", companyId)
      .eq("is_shared", true)
      .maybeSingle();
    if (mailboxRes.error) {
      throw new Error(mailboxRes.error.message ?? "Failed to load mailbox.");
    }
    mailbox = (mailboxRes.data as MailboxRow | null) ?? null;

    const configured = Boolean(mailbox?.id);
    const provider = (mailbox?.provider as string | null) ?? null;
    const row = (mailbox ?? null) as MailboxRow | null;
    const hasImapPassword = Boolean(row?.imap_password);
    const hasSmtpPassword = Boolean(row?.smtp_password);

    return NextResponse.json({
      configured,
      provider,
      emailAddress: (mailbox?.email_address as string | null) ?? null,
      displayName: (mailbox?.display_name as string | null) ?? null,
      updatedAt: (mailbox?.updated_at as string | null) ?? null,
      canEdit,
      config: canEdit
        ? {
            imap: mailbox?.imap_host
              ? {
                  host: mailbox.imap_host,
                  port: mailbox.imap_port ?? null,
                  user: mailbox.imap_user ?? null,
                  tls: mailbox.imap_tls ?? true,
                  hasPassword: hasImapPassword,
                  passwordMasked: hasImapPassword ? maskSecret("********") : null,
                }
              : null,
            smtp: mailbox?.smtp_host
              ? {
                  host: mailbox.smtp_host,
                  port: mailbox.smtp_port ?? null,
                  user: mailbox.smtp_user ?? null,
                  tls: mailbox.smtp_tls ?? true,
                  hasPassword: hasSmtpPassword,
                  passwordMasked: hasSmtpPassword ? maskSecret("********") : null,
                }
              : null,
            oauthExpiresAt: mailbox?.oauth_expires_at ?? null,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load mailbox status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type UpdateBody =
  | {
      disconnect?: boolean;
      provider?: "smtp_imap";
      emailAddress?: string;
      displayName?: string;
      imap?: { host?: string; port?: number; user?: string; password?: string; tls?: boolean };
      smtp?: { host?: string; port?: number; user?: string; password?: string; tls?: boolean };
    }
  | null;

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);
    const role = (membership.role ?? "").toLowerCase();
    if (role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    const companyId = membership.companyId;

    const body = (await request.json().catch(() => null)) as UpdateBody;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    if (body.disconnect) {
      await supabase
        .from("company_mailboxes")
        .delete()
        .eq("company_id", companyId)
        .eq("is_shared", true);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (body.provider !== "smtp_imap") {
      return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
    }

    const emailAddress = typeof body.emailAddress === "string" ? body.emailAddress.trim() : "";
    if (!emailAddress) {
      return NextResponse.json({ error: "emailAddress is required." }, { status: 400 });
    }
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

    const existing = await supabase
      .from("company_mailboxes")
      .select("id,imap_password,smtp_password")
      .eq("company_id", companyId)
      .eq("is_shared", true)
      .maybeSingle();

    const existingImapPassword = (existing.data?.imap_password as string | null) ?? null;
    const existingSmtpPassword = (existing.data?.smtp_password as string | null) ?? null;

    const imapPassword =
      typeof body.imap?.password === "string" && body.imap.password.trim()
        ? body.imap.password.trim()
        : existingImapPassword;
    const smtpPassword =
      typeof body.smtp?.password === "string" && body.smtp.password.trim()
        ? body.smtp.password.trim()
        : existingSmtpPassword;

    await supabase.from("company_mailboxes").upsert({
      id: existing.data?.id ?? undefined,
      company_id: companyId,
      provider: "smtp_imap",
      email_address: emailAddress,
      display_name: displayName ? displayName : null,
      is_shared: true,
      imap_host: body.imap?.host?.trim() ?? null,
      imap_port: typeof body.imap?.port === "number" ? body.imap.port : null,
      imap_user: body.imap?.user?.trim() ?? null,
      imap_password: imapPassword,
      imap_tls: typeof body.imap?.tls === "boolean" ? body.imap.tls : true,
      smtp_host: body.smtp?.host?.trim() ?? null,
      smtp_port: typeof body.smtp?.port === "number" ? body.smtp.port : null,
      smtp_user: body.smtp?.user?.trim() ?? null,
      smtp_password: smtpPassword,
      smtp_tls: typeof body.smtp?.tls === "boolean" ? body.smtp.tls : true,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update mailbox.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
