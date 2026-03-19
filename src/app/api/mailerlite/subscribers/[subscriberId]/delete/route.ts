import { NextRequest, NextResponse } from "next/server";
import { mailerliteFetch } from "@/lib/mailerlite";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { subscriberId: string } }
) {
  try {
    const res = await mailerliteFetch(
      `https://connect.mailerlite.com/api/subscribers/${params.subscriberId}`,
      { method: "DELETE" }
    );

    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json().catch(() => null) : await res.text();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "MailerLite delete failed",
          status: res.status,
          details: body,
        },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
