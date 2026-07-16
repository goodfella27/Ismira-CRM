import { NextResponse } from "next/server";
import { breezyFetch, requireBreezyCompanyId } from "@/lib/breezy";

async function fetchJson(url: string) {
  const res = await breezyFetch(url);
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  return { res, body };
}

function configuredCompanyPayload() {
  try {
    const { companyId } = requireBreezyCompanyId();
    return {
      companies: [
        {
          id: companyId,
          _id: companyId,
          name: "Configured Breezy company",
        },
      ],
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const configuredCompany = configuredCompanyPayload();
    if (configuredCompany) return NextResponse.json(configuredCompany, { status: 200 });

    const primary = await fetchJson("https://api.breezy.hr/v3/companies");
    if (primary.res.ok) {
      return NextResponse.json(primary.body, { status: primary.res.status });
    }

    if (primary.res.status === 403) {
      const fallbackCompany = configuredCompanyPayload();
      if (fallbackCompany) {
        return NextResponse.json(
          {
            ...fallbackCompany,
            warning:
              "Breezy denied company listing, so the configured company id was used.",
          },
          { status: 200 }
        );
      }
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
