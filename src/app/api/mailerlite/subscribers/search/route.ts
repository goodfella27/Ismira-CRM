import { NextRequest, NextResponse } from "next/server";
import { mailerliteFetch } from "@/lib/mailerlite";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const parseResponse = async (res: Response) => {
      const contentType = res.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const body = isJson ? await res.json().catch(() => null) : await res.text();
      return { body, isJson };
    };

    const normalizeData = (body: unknown) => {
      if (body && typeof body === "object" && "data" in (body as object)) {
        const data = (body as { data?: unknown }).data;
        if (Array.isArray(data)) return data;
        if (data) return [data];
      }
      return [];
    };

    const directRes = await mailerliteFetch(
      `https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(
        email
      )}`
    );
    const direct = await parseResponse(directRes);

    if (directRes.ok) {
      return NextResponse.json({ data: normalizeData(direct.body) });
    }

    if (directRes.status !== 400 && directRes.status !== 404) {
      return NextResponse.json(
        {
          error: "MailerLite search failed",
          status: directRes.status,
          details: direct.body,
        },
        { status: directRes.status }
      );
    }

    const queryUrls = [
      (() => {
        const url = new URL("https://connect.mailerlite.com/api/subscribers");
        url.searchParams.set("filter[email]", email);
        return url.toString();
      })(),
      (() => {
        const url = new URL("https://connect.mailerlite.com/api/subscribers");
        url.searchParams.set("filter[search]", email);
        return url.toString();
      })(),
    ];

    for (const url of queryUrls) {
      const res = await mailerliteFetch(url);
      const parsed = await parseResponse(res);

      if (res.ok) {
        return NextResponse.json({ data: normalizeData(parsed.body) });
      }

      if (res.status === 404) {
        continue;
      }
    }

    if (directRes.status === 404) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    return NextResponse.json(
      {
        error: "MailerLite search failed",
        status: directRes.status,
        details: direct.body,
      },
      { status: directRes.status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
