import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/auth/access";

export const runtime = "nodejs";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await getCurrentUserAccess();
  if (!access) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const requested = safeNext(url.searchParams.get("next"));
  if (access.canAccessHrPortal) {
    return NextResponse.redirect(new URL(requested || "/pipeline", url.origin));
  }

  const portalDestination = requested.startsWith("/jobs") ? requested : "/jobs";
  return NextResponse.redirect(new URL(portalDestination, url.origin));
}
