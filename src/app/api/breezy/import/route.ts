import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  type BreezyCsvRow,
  mapBreezyRowToCandidate,
  mapBreezyRowToSupabase,
  parseBreezyCsv,
} from "@/lib/breezy-csv";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CSV_PATH = path.join(process.cwd(), "breezy-candidates.csv");
const DEFAULT_POOL_ID = "roomy";
const DEFAULT_PIPELINE_ID = "breezy";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const poolId =
      typeof body?.poolId === "string" && body.poolId
        ? body.poolId
        : DEFAULT_POOL_ID;
    const pipelineId =
      typeof body?.pipelineId === "string" && body.pipelineId
        ? body.pipelineId
        : DEFAULT_PIPELINE_ID;

    const csv = await fs.readFile(CSV_PATH, "utf8");
    const rows = parseBreezyCsv(csv);
    if (rows.length === 0) {
      return NextResponse.json({ candidates: [], inserted: 0, skipped: 0 });
    }

    const now = new Date().toISOString();
    const seenEmails = new Set<string>();
    const deduped: BreezyCsvRow[] = [];
    let skipped = 0;

    for (const row of rows) {
      const email = row.email?.trim();
      if (!email) {
        skipped += 1;
        continue;
      }
      const key = email.toLowerCase();
      if (seenEmails.has(key)) {
        skipped += 1;
        continue;
      }
      seenEmails.add(key);
      deduped.push(row);
    }

    const candidates = deduped.map((row) =>
      mapBreezyRowToCandidate(row, { poolId, now, pipelineId })
    );
    const supabaseRows = deduped.map((row) => mapBreezyRowToSupabase(row));

    const table = process.env.BREEZY_SUPABASE_TABLE ?? "breezy_candidates";
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from(table).insert(supabaseRows);
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      candidates,
      inserted: supabaseRows.length,
      skipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
