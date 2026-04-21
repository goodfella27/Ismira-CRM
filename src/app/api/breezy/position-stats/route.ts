import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message ?? "Not authenticated.");
  const user = data.user ?? null;
  if (!user) throw new Error("Not authenticated.");
  return user;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    await ensureCompanyMembership(admin, user.id);

    const { searchParams } = new URL(request.url);
    const breezyCompanyId = (searchParams.get("companyId") ?? "").trim();

    const { data: candidates, error: candidateError } = await admin
      .from("candidates")
      .select("id,data")
      .like("id", "breezy_%")
      .limit(5000);
    if (candidateError) {
      return NextResponse.json(
        { error: candidateError.message ?? "Failed to load candidates" },
        { status: 500 }
      );
    }

    type CandidateRow = { id: string; data: unknown };
    const rows = Array.isArray(candidates) ? (candidates as CandidateRow[]) : [];

    const positionIdByCandidateId = new Map<string, string>();
    const candidateIds: string[] = [];

    for (const row of rows) {
      const data = row.data;
      if (!isRecord(data)) continue;
      const breezy = isRecord(data.breezy) ? (data.breezy as Record<string, unknown>) : null;
      const posId = breezy ? asString(breezy.position_id).trim() : "";
      const compId = breezy ? asString(breezy.company_id).trim() : "";
      if (!posId) continue;
      if (breezyCompanyId && compId && compId !== breezyCompanyId) continue;
      positionIdByCandidateId.set(row.id, posId);
      candidateIds.push(row.id);
    }

    const attachmentCountsByCandidateId: Record<string, number> = {};
    const noteCountsByCandidateId: Record<string, number> = {};

    const idChunks = chunk(candidateIds, 750);
    for (const ids of idChunks) {
      const [{ data: attachments, error: attachmentError }, { data: notes, error: noteError }] =
        await Promise.all([
          admin.from("candidate_attachments").select("candidate_id").in("candidate_id", ids),
          admin.from("candidate_notes").select("candidate_id").in("candidate_id", ids),
        ]);

      if (attachmentError) {
        return NextResponse.json(
          { error: attachmentError.message ?? "Failed to load attachments" },
          { status: 500 }
        );
      }
      if (noteError) {
        return NextResponse.json(
          { error: noteError.message ?? "Failed to load notes" },
          { status: 500 }
        );
      }

      for (const row of attachments ?? []) {
        const id = asString((row as { candidate_id?: unknown }).candidate_id).trim();
        if (!id) continue;
        attachmentCountsByCandidateId[id] = (attachmentCountsByCandidateId[id] ?? 0) + 1;
      }

      for (const row of notes ?? []) {
        const id = asString((row as { candidate_id?: unknown }).candidate_id).trim();
        if (!id) continue;
        noteCountsByCandidateId[id] = (noteCountsByCandidateId[id] ?? 0) + 1;
      }
    }

    const stats: Record<
      string,
      {
        imported: number;
        documentsTotal: number;
        withDocuments: number;
        with2PlusDocuments: number;
        notesTotal: number;
        withNotes: number;
      }
    > = {};

    for (const candidateId of candidateIds) {
      const posId = positionIdByCandidateId.get(candidateId);
      if (!posId) continue;
      const entry =
        stats[posId] ??
        (stats[posId] = {
          imported: 0,
          documentsTotal: 0,
          withDocuments: 0,
          with2PlusDocuments: 0,
          notesTotal: 0,
          withNotes: 0,
        });
      entry.imported += 1;

      const docCount = attachmentCountsByCandidateId[candidateId] ?? 0;
      entry.documentsTotal += docCount;
      if (docCount > 0) entry.withDocuments += 1;
      if (docCount > 1) entry.with2PlusDocuments += 1;

      const noteCount = noteCountsByCandidateId[candidateId] ?? 0;
      entry.notesTotal += noteCount;
      if (noteCount > 0) entry.withNotes += 1;
    }

    return NextResponse.json(
      {
        stats,
        meta: {
          candidatesScanned: rows.length,
          breezyCandidates: candidateIds.length,
          filteredByCompanyId: breezyCompanyId || null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

