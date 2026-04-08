import { NextResponse } from "next/server";
import crypto from "crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrimaryCompanyId, isCompanyAdmin } from "@/lib/company/primary";
import { hubspotFetchJson } from "@/lib/hubspot";
import { pools, stages as defaultStages } from "@/app/pipeline/data";

export const runtime = "nodejs";

const COMPANIES_PIPELINE_ID = "companies";
const DEFAULT_STAGE_ID = defaultStages[0]?.id ?? "consultation";
const DEFAULT_POOL_ID = pools[0]?.id ?? "roomy";

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const stableUuidFromString = (input: string) => {
  const hash = crypto.createHash("sha256").update(input).digest();
  const bytes = hash.subarray(0, 16);
  // RFC 4122 variant + v4 (deterministic).
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
};

type HubSpotListResponse<T> = {
  results: T[];
  paging?: { next?: { after: string } };
};

type HubSpotObject = {
  id: string;
  properties: Record<string, string | null | undefined>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
};

type HubSpotAssociationResponse = {
  results: Array<{ id: string }>;
  paging?: { next?: { after: string } };
};

const parseCsvEmails = (value?: string | null) => {
  if (!value) return [];
  return value
    .split(/[;,]/g)
    .map((part) => part.trim())
    .filter(Boolean);
};

const toIsoStringOrNull = (value?: string | null, fallback?: string | null) => {
  const raw = (value ?? "").trim();
  const base = raw ? raw : "";
  if (!base) return fallback ?? null;
  const maybeMs = Number(base);
  const date = Number.isFinite(maybeMs) && maybeMs > 0 ? new Date(maybeMs) : new Date(base);
  if (Number.isNaN(date.getTime())) return fallback ?? null;
  try {
    return date.toISOString();
  } catch {
    return fallback ?? null;
  }
};

const ensureCompaniesPipeline = async (admin: ReturnType<typeof createSupabaseAdminClient>) => {
  await admin
    .from("pipelines")
    .upsert({ id: COMPANIES_PIPELINE_ID, name: "Companies" }, { onConflict: "id" });

  const stageRows = defaultStages.map((stage, index) => ({
    pipeline_id: COMPANIES_PIPELINE_ID,
    id: stage.id,
    name: stage.name,
    order: Number.isFinite(stage.order) ? stage.order : index,
  }));
  if (stageRows.length > 0) {
    await admin.from("pipeline_stages").upsert(stageRows, { onConflict: "pipeline_id,id" });
  }
};

const listAssociationIds = async (
  fromObjectType: string,
  fromId: string,
  toObjectType: string,
  limit: number
) => {
  const ids: string[] = [];
  let after: string | null = null;

  while (ids.length < limit) {
    const batchLimit = Math.min(500, limit - ids.length);
    const qs = new URLSearchParams({ limit: String(batchLimit) });
    if (after) qs.set("after", after);
    const res = await hubspotFetchJson<HubSpotAssociationResponse>(
      `/crm/v3/objects/${encodeURIComponent(fromObjectType)}/${encodeURIComponent(
        fromId
      )}/associations/${encodeURIComponent(toObjectType)}?${qs.toString()}`
    );
    (res.results ?? []).forEach((row) => {
      if (row?.id) ids.push(String(row.id));
    });
    after = res.paging?.next?.after ?? null;
    if (!after) break;
  }

  return ids.slice(0, limit);
};

const batchReadObjects = async (
  objectType: string,
  ids: string[],
  properties: string[]
) => {
  if (ids.length === 0) return [] as HubSpotObject[];
  const out: HubSpotObject[] = [];
  for (const group of chunk(ids, 100)) {
    const payload = {
      inputs: group.map((id) => ({ id })),
      properties,
    };
    const res = await hubspotFetchJson<{ results: HubSpotObject[] }>(
      `/crm/v3/objects/${encodeURIComponent(objectType)}/batch/read`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
    (res.results ?? []).forEach((row) => {
      if (row?.id) out.push(row);
    });
  }
  return out;
};

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as
      | {
          limit?: number;
          after?: string | null;
          includeRelated?: boolean;
          relatedLimit?: number;
          dryRun?: boolean;
        }
      | null;

    const limit = clampInt(body?.limit, 1, 500, 100);
    const includeRelated = Boolean(body?.includeRelated);
    const relatedLimit = clampInt(body?.relatedLimit, 0, 500, 50);
    const after = typeof body?.after === "string" && body.after.trim() ? body.after.trim() : null;
    const dryRun = Boolean(body?.dryRun);

    const { data: member } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);
    const allowed = await isCompanyAdmin(admin, companyId, user.id);
    if (!allowed) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    await ensureCompaniesPipeline(admin);

    const companyProps = [
      "name",
      "domain",
      "website",
      "phone",
      "city",
      "country",
      "industry",
      "hubspot_owner_id",
      "hs_lastmodifieddate",
      "hs_lastactivitydate",
    ];

    const qs = new URLSearchParams({ limit: String(limit), properties: companyProps.join(",") });
    if (after) qs.set("after", after);

    const list = await hubspotFetchJson<HubSpotListResponse<HubSpotObject>>(
      `/crm/v3/objects/companies?${qs.toString()}`
    );

    const now = new Date().toISOString();
    const upsertCompanies = (list.results ?? []).filter((row) => row && row.id);
    const companyRows = upsertCompanies.map((row) => {
      const props = row.properties ?? {};
      const name = String(props.name ?? "").trim() || `Company ${row.id}`;
      const website = String(props.website ?? props.domain ?? "").trim();
      const phone = String(props.phone ?? "").trim();
      const city = String(props.city ?? "").trim();
      const country = String(props.country ?? "").trim();
      const industry = String(props.industry ?? "").trim();
      const ownerId = String(props.hubspot_owner_id ?? "").trim();
      const lastMod = String(props.hs_lastmodifieddate ?? "").trim();
      const lastActivity = String(props.hs_lastactivitydate ?? "").trim();

      const updatedAt =
        lastActivity || lastMod || row.updatedAt || row.createdAt || now;
      const createdAt = row.createdAt || now;

      return {
        id: `hubspot_company_${row.id}`,
        pipeline_id: COMPANIES_PIPELINE_ID,
        stage_id: DEFAULT_STAGE_ID,
        pool_id: DEFAULT_POOL_ID,
        status: "active",
        order: 0,
        created_at: createdAt,
        updated_at: updatedAt,
        data: {
          name,
          email: "",
          website_url: website,
          phone: phone || null,
          city: city || null,
          country: country || null,
          industry: industry || null,
          company_owner: ownerId ? `HubSpot owner ${ownerId}` : null,
          company_owner_id: ownerId ? `hubspot_owner_${ownerId}` : null,
          hubspot: {
            object: "company",
            id: row.id,
            imported_at: now,
            properties: props,
          },
        },
      };
    });

    let companiesUpserted = 0;
    let notesUpserted = 0;
    let tasksUpserted = 0;
    let emailsUpserted = 0;

    if (!dryRun && companyRows.length > 0) {
      const { error } = await admin.from("candidates").upsert(companyRows, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    companiesUpserted = companyRows.length;

    if (includeRelated && relatedLimit > 0) {
      for (const company of upsertCompanies) {
        const candidateId = `hubspot_company_${company.id}`;
        const noteIds = await listAssociationIds("companies", company.id, "notes", relatedLimit);
        const taskIds = await listAssociationIds("companies", company.id, "tasks", relatedLimit);
        const emailIds = await listAssociationIds("companies", company.id, "emails", relatedLimit);

        if (noteIds.length > 0) {
          const notes = await batchReadObjects("notes", noteIds, [
            "hs_note_body",
            "hs_timestamp",
            "hubspot_owner_id",
          ]);
          const rows = notes.map((note) => {
            const props = note.properties ?? {};
            const body = String(props.hs_note_body ?? "").trim();
            const ts = String(props.hs_timestamp ?? "").trim();
            const createdAt =
              toIsoStringOrNull(ts, toIsoStringOrNull(note.createdAt ?? null, now)) ?? now;
            const ownerId = String(props.hubspot_owner_id ?? "").trim();
            return {
              id: stableUuidFromString(`hubspot_note_${note.id}`),
              candidate_id: candidateId,
              body: body || "(empty note)",
              created_at: createdAt,
              author_name: ownerId ? `HubSpot owner ${ownerId}` : "HubSpot",
              author_email: null,
              author_id: null,
            };
          });
          if (!dryRun && rows.length > 0) {
            await admin.from("candidate_notes").upsert(rows, { onConflict: "id" });
          }
          notesUpserted += rows.length;
        }

        if (taskIds.length > 0) {
          const tasks = await batchReadObjects("tasks", taskIds, [
            "hs_task_subject",
            "hs_task_body",
            "hs_task_status",
            "hs_timestamp",
            "hubspot_owner_id",
          ]);
          const rows = tasks.map((task) => {
            const props = task.properties ?? {};
            const title = String(props.hs_task_subject ?? "").trim() || "Task";
            const statusRaw = String(props.hs_task_status ?? "").trim().toLowerCase();
            const status = statusRaw === "completed" || statusRaw === "done" ? "done" : "open";
            const ts = String(props.hs_timestamp ?? "").trim();
            const dueAt = toIsoStringOrNull(ts, null);
            const notes = String(props.hs_task_body ?? "").trim() || null;
            const completedAt =
              status === "done" ? toIsoStringOrNull(task.updatedAt ?? null, now) : null;
            return {
              candidate_id: candidateId,
              id: `hubspot_task_${task.id}`,
              kind: "task",
              title,
              status,
              watcher_ids: [],
              assigned_to: null,
              due_at: dueAt,
              reminder_minutes_before: null,
              notes,
              created_at: toIsoStringOrNull(task.createdAt ?? null, now) ?? now,
              completed_at: completedAt,
              completed_by: null,
            };
          });
          if (!dryRun && rows.length > 0) {
            await admin.from("candidate_tasks").upsert(rows, { onConflict: "candidate_id,id" });
          }
          tasksUpserted += rows.length;
        }

        if (emailIds.length > 0) {
          const emails = await batchReadObjects("emails", emailIds, [
            "hs_email_subject",
            "hs_email_text",
            "hs_email_html",
            "hs_email_direction",
            "hs_timestamp",
            "hs_email_from_email",
            "hs_email_to_email",
            "hs_email_cc_email",
            "hs_email_bcc_email",
          ]);
          const rows = emails.map((email) => {
            const props = email.properties ?? {};
            const subject = String(props.hs_email_subject ?? "").trim() || null;
            const bodyText = String(props.hs_email_text ?? "").trim() || null;
            const bodyHtml = String(props.hs_email_html ?? "").trim() || null;
            const directionRaw = String(props.hs_email_direction ?? "").trim().toUpperCase();
            const direction = directionRaw === "EMAIL" ? "out" : "in";
            const ts = String(props.hs_timestamp ?? "").trim();
            const sentAt =
              toIsoStringOrNull(ts, toIsoStringOrNull(email.createdAt ?? null, now)) ?? now;
            const fromEmail = String(props.hs_email_from_email ?? "").trim() || null;
            const toEmails = parseCsvEmails(String(props.hs_email_to_email ?? ""));
            const ccEmails = parseCsvEmails(String(props.hs_email_cc_email ?? ""));
            const bccEmails = parseCsvEmails(String(props.hs_email_bcc_email ?? ""));
            const snippet = (bodyText ?? "").slice(0, 240) || null;

            return {
              id: stableUuidFromString(`hubspot_email_${email.id}`),
              candidate_id: candidateId,
              mailbox_id: null,
              provider: "hubspot",
              provider_message_id: String(email.id),
              provider_thread_id: `hubspot_company_${company.id}`,
              direction,
              from_email: fromEmail,
              from_name: null,
              to_emails: toEmails,
              cc_emails: ccEmails,
              bcc_emails: bccEmails,
              subject,
              snippet,
              body_html: bodyHtml,
              body_text: bodyText,
              sent_at: sentAt,
              received_at: direction === "in" ? sentAt : null,
              tracking_token: null,
              opens_count: 0,
              clicks_count: 0,
              raw: {
                hubspot: {
                  object: "email",
                  id: email.id,
                  imported_at: now,
                  properties: props,
                },
              },
              created_at: now,
            };
          });

          if (!dryRun && rows.length > 0) {
            await admin.from("email_messages").upsert(rows, { onConflict: "id" });
          }
          emailsUpserted += rows.length;
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        dryRun,
        request: { limit, after, includeRelated, relatedLimit },
        result: {
          companiesUpserted,
          notesUpserted,
          tasksUpserted,
          emailsUpserted,
          nextAfter: list.paging?.next?.after ?? null,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync HubSpot companies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
