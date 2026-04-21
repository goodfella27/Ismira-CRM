import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

const getClientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  request.headers.get("x-real-ip") ??
  "";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const messageId = url.searchParams.get("mid") ?? "";
  const token = url.searchParams.get("t") ?? "";

  try {
    if (messageId && token) {
      const admin = createSupabaseAdminClient();
      const { data: message } = await admin
        .from("email_messages")
        .select("id,tracking_token")
        .eq("id", messageId)
        .maybeSingle();

      if (message?.id && message.tracking_token && message.tracking_token === token) {
        const ip = getClientIp(request);
        const ua = request.headers.get("user-agent") ?? "";
        await admin.from("email_events").insert({
          message_id: messageId,
          type: "open",
          ip: ip || null,
          user_agent: ua || null,
        });
        try {
          await admin.rpc("increment_email_opens", { message_id: messageId });
        } catch {
          // best-effort counter update
        }
      }
    }
  } catch {
    // Never fail pixel requests.
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
