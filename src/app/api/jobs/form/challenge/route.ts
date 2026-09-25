import { NextResponse } from "next/server";
import { createApplicationChallenge } from "@/lib/application-challenge";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json(createApplicationChallenge(), { headers: { "Cache-Control": "no-store" } });
}
