import { NextRequest, NextResponse } from "next/server";
import { mailerliteFetch } from "@/lib/mailerlite";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") ?? "100";
    const page = searchParams.get("page") ?? "1";
    const filterName = searchParams.get("filter[name]");
    const sort = searchParams.get("sort");

    const url = new URL("https://connect.mailerlite.com/api/groups");
    url.searchParams.set("limit", limit);
    url.searchParams.set("page", page);
    if (filterName) url.searchParams.set("filter[name]", filterName);
    if (sort) url.searchParams.set("sort", sort);

    const res = await mailerliteFetch(url.toString());
    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json() : await res.text();

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
