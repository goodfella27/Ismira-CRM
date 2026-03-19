import { NextRequest, NextResponse } from "next/server";
import {
  findCandidatesByEmail,
  getBreezyEnv,
} from "@/lib/breezy";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const { companyId, email: breezyEmail, password, apiToken } = getBreezyEnv();

    if (!companyId) {
      return NextResponse.json({
        exists: false,
        status: "not_configured",
        message: "Missing BREEZY_COMPANY_ID",
      });
    }

    if (!apiToken && !(breezyEmail && password)) {
      return NextResponse.json({
        exists: false,
        status: "not_configured",
        message: "Missing Breezy credentials",
      });
    }

    const result = await findCandidatesByEmail(email, companyId);
    if (result.error) {
      return NextResponse.json({
        exists: false,
        status: "error",
        message: "Breezy search failed",
        details: result.error,
      });
    }

    return NextResponse.json({
      exists: result.candidates.length > 0,
      candidateId: result.candidateId ?? null,
      count: result.candidates.length,
      status: "ok",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      exists: false,
      status: "error",
      message,
    });
  }
}
