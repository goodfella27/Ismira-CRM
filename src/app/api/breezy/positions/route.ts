import { NextResponse } from "next/server";
import { breezyFetch, requireBreezyIds } from "@/lib/breezy";

export async function GET() {
  try {
    const { companyId } = requireBreezyIds();
    const url = `https://api.breezy.hr/v3/company/${companyId}/positions`;

    const res = await breezyFetch(url);
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "Breezy request failed",
          status: res.status,
          details: body,
        },
        { status: res.status }
      );
    }

    return NextResponse.json(body, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
