import { NextRequest, NextResponse } from "next/server";
import { mailerliteFetch } from "@/lib/mailerlite";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFirstString(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function buildZapierPayload(subscriber: Record<string, unknown>) {
  const fields = isRecord(subscriber.fields) ? subscriber.fields : {};
  const firstName = pickFirstString(fields.name, fields.first_name);
  const lastName = pickFirstString(fields.last_name, fields.surname);
  const fullName = pickFirstString(
    firstName && lastName ? `${firstName} ${lastName}` : undefined,
    subscriber.name,
    subscriber.email
  );

  const desiredPosition = pickFirstString(
    fields.desired_position,
    fields.position_or_department_desired,
    fields.position,
    fields.department,
    fields.department_you_would_like_to_work_at
  );

  return {
    subscriber_id: subscriber.id,
    email: subscriber.email ?? null,
    name: subscriber.name ?? null,
    full_name: fullName ?? null,
    first_name: firstName ?? null,
    last_name: lastName ?? null,
    phone: pickFirstString(fields.phone, subscriber.phone) ?? null,
    country: subscriber.country ?? (fields.country as string | undefined) ?? null,
    status: subscriber.status ?? null,
    desired_position: desiredPosition ?? null,
    fields,
    groups: subscriber.groups ?? null,
    segments: subscriber.segments ?? null,
    source: "mailerlite",
  };
}

export async function POST(request: NextRequest) {
  try {
    const { subscriberId } = (await request.json()) as { subscriberId?: string };
    if (!subscriberId) {
      return NextResponse.json({ error: "Missing subscriberId" }, { status: 400 });
    }

    const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: "Missing ZAPIER_WEBHOOK_URL" },
        { status: 500 }
      );
    }

    const subscriberRes = await mailerliteFetch(
      `https://connect.mailerlite.com/api/subscribers/${subscriberId}`
    );
    const subscriberJson = await subscriberRes.json().catch(() => null);
    if (!subscriberRes.ok) {
      return NextResponse.json(
        {
          error: "MailerLite request failed",
          status: subscriberRes.status,
          details: subscriberJson,
        },
        { status: subscriberRes.status }
      );
    }

    const subscriber = subscriberJson?.data as Record<string, unknown> | undefined;
    if (!subscriber) {
      return NextResponse.json(
        { error: "Subscriber not found" },
        { status: 404 }
      );
    }

    const payload = buildZapierPayload(subscriber);

    const zapRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const zapBody = await zapRes.text().catch(() => "");

    if (!zapRes.ok) {
      return NextResponse.json(
        {
          error: "Zapier webhook failed",
          status: zapRes.status,
          details: zapBody,
        },
        { status: zapRes.status }
      );
    }

    return NextResponse.json({ ok: true, payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
