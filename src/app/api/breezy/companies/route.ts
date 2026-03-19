import { NextResponse } from "next/server";
import { breezyFetch } from "@/lib/breezy";

async function fetchJson(url: string) {
  const res = await breezyFetch(url);
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  return { res, body };
}

export async function GET() {
  try {
    const primary = await fetchJson("https://api.breezy.hr/v3/companies");
    if (primary.res.ok) {
      return NextResponse.json(primary.body, { status: primary.res.status });
    }

    // Fallback: some accounts return companies under /company
    if ([400, 404, 405].includes(primary.res.status)) {
      const fallback = await fetchJson("https://api.breezy.hr/v3/company");
      if (fallback.res.ok) {
        return NextResponse.json(fallback.body, { status: fallback.res.status });
      }

      return NextResponse.json(
        {
          error: "Breezy request failed",
          status: fallback.res.status,
          details: fallback.body,
        },
        { status: fallback.res.status }
      );
    }

    return NextResponse.json(
      {
        error: "Breezy request failed",
        status: primary.res.status,
        details: primary.body,
      },
      { status: primary.res.status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
