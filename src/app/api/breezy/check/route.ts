import { NextResponse } from "next/server";
import { findCandidatesByEmail, getBreezyEnv } from "@/lib/breezy";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const companyId = getBreezyEnv().companyId;
    if (!email || !companyId) return NextResponse.json({ error: "Missing email or companyId" }, { status: 400 });
    const result = await findCandidatesByEmail(email, companyId);
    return NextResponse.json({ exists: result.candidates.length > 0, candidateId: result.candidateId, count: result.candidates.length, status: "ok", source: "supabase" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: /not authenticated/i.test(message) ? 401 : 500 });
  }
}
