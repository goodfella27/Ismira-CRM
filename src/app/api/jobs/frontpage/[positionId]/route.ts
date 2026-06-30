import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { GET as getJob } from "@/app/api/jobs/[positionId]/route";
import { buildPublicFrontpageJobDetails } from "@/lib/public-frontpage-jobs";

export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=30, s-maxage=60, stale-while-revalidate=120";

function applyPublicHeaders(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, ngrok-skip-browser-warning");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("X-Content-Type-Options", "nosniff");
}

function isValidJsonpCallback(value: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  applyPublicHeaders(response.headers);
  return response;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ positionId: string }> }
) {
  try {
    const { positionId } = await params;
    const requestUrl = new URL(request.url);
    const sourceUrl = new URL(requestUrl);
    sourceUrl.searchParams.delete("callback");

    const sourceResponse = await getJob(
      new Request(sourceUrl.toString(), { method: "GET", headers: request.headers }),
      { params: Promise.resolve({ positionId }) }
    );

    if (!sourceResponse.ok) {
      const response = NextResponse.json({ error: "Job not found." }, { status: sourceResponse.status });
      applyPublicHeaders(response.headers);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const source = await sourceResponse.json().catch(() => null);
    const payload = buildPublicFrontpageJobDetails(source, positionId);
    if (!payload) {
      const response = NextResponse.json({ error: "Job not found." }, { status: 404 });
      applyPublicHeaders(response.headers);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const json = JSON.stringify(payload);
    const callback = (requestUrl.searchParams.get("callback") ?? "").trim();
    const jsonpCallback = isValidJsonpCallback(callback) ? callback : "";
    const body = jsonpCallback ? `${jsonpCallback}(${json});` : json;
    const contentType = jsonpCallback
      ? "application/javascript; charset=utf-8"
      : "application/json; charset=utf-8";
    const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;

    const response = new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": contentType, ETag: etag },
    });
    applyPublicHeaders(response.headers);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load job details.";
    const response = NextResponse.json({ error: message }, { status: 500 });
    applyPublicHeaders(response.headers);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
