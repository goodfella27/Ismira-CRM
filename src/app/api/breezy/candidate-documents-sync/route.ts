import { NextResponse } from "next/server";
import crypto from "crypto";

import { breezyFetch } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  extractBreezyDocumentCreatedAt,
  extractBreezyDocumentCreatedBy,
  extractBreezyDocumentId,
  extractBreezyDocumentMime,
  extractBreezyDocumentName,
  normalizeBreezyDocuments,
} from "@/lib/breezy-documents";

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
  const body = isJson ? await res.json() : await res.text();
  return { res, body };
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
      .select("id,data")
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

    const now = new Date().toISOString();
    const docs = normalizeBreezyDocuments(docsRes.body);
    const rows = docs
      .map((doc) => {
        const docId = extractBreezyDocumentId(doc);
        if (!docId) return null;
        const id = stableUuidFromString(`breezy_doc_${breezyCandidateId}_${docId}`);
        const name = extractBreezyDocumentName(doc);
        const mime = extractBreezyDocumentMime(doc);
        const createdAt = extractBreezyDocumentCreatedAt(doc);
        const createdBy = extractBreezyDocumentCreatedBy(doc);
        const proxyUrl = `/api/breezy/candidate-document?candidateId=${encodeURIComponent(
          internalCandidateId
        )}&docId=${encodeURIComponent(docId)}`;
        return {
          id,
          candidate_id: internalCandidateId,
          name: name || null,
          mime: mime || null,
          url: proxyUrl,
          path: null,
          kind: "document",
          created_at: createdAt || now,
          created_by: createdBy || null,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      candidate_id: string;
      name: string | null;
      mime: string | null;
      url: string;
      path: null;
      kind: string;
      created_at: string;
      created_by: string | null;
    }>;

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: true, synced: 0, note: "No documents found for candidate." },
        { status: 200 }
      );
    }

    const { error: upsertError } = await admin
      .from("candidate_attachments")
      .upsert(rows, { onConflict: "id", defaultToNull: false });
    if (upsertError) {
      return NextResponse.json(
        { error: upsertError.message ?? "Failed to upsert attachments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, synced: rows.length }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

