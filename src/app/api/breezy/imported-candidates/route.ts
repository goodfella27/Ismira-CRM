import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
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
    const companyId = (searchParams.get("companyId") ?? "").trim();
    const positionId = (searchParams.get("positionId") ?? "").trim();
    const limit = clampInt(searchParams.get("limit"), 1, 100, 25);

    if (!companyId || !positionId) {
      return NextResponse.json(
        { error: "Missing companyId or positionId" },
        { status: 400 }
      );
    }

    // Pull Breezy-imported candidates for this company + position.
    // We rely on the stored JSON in candidates.data.breezy.
    const { data: candidates, error: candidateError } = await admin
      .from("candidates")
      .select("id,pipeline_id,stage_id,created_at,updated_at,data")
      .like("id", "breezy_%")
      .contains("data", { breezy: { company_id: companyId, position_id: positionId } })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (candidateError) {
      return NextResponse.json(
        { error: candidateError.message ?? "Failed to load candidates" },
        { status: 500 }
      );
    }

    type CandidateRow = {
      id: string;
      pipeline_id: string | null;
      stage_id: string | null;
      created_at: string | null;
      updated_at: string | null;
      data: Record<string, unknown> | null;
    };

    const rows = Array.isArray(candidates) ? (candidates as CandidateRow[]) : [];
    const ids = rows.map((row) => row.id).filter(Boolean);

    const attachmentCountsByCandidateId: Record<string, number> = {};
    const noteCountsByCandidateId: Record<string, number> = {};

    for (const group of chunk(ids, 750)) {
      const [{ data: attachments, error: attachmentError }, { data: notes, error: noteError }] =
        await Promise.all([
          admin
            .from("candidate_attachments")
            .select("candidate_id")
            .in("candidate_id", group),
          admin.from("candidate_notes").select("candidate_id").in("candidate_id", group),
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

    const mapped = rows.map((row) => {
      const data = row.data ?? {};
      return {
        id: row.id,
        pipeline_id: row.pipeline_id,
        stage_id: row.stage_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        name: asString((data as Record<string, unknown>).name).trim() || row.id,
        email: asString((data as Record<string, unknown>).email).trim(),
        attachmentCount: attachmentCountsByCandidateId[row.id] ?? 0,
        noteCount: noteCountsByCandidateId[row.id] ?? 0,
      };
    });

    return NextResponse.json(
      {
        meta: {
          companyId,
          positionId,
          returned: mapped.length,
          withDocuments: mapped.filter((c) => c.attachmentCount > 0).length,
          with2PlusDocuments: mapped.filter((c) => c.attachmentCount > 1).length,
          withNotes: mapped.filter((c) => c.noteCount > 0).length,
        },
        candidates: mapped,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

