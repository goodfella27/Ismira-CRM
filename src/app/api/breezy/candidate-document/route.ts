import { NextResponse } from "next/server";

import { breezyFetch } from "@/lib/breezy";
import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ensureAbsoluteUrl,
  extractBreezyDocumentDownloadUrl,
  extractBreezyDocumentId,
  extractBreezyDocumentMime,
  extractBreezyDocumentName,
  normalizeBreezyDocuments,
  safeFileName,
  toBreezyFetchTarget,
} from "@/lib/breezy-documents";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function guessMimeFromFilename(filename: string, fallback: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return fallback;
}

function isAllowedDownloadHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (!host) return false;
  if (host === "api.breezy.hr") return true;
  if (host === "breezy.hr") return true;
  if (host.endsWith(".breezy.hr")) return true;
  if (host.endsWith(".amazonaws.com")) return true;
  if (host.endsWith(".cloudfront.net")) return true;
  return false;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const admin = createSupabaseAdminClient();
    await ensureCompanyMembership(admin, user.id);

    const { searchParams } = new URL(request.url);
    const internalCandidateId = (searchParams.get("candidateId") ?? "").trim();
    const documentId = (searchParams.get("docId") ?? "").trim();
    if (!internalCandidateId || !documentId) {
      return NextResponse.json(
        { error: "Missing candidateId or docId" },
        { status: 400 }
      );
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
    const candidateId =
      breezy && typeof breezy.candidate_id === "string" ? breezy.candidate_id.trim() : "";
    if (!companyId || !positionId || !candidateId) {
      return NextResponse.json(
        { error: "Candidate is missing Breezy IDs" },
        { status: 400 }
      );
    }

    const docsUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
      companyId
    )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(
      candidateId
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

    const docs = normalizeBreezyDocuments(docsRes.body);
    const match =
      docs.find((doc) => extractBreezyDocumentId(doc) === documentId) ?? null;
    if (!match) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const downloadUrl = ensureAbsoluteUrl(extractBreezyDocumentDownloadUrl(match));
    const tryDownload = async (target: string) => {
      const headers = {
        Accept: "*/*",
        "Content-Type": "",
      } as const;

      if (/^https?:\/\//i.test(target)) {
        try {
          const url = new URL(target);
          if (!isAllowedDownloadHost(url.hostname)) {
            return new Response("Disallowed download host", { status: 400 });
          }
          if (url.hostname !== "api.breezy.hr") {
            return fetch(target, { method: "GET", headers: { Accept: "*/*" } });
          }
        } catch {
          // fall back to Breezy fetch below
        }
      }

      return breezyFetch(target, {
        method: "GET",
        headers,
      });
    };

    const candidateDocumentFallbackTargets = [
      `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(
        positionId
      )}/candidate/${encodeURIComponent(candidateId)}/document/${encodeURIComponent(
        documentId
      )}`,
      `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(
        positionId
      )}/candidate/${encodeURIComponent(candidateId)}/documents/${encodeURIComponent(
        documentId
      )}`,
      `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(
        positionId
      )}/candidate/${encodeURIComponent(
        candidateId
      )}/documents/${encodeURIComponent(documentId)}/download`,
      `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(
        positionId
      )}/candidate/${encodeURIComponent(
        candidateId
      )}/document/${encodeURIComponent(documentId)}/download`,
    ];

    let downloadRes: Response | null = null;
    const attempts: Array<{ target: string; status: number }> = [];
    if (downloadUrl) {
      const target = toBreezyFetchTarget(downloadUrl);
      const res = await tryDownload(target);
      attempts.push({ target, status: res.status });
      downloadRes = res;
    } else {
      for (const target of candidateDocumentFallbackTargets) {
        const res = await tryDownload(target);
        attempts.push({ target, status: res.status });
        if (res.ok) {
          downloadRes = res;
          break;
        }
      }
    }

    if (!downloadRes) {
      return NextResponse.json(
        {
          error: "Document has no download URL",
          debug: {
            documentId,
            availableKeys: Object.keys(match).sort(),
            attempts,
          },
        },
        { status: 404 }
      );
    }

    if (!downloadRes.ok) {
      const details = await downloadRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Failed to download document",
          status: downloadRes.status,
          details,
          debug: { attempts, documentId },
        },
        { status: downloadRes.status }
      );
    }

    const filename = safeFileName(
      extractBreezyDocumentName(match) || `document-${documentId}`
    );
    const rawMime =
      downloadRes.headers.get("content-type") ||
      extractBreezyDocumentMime(match) ||
      "application/octet-stream";
    const mime = guessMimeFromFilename(filename, rawMime);

    return new Response(downloadRes.body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not authenticated/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
