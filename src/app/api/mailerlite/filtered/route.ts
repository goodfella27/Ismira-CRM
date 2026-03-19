import { NextResponse } from "next/server";
import { mailerliteFetch } from "@/lib/mailerlite";
import {
  mailerliteCache,
  mailerliteGroups,
  type MailerLiteSubscriber,
} from "@/lib/mailerlite-cache";

type MailerLiteGroup = {
  id: string;
  name?: string;
};

type MailerLiteResponse = {
  data?: MailerLiteSubscriber[];
  meta?: {
    next_cursor?: string | null;
  };
  links?: {
    next?: string | null;
  };
};

const DEFAULT_LIMIT = 50;

const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getFieldString = (
  fields: unknown,
  key: string
): string | null => {
  if (!isRecord(fields)) return null;
  const value = fields[key];
  return typeof value === "string" ? value : null;
};

const extractSubscriberName = (subscriber: MailerLiteSubscriber) => {
  // Keep in sync with UI's getSubscriberName() so search works the same.
  const fields = subscriber.fields;
  const first =
    getFieldString(fields, "name") ??
    getFieldString(fields, "first_name") ??
    null;
  const last =
    getFieldString(fields, "last_name") ??
    getFieldString(fields, "surname") ??
    null;
  const fullFromFields =
    first && last ? `${first} ${last}` : first ?? last ?? null;
  const full = fullFromFields ?? subscriber.name ?? null;
  return { first, last, full };
};

const getSubscriberTimestamp = (subscriber: MailerLiteSubscriber) => {
  const candidates: Array<string | undefined> = [
    subscriber.subscribed_at,
    subscriber.created_at,
    subscriber.updated_at,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) return time;
  }
  return 0;
};

const extractCursor = (url?: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("cursor");
  } catch {
    return null;
  }
};

let rebuildPromise: Promise<ReturnType<typeof mailerliteCache.getSnapshot>> | null =
  null;

async function rebuildCache() {
  if (rebuildPromise) return rebuildPromise;
  rebuildPromise = (async () => {
    const groupRes = await mailerliteFetch("/groups?limit=1000&page=1&sort=name");
    const groupBody = (await groupRes.json()) as { data?: MailerLiteGroup[] };
    if (!groupRes.ok) {
      throw new Error("Failed to load MailerLite groups");
    }

    const groups = Array.isArray(groupBody?.data) ? groupBody.data : [];
    const groupIdByName = new Map<string, string>();
    groups.forEach((group) => {
      const name = normalize(group.name);
      if (name) groupIdByName.set(name, group.id);
    });

    const mainGroupId = groupIdByName.get(normalize(mailerliteGroups.main));
    const improveGroupId = groupIdByName.get(
      normalize(mailerliteGroups.needsImprovement)
    );
    const rejectedGroupId = groupIdByName.get(normalize(mailerliteGroups.rejected));

    const groupConfigs = [
      { id: mainGroupId, name: mailerliteGroups.main },
      { id: improveGroupId, name: mailerliteGroups.needsImprovement },
      { id: rejectedGroupId, name: mailerliteGroups.rejected },
    ].filter((group): group is { id: string; name: string } => !!group.id);

    if (groupConfigs.length === 0) {
      throw new Error("No matching MailerLite groups found");
    }

    const membership = new Map<
      string,
      { subscriber: MailerLiteSubscriber; groups: Set<string> }
    >();

    const results = await Promise.all(
      groupConfigs.map(async (group) => ({
        group,
        subscribers: await fetchGroupSubscribers(group.id),
      }))
    );

    results.forEach(({ group, subscribers }) => {
      subscribers.forEach((subscriber) => {
        const existing = membership.get(subscriber.id);
        if (existing) {
          existing.groups.add(group.name);
        } else {
          membership.set(subscriber.id, {
            subscriber,
            groups: new Set([group.name]),
          });
        }
      });
    });

    const snapshot = Array.from(membership.values()).map((item) => ({
      subscriber: item.subscriber,
      groups: Array.from(item.groups),
    }));
    mailerliteCache.updateFromSnapshot({ data: snapshot });
    return mailerliteCache.getSnapshot();
  })();
  try {
    return await rebuildPromise;
  } finally {
    rebuildPromise = null;
  }
}


async function fetchGroupSubscribers(groupId: string) {
  const collected: MailerLiteSubscriber[] = [];
  let cursor: string | null = null;

  while (true) {
    const url = new URL(
      `https://connect.mailerlite.com/api/groups/${groupId}/subscribers`
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("sort", "-subscribed_at");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await mailerliteFetch(url.toString());
    const data = (await res.json()) as MailerLiteResponse;
    if (!res.ok) {
      throw new Error(`MailerLite request failed (${res.status})`);
    }

    const items = Array.isArray(data?.data) ? data.data : [];
    collected.push(...items);

    const next =
      data?.meta?.next_cursor ?? extractCursor(data?.links?.next) ?? null;
    if (!next) break;
    cursor = next;
  }

  return collected;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const asyncRebuild = searchParams.get("async") === "1";
  const limitParam = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  const pageParam = Number(searchParams.get("page") ?? 1);
  const query = normalize(searchParams.get("q"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  try {
    let payload = mailerliteCache.hasData() ? mailerliteCache.getSnapshot() : null;
    if (!force && payload) {
      // use cached snapshot
    } else {
      if (asyncRebuild) {
        void rebuildCache();
      } else {
        payload = await rebuildCache();
      }
    }

    const list = payload?.data ?? [];
    const filtered = query
      ? list.filter((lead) => {
          const email = normalize(lead.subscriber.email);
          const nameParts = extractSubscriberName(lead.subscriber);
          const full = normalize(nameParts.full);
          const first = normalize(nameParts.first);
          const last = normalize(nameParts.last);
          const combined = `${first} ${last}`.trim();
          return (
            email.includes(query) ||
            full.includes(query) ||
            first.includes(query) ||
            last.includes(query) ||
            combined.includes(query)
          );
        })
      : list;

    const sorted = [...filtered].sort(
      (a, b) =>
        getSubscriberTimestamp(b.subscriber) -
        getSubscriberTimestamp(a.subscriber)
    );

    const total = sorted.length;
    const start = (page - 1) * limit;
    const slice = sorted.slice(start, start + limit);

    return NextResponse.json({
      data: slice,
      total,
      page,
      limit,
      counts: payload?.counts ?? { main: 0, needs_improvement: 0, rejected: 0 },
      cachedAt: payload?.cachedAt ?? new Date().toISOString(),
      rebuild: asyncRebuild && force ? "started" : "idle",
    });
  } catch (err) {
    if (mailerliteCache.hasData()) {
      const fallback = mailerliteCache.getSnapshot();
      const list = fallback.data ?? [];
      const filtered = query
        ? list.filter((lead) => {
            const email = normalize(lead.subscriber.email);
            const nameParts = extractSubscriberName(lead.subscriber);
            const full = normalize(nameParts.full);
            const first = normalize(nameParts.first);
            const last = normalize(nameParts.last);
            const combined = `${first} ${last}`.trim();
            return (
              email.includes(query) ||
              full.includes(query) ||
              first.includes(query) ||
              last.includes(query) ||
              combined.includes(query)
            );
          })
        : list;

      const sorted = [...filtered].sort(
        (a, b) =>
          getSubscriberTimestamp(b.subscriber) -
          getSubscriberTimestamp(a.subscriber)
      );
      const total = sorted.length;
      const start = (page - 1) * limit;
      const slice = sorted.slice(start, start + limit);

      return NextResponse.json({
        data: slice,
        total,
        page,
        limit,
        counts: fallback.counts,
        cachedAt: fallback.cachedAt,
        warning: "MailerLite unavailable, serving cached data.",
      });
    }
    const message = err instanceof Error ? err.message : "MailerLite failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
