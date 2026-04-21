import { NextResponse } from "next/server";
import crypto from "crypto";

import { breezyFetch, requireBreezyIds } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pools, stages as defaultStages } from "@/app/pipeline/data";
import {
  extractBreezyDocumentCreatedAt,
  extractBreezyDocumentCreatedBy,
  extractBreezyDocumentId,
  extractBreezyDocumentMime,
  extractBreezyDocumentName,
  normalizeBreezyDocuments,
} from "@/lib/breezy-documents";
import {
  extractBreezyEducation,
  extractBreezyStreamItems,
  extractBreezySummary,
  extractBreezyWorkHistory,
  normalizeBreezyTags,
} from "@/lib/breezy-candidate-profile";

export const runtime = "nodejs";

const DEFAULT_PIPELINE_ID = "breezy";
const DEFAULT_STAGE_ID = defaultStages[0]?.id ?? "consultation";
const DEFAULT_POOL_ID = pools[0]?.id ?? "roomy";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stableUuidFromString(input: string) {
  const hash = crypto.createHash("sha256").update(input).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

function buildInternalCandidateId(candidateId: string) {
  const encoded = Buffer.from(candidateId).toString("base64url");
  return `breezy_${encoded}`;
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

async function fetchJson(url: string) {
  const res = await breezyFetch(url);
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const isProbablyBinary =
    /application\/pdf/i.test(contentType) ||
    /application\/octet-stream/i.test(contentType) ||
    /^image\//i.test(contentType) ||
    /^video\//i.test(contentType);
  const body = isJson ? await res.json() : isProbablyBinary ? null : await res.text();
  return { res, body };
}

function normalizeDocuments(payload: unknown) {
  return normalizeBreezyDocuments(payload);
}

function mergeTags(existing: unknown, incoming: string[]) {
  const prev = Array.isArray(existing)
    ? existing.filter((item) => typeof item === "string")
    : [];
  const normalizedPrev = normalizeBreezyTags(prev);
  const next = [...normalizedPrev];
  for (const tag of incoming) {
    if (!tag) continue;
    if (next.includes(tag)) continue;
    next.push(tag);
  }
  return next;
}

function unwrapDataRecord(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  const data = (payload as Record<string, unknown>).data;
  if (!isRecord(data)) return payload;
  return data;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    await ensureCompanyMembership(admin, user.id);

    const payload = (await request.json().catch(() => null)) as
      | {
          candidateId?: unknown;
          pipelineId?: unknown;
          companyId?: unknown;
          positionId?: unknown;
          details?: unknown;
          documents?: unknown;
        }
      | null;
    const breezyCandidateId = asString(payload?.candidateId).trim();
    if (!breezyCandidateId) {
      return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
    }

    const pipelineId = asString(payload?.pipelineId).trim() || DEFAULT_PIPELINE_ID;

    const companyParam = asString(payload?.companyId).trim();
    const positionParam = asString(payload?.positionId).trim();
    const { companyId, positionId } =
      companyParam && positionParam
        ? { companyId: companyParam, positionId: positionParam }
        : requireBreezyIds();

    const providedDetails = payload?.details;
    const providedDocs = payload?.documents;

    const details =
      isRecord(providedDetails)
        ? (providedDetails as Record<string, unknown>)
        : null;
    const docsInput =
      Array.isArray(providedDocs) || isRecord(providedDocs) ? providedDocs : null;

    const unwrappedProvidedDetails = unwrapDataRecord(details);
    let resolvedDetails: Record<string, unknown> = isRecord(unwrappedProvidedDetails)
      ? (unwrappedProvidedDetails as Record<string, unknown>)
      : {};
    let docs: Record<string, unknown>[] = docsInput ? normalizeDocuments(docsInput) : [];

    if (!details) {
      const detailsUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
        companyId
      )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(
        breezyCandidateId
      )}`;

      const detailsRes = await fetchJson(detailsUrl);
      if (!detailsRes.res.ok) {
        return NextResponse.json(
          {
            error: "Breezy candidate request failed",
            status: detailsRes.res.status,
            details: detailsRes.body,
          },
          { status: detailsRes.res.status }
        );
      }
      const unwrapped = unwrapDataRecord(detailsRes.body);
      resolvedDetails = isRecord(unwrapped) ? (unwrapped as Record<string, unknown>) : {};
    }

    if (!docsInput) {
      const docsUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
        companyId
      )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(
        breezyCandidateId
      )}/documents`;
      const docsRes = await fetchJson(docsUrl);
      if (!docsRes.res.ok) {
        return NextResponse.json(
          {
            error: "Breezy documents request failed",
            status: docsRes.res.status,
            details: docsRes.body,
          },
          { status: docsRes.res.status }
        );
      }
      docs = normalizeDocuments(docsRes.body);
    }

    const name = pickFirstString(
      resolvedDetails.name,
      resolvedDetails.full_name,
      resolvedDetails.fullName,
      resolvedDetails.title,
      breezyCandidateId
    );
    const email = pickFirstString(
      resolvedDetails.email_address,
      resolvedDetails.email,
      resolvedDetails.emailAddress,
      (() => {
        const profile = (resolvedDetails as Record<string, unknown>).profile;
        return isRecord(profile) ? asString(profile.email) : "";
      })()
    );
    const phone = pickFirstString(
      resolvedDetails.phone_number,
      resolvedDetails.phone,
      resolvedDetails.phoneNumber
    );

    const stage = pickFirstString(
      resolvedDetails.stage,
      resolvedDetails.stage_name,
      resolvedDetails.stageName
    );
    const source = pickFirstString(
      resolvedDetails.source,
      resolvedDetails.source_name,
      resolvedDetails.sourceName
    );

    const internalId = buildInternalCandidateId(`${companyId}:${positionId}:${breezyCandidateId}`);
    const now = new Date().toISOString();
    const buildId = (key: string) =>
      stableUuidFromString(`${companyId}:${positionId}:${breezyCandidateId}:${key}`);
    const profile =
      isRecord((resolvedDetails as Record<string, unknown>).profile)
        ? ((resolvedDetails as Record<string, unknown>).profile as Record<string, unknown>)
        : null;
    const customAttributes =
      (resolvedDetails as Record<string, unknown>).custom_attributes ??
      (resolvedDetails as Record<string, unknown>).customAttributes ??
      profile?.custom_attributes ??
      profile?.customAttributes ??
      null;

    const attachments = docs
      .map((doc) => {
        const docId = extractBreezyDocumentId(doc);
        if (!docId) return null;
        const name = extractBreezyDocumentName(doc);
        const mime = extractBreezyDocumentMime(doc);
        const createdAt = extractBreezyDocumentCreatedAt(doc);
        const createdBy = extractBreezyDocumentCreatedBy(doc);
        const proxyUrl = `/api/breezy/candidate-document?candidateId=${encodeURIComponent(
          internalId
        )}&docId=${encodeURIComponent(docId)}`;
        return {
          id: stableUuidFromString(`breezy_doc_${breezyCandidateId}_${docId}`),
          name: name || undefined,
          mime: mime || undefined,
          url: proxyUrl,
          path: undefined,
          kind: "document" as const,
          created_at: createdAt || undefined,
          created_by: createdBy || undefined,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name?: string;
      mime?: string;
      url?: string;
      path?: string;
      kind: "document";
      created_at?: string;
      created_by?: string;
    }>;

    // Ensure stage exists for pipeline; fall back to DEFAULT_STAGE_ID.
    let stageId = DEFAULT_STAGE_ID;
    try {
      const { data } = await admin
        .from("pipeline_stages")
        .select("id,order")
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: true })
        .limit(1);
      const first = Array.isArray(data) ? (data as Array<{ id: string }>)[0] : null;
      if (first?.id) stageId = first.id;
    } catch {
      stageId = DEFAULT_STAGE_ID;
    }

    const candidateRow = {
      id: internalId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      pool_id: DEFAULT_POOL_ID,
      status: "active",
      order: 0,
      created_at: now,
      updated_at: now,
      data: {
        name,
        email: email || `unknown-${internalId}@breezy.local`,
        phone: phone || undefined,
        source: "Breezy",
        desired_position:
          pickFirstString(
            (resolvedDetails as Record<string, unknown>).position,
            (resolvedDetails as Record<string, unknown>).position_name,
            (resolvedDetails as Record<string, unknown>).positionName
          ) || undefined,
        city: pickFirstString(profile?.city, (resolvedDetails as Record<string, unknown>).city) || undefined,
        country:
          pickFirstString(
            profile?.country,
            (resolvedDetails as Record<string, unknown>).country
          ) || undefined,
        nationality:
          pickFirstString(
            profile?.nationality,
            (resolvedDetails as Record<string, unknown>).nationality
          ) || undefined,
        availability:
          pickFirstString(
            profile?.availability,
            (resolvedDetails as Record<string, unknown>).availability
          ) || undefined,
        salary_expectation:
          pickFirstString(
            profile?.salary_expectation,
            (resolvedDetails as Record<string, unknown>).salary_expectation
          ) || undefined,
        experience_summary: extractBreezySummary(resolvedDetails) || undefined,
        tags: normalizeBreezyTags((resolvedDetails as Record<string, unknown>)?.tags) || [],
        breezy: {
          company_id: companyId,
          position_id: positionId,
          candidate_id: breezyCandidateId,
          stage: stage || undefined,
          source: source || undefined,
          raw: resolvedDetails,
          custom_attributes: customAttributes,
          last_synced_at: now,
        },
        attachments,
      },
    };

    const { error: upsertError } = await admin.from("candidates").upsert([candidateRow], {
      onConflict: "id",
      defaultToNull: false,
    });
    if (upsertError) throw new Error(upsertError.message ?? "Failed to upsert candidate");

    if (attachments.length > 0) {
      const attachmentRows = attachments.map((att) => ({
        id: att.id,
        candidate_id: internalId,
        name: att.name ?? null,
        mime: att.mime ?? null,
        url: att.url ?? null,
        path: att.path ?? null,
        kind: att.kind,
        created_at: att.created_at ?? now,
        created_by: att.created_by ?? null,
      }));
      const { error: attachError } = await admin
        .from("candidate_attachments")
        .upsert(attachmentRows, { onConflict: "id", defaultToNull: false });
      if (attachError) throw new Error(attachError.message ?? "Failed to store attachments");
    }

    const tags = normalizeBreezyTags((resolvedDetails as Record<string, unknown>)?.tags);
    const workHistory = extractBreezyWorkHistory(resolvedDetails, buildId);
    const education = extractBreezyEducation(resolvedDetails, buildId);

    if (workHistory.length > 0) {
      const workRows = workHistory.map((item) => ({
        id: item.id,
        candidate_id: internalId,
        role: item.role,
        company: item.company,
        start: item.start ?? null,
        end: item.end ?? null,
        details: item.details ?? null,
        created_at: now,
      }));
      const { error: workError } = await admin
        .from("candidate_work_history")
        .upsert(workRows, { onConflict: "id", defaultToNull: false });
      if (workError) throw new Error(workError.message ?? "Failed to store work history");
    }

    if (education.length > 0) {
      const eduRows = education.map((item) => ({
        id: item.id,
        candidate_id: internalId,
        program: item.program,
        institution: item.institution,
        start: item.start ?? null,
        end: item.end ?? null,
        details: item.details ?? null,
        created_at: now,
      }));
      const { error: eduError } = await admin
        .from("candidate_education")
        .upsert(eduRows, { onConflict: "id", defaultToNull: false });
      if (eduError) throw new Error(eduError.message ?? "Failed to store education");
    }

    // Pull Breezy stream/meta to populate notes + activity (best-effort).
    try {
      const metaUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
        companyId
      )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(
        breezyCandidateId
      )}/meta`;
      const streamUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
        companyId
      )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(
        breezyCandidateId
      )}/stream`;

      const [metaRes, streamRes] = await Promise.all([
        fetchJson(metaUrl).catch(() => null),
        fetchJson(streamUrl).catch(() => null),
      ]);

      const metaPayload =
        metaRes && metaRes.res.ok ? (metaRes.body as unknown) : null;
      const streamPayload =
        streamRes && streamRes.res.ok ? (streamRes.body as unknown) : null;

      const streamItems = streamPayload
        ? extractBreezyStreamItems(streamPayload, buildId)
        : [];

      const noteActivityRowMap = new Map<
        string,
        {
          id: string;
          candidate_id: string;
          type: "note";
          body: string;
          created_at: string;
          author_name: string | null;
          author_email: string | null;
          author_id: null;
        }
      >();

      if (isRecord(metaPayload) && Array.isArray((metaPayload as Record<string, unknown>).notes)) {
        const notes = (metaPayload as Record<string, unknown>).notes as unknown[];
        for (const [index, entry] of notes.entries()) {
          if (!isRecord(entry)) continue;
          const rawId = pickFirstString(entry._id, entry.id, entry.note_id, entry.noteId);
          const body = pickFirstString(entry.body, entry.text, entry.message, entry.content, entry.note);
          if (!body.trim()) continue;
          const createdAt = pickFirstString(entry.created_at, entry.createdAt, entry.timestamp, entry.date);
          const user = isRecord(entry.user) ? (entry.user as Record<string, unknown>) : null;
          const authorName = pickFirstString(entry.author_name, entry.authorName, user?.name, user?.email);
          const authorEmail = pickFirstString(entry.author_email, entry.authorEmail, user?.email, user?.email_address);
          const stableKey = rawId || `${createdAt}|${authorEmail}|${body.slice(0, 80)}|${index}`;
          const id = buildId(`breezy_meta_note|${stableKey}`);
          noteActivityRowMap.set(id, {
            id,
            candidate_id: internalId,
            type: "note",
            body,
            created_at: createdAt || now,
            author_name: authorName || null,
            author_email: authorEmail || null,
            author_id: null,
          });
        }
      }

      for (const item of streamItems) {
        if (item.kind !== "note") continue;
        if (!item.body.trim()) continue;
        noteActivityRowMap.set(item.id, {
          id: item.id,
          candidate_id: internalId,
          type: "note",
          body: item.body,
          created_at: item.created_at,
          author_name: item.author_name ?? null,
          author_email: item.author_email ?? null,
          author_id: null,
        });
      }

      const noteActivityRows = Array.from(noteActivityRowMap.values());
      const activityRows = streamItems
        .filter((item) => item.kind === "activity" && item.body.trim())
        .map((item) => ({
          id: item.id,
          candidate_id: internalId,
          type: item.type,
          body: item.body,
          created_at: item.created_at,
          author_name: item.author_name ?? null,
          author_email: item.author_email ?? null,
          author_id: null,
        }));

      const nextActivityRows = [...activityRows, ...noteActivityRows];
      if (nextActivityRows.length > 0) {
        await admin
          .from("candidate_activity")
          .upsert(nextActivityRows, { onConflict: "id", defaultToNull: false });
      }

      // Backfill tags/summary if missing in the stored candidate JSON.
      if (tags.length > 0 || metaPayload) {
        const { data: storedCandidate } = await admin
          .from("candidates")
          .select("id,data")
          .eq("id", internalId)
          .maybeSingle();
        const storedData = storedCandidate && isRecord(storedCandidate.data) ? storedCandidate.data : {};
        const storedBreezy = isRecord((storedData as Record<string, unknown>).breezy)
          ? ((storedData as Record<string, unknown>).breezy as Record<string, unknown>)
          : {};
        const nextTags = mergeTags((storedData as Record<string, unknown>).tags, tags);
        const nextSummary = extractBreezySummary(resolvedDetails).trim();
        const nextData: Record<string, unknown> = {
          ...(storedData as Record<string, unknown>),
          ...(nextTags.length > 0 ? { tags: nextTags } : {}),
          ...(nextSummary ? { experience_summary: nextSummary } : {}),
          breezy: { ...storedBreezy, meta: metaPayload, last_synced_at: now },
        };
        await admin.from("candidates").update({ data: nextData, updated_at: now }).eq("id", internalId);
      }
    } catch {
      // ignore (import should still succeed)
    }

    return NextResponse.json(
      { ok: true, candidate: { id: internalId, pipelineId: pipelineId, stageId }, attachments: attachments.length },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
