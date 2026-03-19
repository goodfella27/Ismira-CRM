import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  mailerliteCache,
  mailerliteGroups,
  type MailerLiteSubscriber,
} from "@/lib/mailerlite-cache";

type WebhookGroup = {
  id?: string;
  name?: string;
};

type WebhookEvent = {
  type?: string;
  event?: string;
  subscriber?: MailerLiteSubscriber;
  group?: WebhookGroup;
  data?: {
    subscriber?: MailerLiteSubscriber;
    group?: WebhookGroup;
  };
  id?: string;
  email?: string;
};

const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

const extractGroupName = (group?: WebhookGroup | null) =>
  group?.name?.trim() || "";

const extractSubscriber = (event: WebhookEvent): MailerLiteSubscriber | null => {
  if (event.subscriber?.id) return event.subscriber;
  if (event.data?.subscriber?.id) return event.data.subscriber;
  if (event.id) {
    const fallback = event as MailerLiteSubscriber;
    return fallback.id ? fallback : null;
  }
  return null;
};

const extractEventType = (event: WebhookEvent) =>
  event.type ?? event.event ?? "";

const isGroupAdd = (type: string) =>
  normalize(type).includes("added_to_group");
const isGroupRemove = (type: string) =>
  normalize(type).includes("removed_from_group");
const isSubscriberDelete = (type: string) =>
  normalize(type).includes("deleted");

const isRelevantGroup = (name: string) => {
  const normalized = normalize(name);
  return (
    normalized === normalize(mailerliteGroups.main) ||
    normalized === normalize(mailerliteGroups.needsImprovement) ||
    normalized === normalize(mailerliteGroups.rejected)
  );
};

const verifySignature = (payload: string, signature: string, secret: string) => {
  const hash = createHmac("sha256", secret).update(payload).digest("hex");
  const normalized = signature.trim().toLowerCase();
  const sigBuffer = Buffer.from(normalized);
  const hashBuffer = Buffer.from(hash);
  if (sigBuffer.length !== hashBuffer.length) return false;
  return timingSafeEqual(sigBuffer, hashBuffer);
};

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const expectedToken = process.env.MAILERLITE_WEBHOOK_TOKEN;
  if (expectedToken) {
    const provided = searchParams.get("token") ?? "";
    if (!provided || provided !== expectedToken) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  const rawBody = await request.text();
  const secret = process.env.MAILERLITE_WEBHOOK_SECRET;
  const signature =
    request.headers.get("Signature") ?? request.headers.get("signature");

  if (secret) {
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: unknown = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const events = Array.isArray((payload as { events?: unknown }).events)
    ? ((payload as { events?: WebhookEvent[] }).events as WebhookEvent[])
    : ([payload] as WebhookEvent[]);

  events.forEach((event) => {
    const type = extractEventType(event);
    const subscriber = extractSubscriber(event);
    const group = event.group ?? event.data?.group ?? null;
    const groupName = extractGroupName(group);

    if (!subscriber?.id) return;

    if (isGroupAdd(type) && isRelevantGroup(groupName)) {
      mailerliteCache.addGroup(subscriber, groupName);
      return;
    }
    if (isGroupRemove(type) && isRelevantGroup(groupName)) {
      mailerliteCache.removeGroup(subscriber.id, groupName);
      return;
    }
    if (isSubscriberDelete(type)) {
      mailerliteCache.removeSubscriber(subscriber.id);
      return;
    }
    mailerliteCache.upsertSubscriber(subscriber);
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
