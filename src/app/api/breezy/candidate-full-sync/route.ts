import { NextResponse } from "next/server";
import crypto from "crypto";

import { breezyFetch } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  extractBreezyEducation,
  extractBreezyStreamItems,
  extractBreezySummary,
  extractBreezyWorkHistory,
  normalizeBreezyTags,
} from "@/lib/breezy-candidate-profile";

export const runtime = "nodejs";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
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

function extractMetaNotes(
  payload: unknown,
  buildId: (stableKey: string) => string
): Array<{
  id: string;
  body: string;
  created_at: string;
  author_name?: string | null;
  author_email?: string | null;
}> {
  if (!isRecord(payload)) return [];
  const notesValue = (payload as Record<string, unknown>).notes;
  const notes = Array.isArray(notesValue) ? notesValue : [];
  const out: Array<{
    id: string;
    body: string;
    created_at: string;
    author_name?: string | null;
    author_email?: string | null;
  }> = [];
  for (const [index, entry] of notes.entries()) {
    if (!isRecord(entry)) continue;
    const rawId = pickFirstString(entry._id, entry.id, entry.note_id, entry.noteId);
    const body = pickFirstString(entry.body, entry.text, entry.message, entry.content, entry.note);
    const createdAt = pickFirstString(entry.created_at, entry.createdAt, entry.timestamp, entry.date);
    const user = isRecord(entry.user) ? (entry.user as Record<string, unknown>) : null;
    const authorName = pickFirstString(entry.author_name, entry.authorName, user?.name, user?.email);
    const authorEmail = pickFirstString(entry.author_email, entry.authorEmail, user?.email, user?.email_address);
    const stableKey = rawId || `${createdAt}|${authorEmail}|${body.slice(0, 80)}|${index}`;
    if (!stableKey || !body) continue;
    out.push({
      id: buildId(`breezy_meta_note|${stableKey}`),
      body,
      created_at: createdAt || new Date().toISOString(),
      author_name: authorName || null,
      author_email: authorEmail || null,
    });
  }
  return out;
}

function unwrapDataRecord(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  const data = (payload as Record<string, unknown>).data;
  if (!isRecord(data)) return payload;
  return data;
}

function normalizeLooseText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreWorkMatch(
  incoming: { role: string; company: string; start?: string | null; end?: string | null; details?: string | null },
  existing: { role: string; company: string; start: string | null; end: string | null; details: string | null }
) {
  let score = 0;
  const inRole = normalizeLooseText(incoming.role);
  const exRole = normalizeLooseText(existing.role);
  if (inRole && exRole && inRole === exRole) score += 4;

  const inCompany = normalizeLooseText(incoming.company);
  const exCompany = normalizeLooseText(existing.company);
  if (inCompany && exCompany && inCompany === exCompany) score += 2;
  if (existing.company === "Company") score += 1;

  const inDetails = normalizeLooseText(incoming.details ?? "");
  const exDetails = normalizeLooseText(existing.details ?? "");
  if (inDetails && exDetails) {
    const a = inDetails.slice(0, 80);
    const b = exDetails.slice(0, 80);
    if (a && b && (a.includes(b) || b.includes(a))) score += 3;
  }

  const inStart = normalizeLooseText(incoming.start ?? "");
  const exStart = normalizeLooseText(existing.start ?? "");
  const inEnd = normalizeLooseText(incoming.end ?? "");
  const exEnd = normalizeLooseText(existing.end ?? "");
  if (inStart && exStart && inStart === exStart) score += 1;
  if (inEnd && exEnd && inEnd === exEnd) score += 1;

  return score;
}

function scoreEducationMatch(
  incoming: { program: string; institution: string; start?: string | null; end?: string | null; details?: string | null },
  existing: { program: string; institution: string; start: string | null; end: string | null; details: string | null }
) {
  let score = 0;
  const inProgram = normalizeLooseText(incoming.program);
  const exProgram = normalizeLooseText(existing.program);
  if (inProgram && exProgram && inProgram === exProgram) score += 4;

  const inInst = normalizeLooseText(incoming.institution);
  const exInst = normalizeLooseText(existing.institution);
  if (inInst && exInst && inInst === exInst) score += 2;
  if (existing.institution === "Institution") score += 1;

  const inDetails = normalizeLooseText(incoming.details ?? "");
  const exDetails = normalizeLooseText(existing.details ?? "");
  if (inDetails && exDetails) {
    const a = inDetails.slice(0, 80);
    const b = exDetails.slice(0, 80);
    if (a && b && (a.includes(b) || b.includes(a))) score += 2;
  }

  const inStart = normalizeLooseText(incoming.start ?? "");
  const exStart = normalizeLooseText(existing.start ?? "");
  const inEnd = normalizeLooseText(incoming.end ?? "");
  const exEnd = normalizeLooseText(existing.end ?? "");
  if (inStart && exStart && inStart === exStart) score += 1;
  if (inEnd && exEnd && inEnd === exEnd) score += 1;

  return score;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    await ensureCompanyMembership(admin, user.id);

    const payload = (await request.json().catch(() => null)) as
      | { candidateId?: unknown }
      | null;
    const internalCandidateId = asString(payload?.candidateId).trim();
    if (!internalCandidateId) {
      return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
    }

    const { data: candidateRow, error } = await admin
      .from("candidates")
      .select("id,data,updated_at")
      .eq("id", internalCandidateId)
      .maybeSingle();
    if (error || !candidateRow) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const data = (candidateRow as { data?: unknown }).data;
    const breezy = isRecord(data) && isRecord((data as Record<string, unknown>).breezy)
      ? ((data as Record<string, unknown>).breezy as Record<string, unknown>)
      : null;
    const companyId =
      breezy && typeof breezy.company_id === "string" ? breezy.company_id.trim() : "";
    const positionId =
      breezy && typeof breezy.position_id === "string" ? breezy.position_id.trim() : "";
    const breezyCandidateId =
      breezy && typeof breezy.candidate_id === "string" ? breezy.candidate_id.trim() : "";
    if (!companyId || !positionId || !breezyCandidateId) {
      return NextResponse.json(
        { error: "Candidate is missing Breezy IDs" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const warnings: string[] = [];

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

    const detailsPayload = detailsRes.body;
    const details = unwrapDataRecord(detailsPayload);
    const buildId = (key: string) =>
      stableUuidFromString(`${companyId}:${positionId}:${breezyCandidateId}:${key}`);

    const detailsRecord = isRecord(details) ? (details as Record<string, unknown>) : null;
    const profile = detailsRecord && isRecord(detailsRecord.profile)
      ? (detailsRecord.profile as Record<string, unknown>)
      : null;
    const tags = normalizeBreezyTags(detailsRecord?.tags);
    let summary = extractBreezySummary(details);
    let workHistory = extractBreezyWorkHistory(details, buildId);
    let education = extractBreezyEducation(details, buildId);
    let resumeSnapshot: unknown = null;

    // Fallback: if Breezy candidate details omit parsed resume fields, try the resume endpoint (JSON only).
    if (workHistory.length === 0 && education.length === 0 && !summary.trim()) {
      const resumeUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
        companyId
      )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(
        breezyCandidateId
      )}/resume`;
      const resumeRes = await fetchJson(resumeUrl);
      const resumePayload = resumeRes.res.ok ? unwrapDataRecord(resumeRes.body) : null;
      if (resumeRes.res.ok && isRecord(resumePayload)) {
        resumeSnapshot = resumePayload;
        const wrapper = { resume: resumePayload, parsed_resume: resumePayload };
        summary = extractBreezySummary(wrapper) || summary;
        workHistory = extractBreezyWorkHistory(wrapper, buildId);
        education = extractBreezyEducation(wrapper, buildId);
      }
    }
    const customAttributes =
      detailsRecord?.custom_attributes ??
      detailsRecord?.customAttributes ??
      profile?.custom_attributes ??
      profile?.customAttributes ??
      null;

    const [{ data: existingWork }, { data: existingEdu }] = await Promise.all([
      admin
        .from("candidate_work_history")
        .select("id,role,company,start,end,details")
        .eq("candidate_id", internalCandidateId),
      admin
        .from("candidate_education")
        .select("id,program,institution,start,end,details")
        .eq("candidate_id", internalCandidateId),
    ]);

    const workExistingRows = Array.isArray(existingWork)
      ? (existingWork as Array<{
          id: string;
          role: string;
          company: string;
          start: string | null;
          end: string | null;
          details: string | null;
        }>)
      : [];
    const eduExistingRows = Array.isArray(existingEdu)
      ? (existingEdu as Array<{
          id: string;
          program: string;
          institution: string;
          start: string | null;
          end: string | null;
          details: string | null;
        }>)
      : [];

    const usedWorkIds = new Set<string>();
    const usedEduIds = new Set<string>();

    const workRows = workHistory.map((item) => {
      let id = item.id;
      // Try to reuse existing row IDs to avoid duplicates if our extractor improved.
      const exact = workExistingRows.find((row) => row.id === id);
      if (exact) {
        usedWorkIds.add(exact.id);
      } else {
        let best: { id: string; score: number } | null = null;
        for (const row of workExistingRows) {
          if (usedWorkIds.has(row.id)) continue;
          const score = scoreWorkMatch(item, row);
          if (!best || score > best.score) best = { id: row.id, score };
        }
        if (best && best.score >= 5) {
          id = best.id;
          usedWorkIds.add(best.id);
        }
      }
      return {
        id,
        candidate_id: internalCandidateId,
        role: item.role,
        company: item.company,
        start: item.start ?? null,
        end: item.end ?? null,
        details: item.details ?? null,
        created_at: now,
      };
    });

    const eduRows = education.map((item) => {
      let id = item.id;
      const exact = eduExistingRows.find((row) => row.id === id);
      if (exact) {
        usedEduIds.add(exact.id);
      } else {
        let best: { id: string; score: number } | null = null;
        for (const row of eduExistingRows) {
          if (usedEduIds.has(row.id)) continue;
          const score = scoreEducationMatch(item, row);
          if (!best || score > best.score) best = { id: row.id, score };
        }
        if (best && best.score >= 5) {
          id = best.id;
          usedEduIds.add(best.id);
        }
      }
      return {
        id,
        candidate_id: internalCandidateId,
        program: item.program,
        institution: item.institution,
        start: item.start ?? null,
        end: item.end ?? null,
        details: item.details ?? null,
        created_at: now,
      };
    });

    if (workRows.length > 0) {
      const { error: workError } = await admin
        .from("candidate_work_history")
        .upsert(workRows, { onConflict: "id", defaultToNull: false });
      if (workError) warnings.push(`Work history sync failed: ${workError.message}`);
    }
    if (eduRows.length > 0) {
      const { error: eduError } = await admin
        .from("candidate_education")
        .upsert(eduRows, { onConflict: "id", defaultToNull: false });
      if (eduError) warnings.push(`Education sync failed: ${eduError.message}`);
    }

    // Clean up obvious placeholder rows from earlier imperfect extractions.
    const keepWorkIds = workRows.map((row) => row.id);
    const keepEduIds = eduRows.map((row) => row.id);
    try {
      if (keepWorkIds.length > 0) {
        const keep = `(${keepWorkIds.map((id) => `"${id}"`).join(",")})`;
        await admin
          .from("candidate_work_history")
          .delete()
          .eq("candidate_id", internalCandidateId)
          .eq("company", "Company")
          .not("id", "in", keep);
      }
      if (keepEduIds.length > 0) {
        const keep = `(${keepEduIds.map((id) => `"${id}"`).join(",")})`;
        await admin
          .from("candidate_education")
          .delete()
          .eq("candidate_id", internalCandidateId)
          .eq("institution", "Institution")
          .not("id", "in", keep);
      }
    } catch {
      warnings.push("Placeholder cleanup failed (non-fatal).");
    }

    let metaPayload: unknown = null;
    let streamPayload: unknown = null;

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
      fetchJson(metaUrl).catch((err) => ({ res: null, body: err })),
      fetchJson(streamUrl).catch((err) => ({ res: null, body: err })),
    ]);

    if (metaRes.res && metaRes.res.ok) {
      metaPayload = metaRes.body;
    } else if (metaRes.res) {
      warnings.push(`Breezy meta request failed (${metaRes.res.status}).`);
    }

    if (streamRes.res && streamRes.res.ok) {
      streamPayload = streamRes.body;
    } else if (streamRes.res) {
      warnings.push(`Breezy stream request failed (${streamRes.res.status}).`);
    }

    const streamItems = streamPayload ? extractBreezyStreamItems(streamPayload, buildId) : [];
    const metaNotes = metaPayload ? extractMetaNotes(metaPayload, buildId) : [];

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

    for (const item of metaNotes) {
      if (!item.body.trim()) continue;
      noteActivityRowMap.set(item.id, {
        id: item.id,
        candidate_id: internalCandidateId,
        type: "note",
        body: item.body,
        created_at: item.created_at,
        author_name: item.author_name ?? null,
        author_email: item.author_email ?? null,
        author_id: null,
      });
    }

    for (const item of streamItems) {
      if (item.kind !== "note") continue;
      if (!item.body.trim()) continue;
      noteActivityRowMap.set(item.id, {
        id: item.id,
        candidate_id: internalCandidateId,
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
        candidate_id: internalCandidateId,
        type: item.type,
        body: item.body,
        created_at: item.created_at,
        author_name: item.author_name ?? null,
        author_email: item.author_email ?? null,
        author_id: null,
      }));

    const nextActivityRows = [...activityRows, ...noteActivityRows];
    if (nextActivityRows.length > 0) {
      const { error: activityError } = await admin
        .from("candidate_activity")
        .upsert(nextActivityRows, { onConflict: "id", defaultToNull: false });
      if (activityError) warnings.push(`Activity sync failed: ${activityError.message}`);
    }

    const existingData = (isRecord(data) ? (data as Record<string, unknown>) : {}) as Record<
      string,
      unknown
    >;
    const existingBreezy = isRecord(existingData.breezy)
      ? (existingData.breezy as Record<string, unknown>)
      : {};

    const nextTags = mergeTags(existingData.tags, tags);
    const nextCity = pickFirstString(existingData.city, profile?.city, detailsRecord?.city);
    const nextCountry = pickFirstString(
      existingData.country,
      profile?.country,
      detailsRecord?.country,
      profile?.location,
      detailsRecord?.location
    );
    const nextNationality = pickFirstString(
      existingData.nationality,
      profile?.nationality,
      detailsRecord?.nationality
    );
    const nextAvailability = pickFirstString(
      existingData.availability,
      profile?.availability,
      detailsRecord?.availability
    );
    const nextSalary = pickFirstString(
      existingData.salary_expectation,
      profile?.salary_expectation,
      detailsRecord?.salary_expectation,
      detailsRecord?.salaryExpectation,
      profile?.salaryExpectation
    );
    const nextData: Record<string, unknown> = {
      ...existingData,
      ...(nextTags.length > 0 ? { tags: nextTags } : {}),
      ...(summary.trim() ? { experience_summary: summary.trim() } : {}),
      ...(nextCity ? { city: nextCity } : {}),
      ...(nextCountry ? { country: nextCountry } : {}),
      ...(nextNationality ? { nationality: nextNationality } : {}),
      ...(nextAvailability ? { availability: nextAvailability } : {}),
      ...(nextSalary ? { salary_expectation: nextSalary } : {}),
      breezy: {
        ...existingBreezy,
        raw: isRecord(details) ? details : { data: detailsPayload },
        meta: metaPayload,
        custom_attributes: customAttributes,
        ...(resumeSnapshot ? { resume: resumeSnapshot } : {}),
        last_synced_at: now,
      },
    };

    const { error: updateError } = await admin
      .from("candidates")
      .update({ data: nextData, updated_at: now })
      .eq("id", internalCandidateId);
    if (updateError) warnings.push(`Candidate update failed: ${updateError.message}`);

    return NextResponse.json(
      {
        ok: true,
        synced: {
          tags: tags.length,
          workHistory: workRows.length,
          education: eduRows.length,
          notes: noteActivityRows.length,
          activity: nextActivityRows.length,
        },
        warnings,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
