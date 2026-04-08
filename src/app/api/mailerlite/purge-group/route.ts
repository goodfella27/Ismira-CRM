import { NextResponse } from "next/server";

import { mailerliteFetch } from "@/lib/mailerlite";
import {
  mailerliteCache,
  type MailerLiteSubscriber,
} from "@/lib/mailerlite-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Action = "remove_from_group" | "delete_subscriber";

type MailerLiteGroupSubscribersResponse = {
  data?: MailerLiteSubscriber[];
  meta?: {
    next_cursor?: string | null;
  };
  links?: {
    next?: string | null;
  };
};

const extractCursor = (url?: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("cursor");
  } catch {
    return null;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, ts - Date.now());
};

const shouldRetryStatus = (status: number) =>
  status === 429 || status === 408 || status === 500 || status === 502 || status === 503 || status === 504;

async function mailerliteFetchWithRetry(
  url: string,
  init?: RequestInit,
  maxAttempts: number = 5
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await mailerliteFetch(url, init);
      if (!shouldRetryStatus(res.status) || attempt === maxAttempts - 1) return res;

      const retryAfter = parseRetryAfterMs(res.headers.get("retry-after"));
      const backoff = Math.min(30_000, 600 * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(Math.max(750, retryAfter ?? backoff) + jitter);
      continue;
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts - 1) throw err;
      const backoff = Math.min(30_000, 600 * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(backoff + jitter);
    }
  }

  throw lastError ?? new Error("MailerLite request failed");
}

const parseCutoff = (input: string, inclusive: boolean) => {
  const value = input.trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const iso = inclusive
      ? `${value}T23:59:59.999Z`
      : `${value}T00:00:00.000Z`;
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return null;
    return { iso, ts };
  }

  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return { iso: new Date(ts).toISOString(), ts };
};

const getSubscribedAtTimestamp = (subscriber: MailerLiteSubscriber) => {
  const value = subscriber.subscribed_at;
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
};

const getSubscriberTimestamp = (subscriber: MailerLiteSubscriber) => {
  const candidates: Array<string | undefined> = [
    subscriber.subscribed_at,
    subscriber.created_at,
    subscriber.updated_at,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const ts = new Date(value).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return null;
};

const getComparisonTimestamp = (subscriber: MailerLiteSubscriber) =>
  getSubscribedAtTimestamp(subscriber) ?? getSubscriberTimestamp(subscriber);

const getPrimaryCompanyId = async (
  admin: ReturnType<typeof createSupabaseAdminClient>
) => {
  const { data, error } = await admin
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load company");
  if (data?.id) return data.id as string;

  const { data: created, error: createError } = await admin
    .from("companies")
    .insert({ name: "Default Company" })
    .select("id")
    .single();
  if (createError || !created?.id) {
    throw new Error(createError?.message ?? "Failed to create company");
  }
  return created.id as string;
};

const isAdmin = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  userId: string
) => {
  const { data, error } = await admin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load member role");
  const role = (data?.role as string | null) ?? null;
  return role ? role.toLowerCase() === "admin" : false;
};

async function fetchGroupSubscribersPage(options: {
  groupId: string;
  limit: number;
  cursor: string | null;
  sort: string | null;
}) {
  const { groupId, limit, cursor, sort } = options;
  const url = new URL(
    `https://connect.mailerlite.com/api/groups/${encodeURIComponent(groupId)}/subscribers`
  );
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("cursor", cursor);
  if (sort) url.searchParams.set("sort", sort);

  const res = await mailerliteFetchWithRetry(url.toString());
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    return { ok: false as const, status: res.status, body };
  }
  return { ok: true as const, body: body as MailerLiteGroupSubscribersResponse };
}

async function removeSubscriberFromGroup(groupId: string, subscriberId: string) {
  const res = await mailerliteFetchWithRetry(
    `https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(
      subscriberId
    )}/groups/${encodeURIComponent(groupId)}`,
    { method: "DELETE" }
  );
  if (res.ok || res.status === 404) return { ok: true as const };
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const details = isJson ? await res.json().catch(() => null) : await res.text();
  return { ok: false as const, status: res.status, details };
}

async function deleteSubscriber(subscriberId: string) {
  const res = await mailerliteFetchWithRetry(
    `https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(
      subscriberId
    )}`,
    { method: "DELETE" }
  );
  if (res.ok || res.status === 404) return { ok: true as const };
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const details = isJson ? await res.json().catch(() => null) : await res.text();
  return { ok: false as const, status: res.status, details };
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as
      | {
          groupId?: string;
          beforeDate?: string;
          inclusive?: boolean;
          dryRun?: boolean;
          action?: Action;
          limit?: number;
          max?: number;
          includeUnknownDates?: boolean;
        }
      | null;

    const groupId = typeof body?.groupId === "string" ? body.groupId.trim() : "";
    if (!groupId) {
      return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
    }

    const beforeDate =
      typeof body?.beforeDate === "string" ? body.beforeDate.trim() : "";
    if (!beforeDate) {
      return NextResponse.json({ error: "Missing beforeDate" }, { status: 400 });
    }

    const inclusive = body?.inclusive !== false;
    const cutoff = parseCutoff(beforeDate, inclusive);
    if (!cutoff) {
      return NextResponse.json(
        { error: "Invalid beforeDate. Use YYYY-MM-DD or ISO timestamp." },
        { status: 400 }
      );
    }

    const dryRun = body?.dryRun === true;
    const action: Action =
      body?.action === "delete_subscriber" ? "delete_subscriber" : "remove_from_group";

    const includeUnknownDates = body?.includeUnknownDates === true;
    const maxParam = Number(body?.max ?? 250);
    const max =
      Number.isFinite(maxParam) && maxParam > 0 ? Math.min(maxParam, 5000) : 500;

    const limitParam = Number(body?.limit ?? 100);
    const limit =
      Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 100;

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);
    const allowed = await isAdmin(admin, companyId, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const sortPreference = "subscribed_at";
    let supportsSort = true;

    const tryFetch = async (cursor: string | null, sort: string | null) => {
      const page = await fetchGroupSubscribersPage({
        groupId,
        limit,
        cursor,
        sort,
      });
      if (page.ok) return page;

      if (sort && (page.status === 400 || page.status === 422)) {
        supportsSort = false;
        return await fetchGroupSubscribersPage({
          groupId,
          limit,
          cursor,
          sort: null,
        });
      }

      return page;
    };

    let matched = 0;
    let deleted = 0;
    let fatal: { status?: number; details?: unknown; message: string } | null = null;
    const sample: Array<{
      id: string;
      email: string | null;
      subscribed_at: string | null;
    }> = [];
    const failures: Array<{ id: string; status: number; details: unknown }> = [];

    if (dryRun) {
      let cursor: string | null = null;
      let canEarlyStop = true;
      let stopEarly = false;
      while (true) {
        const page = await tryFetch(cursor, sortPreference);
        if (!page.ok) {
          return NextResponse.json(
            { error: "MailerLite request failed", status: page.status, details: page.body },
            { status: page.status }
          );
        }

        const data = page.body;
        const items = Array.isArray(data?.data) ? data.data : [];

        for (const subscriber of items) {
          if (!subscriber?.id) continue;
          const subscribedAtTs = getSubscribedAtTimestamp(subscriber);
          if (subscribedAtTs === null) canEarlyStop = false;

          const timestamp = getComparisonTimestamp(subscriber);
          if (timestamp === null && !includeUnknownDates) {
            canEarlyStop = false;
            continue;
          }

          const effective = timestamp ?? 0;
          if (effective <= cutoff.ts) {
            matched += 1;
            if (sample.length < 20) {
              sample.push({
                id: subscriber.id,
                email: subscriber.email ?? null,
                subscribed_at: subscriber.subscribed_at ?? null,
              });
            }
          } else if (
            supportsSort &&
            canEarlyStop &&
            subscribedAtTs !== null &&
            subscribedAtTs > cutoff.ts
          ) {
            // Oldest-first ordering, so we can stop once we reach newer ones.
            stopEarly = true;
            break;
          }
        }

        if (stopEarly) break;

        const next =
          data?.meta?.next_cursor ?? extractCursor(data?.links?.next) ?? null;
        if (!next) break;
        cursor = next;
      }

      return NextResponse.json({
        ok: true,
        dryRun: true,
        action,
        groupId,
        cutoff: cutoff.iso,
        inclusive,
        matched,
        sample,
        supportsSort,
        note:
          action === "remove_from_group"
            ? "This will remove subscribers from the selected group (does not delete them from your account)."
            : "This will permanently delete subscribers from your MailerLite account.",
      });
    }

    const deleteOne = async (subscriberId: string) => {
      if (action === "delete_subscriber") return await deleteSubscriber(subscriberId);
      return await removeSubscriberFromGroup(groupId, subscriberId);
    };

    // Probe once to confirm sort support before choosing deletion strategy.
    const probe = await tryFetch(null, sortPreference);
    if (!probe.ok) {
      return NextResponse.json(
        { error: "MailerLite request failed", status: probe.status, details: probe.body },
        { status: probe.status }
      );
    }

    if (supportsSort) {
      // Delete from oldest forward by repeatedly fetching the first page.
      // This avoids cursor drift while deletions are happening.
      while (deleted < max) {
        const page = await tryFetch(null, sortPreference);
        if (!page.ok) {
          fatal = {
            status: page.status,
            details: page.body,
            message: "MailerLite request failed while listing group subscribers.",
          };
          break;
        }
        const data = page.body;
        const items = Array.isArray(data?.data) ? data.data : [];
        if (items.length === 0) break;

        const targets: MailerLiteSubscriber[] = [];
        for (const subscriber of items) {
          if (!subscriber?.id) continue;
          const subscribedAtTs = getSubscribedAtTimestamp(subscriber);
          const timestamp = getComparisonTimestamp(subscriber);
          if (timestamp === null && !includeUnknownDates) continue;
          const effective = timestamp ?? 0;
          if (effective <= cutoff.ts) {
            targets.push(subscriber);
          } else {
            if (subscribedAtTs !== null) break;
          }
        }

        if (targets.length === 0) break;

        for (const subscriber of targets) {
          if (deleted >= max) break;
          const res = await deleteOne(subscriber.id);
          if (res.ok) {
            deleted += 1;
          } else {
            failures.push({
              id: subscriber.id,
              status: res.status,
              details: res.details,
            });
          }
        }
      }
    } else {
      // Fallback: scan with cursors (no deletes while scanning), then delete the collected targets.
      let cursor: string | null = null;
      const ids: string[] = [];
      while (ids.length < max) {
        const page = await tryFetch(cursor, null);
        if (!page.ok) {
          fatal = {
            status: page.status,
            details: page.body,
            message: "MailerLite request failed while scanning group subscribers.",
          };
          break;
        }
        const data = page.body;
        const items = Array.isArray(data?.data) ? data.data : [];

        for (const subscriber of items) {
          if (!subscriber?.id) continue;
          const timestamp = getComparisonTimestamp(subscriber);
          if (timestamp === null && !includeUnknownDates) continue;
          const effective = timestamp ?? 0;
          if (effective <= cutoff.ts) ids.push(subscriber.id);
          if (ids.length >= max) break;
        }

        const next =
          data?.meta?.next_cursor ?? extractCursor(data?.links?.next) ?? null;
        if (!next) break;
        cursor = next;
      }

      if (ids.length > 0) {
        for (const id of ids) {
          const res = await deleteOne(id);
          if (res.ok) {
            deleted += 1;
          } else {
            failures.push({ id, status: res.status, details: res.details });
          }
        }
      }
    }

    // Invalidate in-memory filtered cache (if used).
    mailerliteCache.clear();

    // If nothing was deleted and we hit a fatal error, bubble it up as an error response.
    if (fatal && deleted === 0) {
      return NextResponse.json(
        {
          error: fatal.message,
          status: fatal.status,
          details: fatal.details,
        },
        { status: fatal.status ?? 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      action,
      groupId,
      cutoff: cutoff.iso,
      inclusive,
      deleted,
      failures: failures.slice(0, 25),
      failureCount: failures.length,
      supportsSort,
      warning: fatal ? fatal.message : null,
      warningStatus: fatal?.status ?? null,
      note:
        deleted >= max
          ? `Stopped after deleting ${max} subscribers (max reached). Run again to continue.`
          : fatal
            ? "Stopped early due to a MailerLite error. Some deletions may still process on MailerLite’s side; wait 1–2 minutes and run again."
          : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
