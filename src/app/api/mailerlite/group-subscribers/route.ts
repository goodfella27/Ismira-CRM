import { NextRequest, NextResponse } from "next/server";
import { mailerliteFetch } from "@/lib/mailerlite";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    const limit = searchParams.get("limit") ?? "25";
    const cursor = searchParams.get("cursor");
    const sort = searchParams.get("sort") ?? "-subscribed_at";

    if (!groupId) {
      return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
    }

    const buildUrl = (useSort: boolean) => {
      const url = new URL(
        `https://connect.mailerlite.com/api/groups/${groupId}/subscribers`
      );
      url.searchParams.set("limit", limit);
      if (cursor) url.searchParams.set("cursor", cursor);
      if (useSort && sort) url.searchParams.set("sort", sort);
      return url;
    };

    const attempt = async (useSort: boolean) => {
      const res = await mailerliteFetch(buildUrl(useSort).toString());
      const contentType = res.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const body = isJson ? await res.json() : await res.text();
      return { res, body };
    };

    let { res, body } = await attempt(true);

    if (!res.ok && sort) {
      const status = res.status;
      if (status === 400 || status === 422) {
        ({ res, body } = await attempt(false));
      }
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "MailerLite request failed",
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
