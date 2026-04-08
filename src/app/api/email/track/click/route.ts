import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decodeTrackedUrl } from "@/lib/email/tracking";

export const runtime = "nodejs";

const getClientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  request.headers.get("x-real-ip") ??
  "";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const messageId = url.searchParams.get("mid") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const encoded = url.searchParams.get("u") ?? "";

  let target = "";
  try {
    target = encoded ? decodeTrackedUrl(encoded) : "";
  } catch {
    target = "";
  }

  if (!target || !/^https?:\/\//i.test(target)) {
    return NextResponse.redirect(new URL("/", url.origin).toString());
  }

  let allowRedirect = false;
  try {
    if (messageId && token) {
      const admin = createSupabaseAdminClient();
      const { data: message } = await admin
        .from("email_messages")
        .select("id,tracking_token")
        .eq("id", messageId)
        .maybeSingle();
      if (message?.id && message.tracking_token && message.tracking_token === token) {
        allowRedirect = true;
        const ip = getClientIp(request);
        const ua = request.headers.get("user-agent") ?? "";
        await admin.from("email_events").insert({
          message_id: messageId,
          type: "click",
          url: target,
          ip: ip || null,
          user_agent: ua || null,
        });
        try {
          await admin.rpc("increment_email_clicks", { message_id: messageId });
        } catch {
          // best-effort counter update
        }
      }
    }
  } catch {
    // Ignore tracking failures; the redirect should still work.
  }

  return NextResponse.redirect(
    allowRedirect ? target : new URL("/", url.origin).toString()
  );
}
