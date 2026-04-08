"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Skeleton from "@/components/Skeleton";

const PAGE_LIMIT = 25;
const PIPELINE_STAGE_ID = "consultation";
const PIPELINE_POOL_ID = "roomy";
const PIPELINE_ID = "mailerlite";

type MailerLiteGroup = {
  id: string;
  name?: string;
  active_count?: number;
  total?: number;
};

type MailerLiteSubscriber = {
  id: string;
  email?: string;
  status?: string;
  name?: string;
  country?: string;
  created_at?: string;
  subscribed_at?: string;
  updated_at?: string;
  sent?: number;
  opens_count?: number;
  clicks_count?: number;
  fields?: Record<string, unknown>;
};

type FilteredCategory = "main" | "needs_improvement";

type FilteredLead = {
  subscriber: MailerLiteSubscriber;
  groups: string[];
  category: FilteredCategory;
};

type GroupsResponse = {
  data?: MailerLiteGroup[];
};

type SubscribersResponse = {
  data?: MailerLiteSubscriber[];
  meta?: {
    next_cursor?: string | null;
    prev_cursor?: string | null;
  };
  links?: {
    next?: string | null;
    prev?: string | null;
  };
};

type SubscriberDetailsResponse = {
  data?: Record<string, unknown>;
};

type FilteredResponse = {
  data?: FilteredLead[];
  total?: number;
  page?: number;
  limit?: number;
  counts?: {
    main?: number;
    needs_improvement?: number;
    rejected?: number;
  };
  cachedAt?: string;
  error?: string;
};

type BreezyCheckResponse = {
  exists: boolean;
  candidateId?: string | null;
  status?: "ok" | "error" | "not_configured";
  message?: string;
};

type PipelineCandidate = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar_url?: string | null;
  pipeline_id: string;
  pool_id: string;
  stage_id: string;
  country?: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  order: number;
  source?: string;
  mailerlite?: Record<string, unknown>;
  experience_summary?: string;
  work_history?: Array<{
    id: string;
    role: string;
    company: string;
    start?: string;
    end?: string;
    details?: string;
  }>;
  education?: Array<{
    id: string;
    program: string;
    institution: string;
    start?: string;
    end?: string;
    details?: string;
  }>;
};

function getInitials(value?: string) {
  if (!value) return "?";
  const cleaned = value.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (
      value.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "name" in (item as Record<string, unknown>)
      )
    ) {
      return value
        .map((item) => String((item as Record<string, unknown>).name))
        .join(", ");
    }
    if (value.every((item) => ["string", "number"].includes(typeof item))) {
      return value.join(", ");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "object") {
    if (
      "name" in (value as Record<string, unknown>) &&
      typeof (value as Record<string, unknown>).name === "string"
    ) {
      return String((value as Record<string, unknown>).name);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

function formatKey(label: string) {
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSubscriberName(subscriber: MailerLiteSubscriber) {
  const fields = isRecord(subscriber.fields) ? subscriber.fields : {};
  const first =
    (fields.name as string | undefined) ??
    (fields.first_name as string | undefined) ??
    undefined;
  const last =
    (fields.last_name as string | undefined) ??
    (fields.surname as string | undefined) ??
    undefined;
  const fullFromFields =
    first && last ? `${first} ${last}` : first ?? last ?? undefined;

  return {
    first,
    last,
    full: fullFromFields ?? subscriber.name ?? undefined,
  };
}

function getSubscriberTimestamp(subscriber: MailerLiteSubscriber) {
  const fields = isRecord(subscriber.fields) ? subscriber.fields : {};
  const candidates: Array<unknown> = [
    subscriber.subscribed_at,
    subscriber.created_at,
    subscriber.updated_at,
    fields.subscribed_at,
    fields.created_at,
    fields.updated_at,
  ];

  for (const value of candidates) {
    if (typeof value === "string") {
      const ts = Date.parse(value);
      if (!Number.isNaN(ts)) return ts;
    }
  }
  return 0;
}

function mergeSubscribers(
  base: MailerLiteSubscriber[],
  incoming: MailerLiteSubscriber[]
) {
  const map = new Map<string, MailerLiteSubscriber>();
  base.forEach((subscriber) => map.set(subscriber.id, subscriber));
  incoming.forEach((subscriber) => map.set(subscriber.id, subscriber));
  return Array.from(map.values());
}

function extractCursor(link?: string | null) {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.searchParams.get("cursor");
  } catch {
    return null;
  }
}

function buildActionErrorMessage(
  data: unknown,
  fallback: string
): string {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  const error = typeof record.error === "string" ? record.error : fallback;
  const details = record.details;
  if (typeof details === "string" && details.trim()) {
    return `${error}: ${details}`;
  }
  if (details && typeof details === "object") {
    try {
      return `${error}: ${JSON.stringify(details)}`;
    } catch {
      return error;
    }
  }
  return error;
}

type CandidateRow = {
  id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  pool_id: string | null;
  status: string | null;
  order: number | null;
  created_at: string | null;
  updated_at: string | null;
  data: Record<string, unknown> | null;
};

const buildCandidateRow = (candidate: PipelineCandidate) => {
  const {
    id,
    pipeline_id,
    stage_id,
    pool_id,
    status,
    order,
    created_at,
    updated_at,
    ...data
  } = candidate;
  return {
    id,
    pipeline_id,
    stage_id,
    pool_id,
    status,
    order,
    created_at,
    updated_at,
    data,
  };
};

export default function LeadsPage() {
  const [viewMode, setViewMode] = useState<"group" | "filtered">("group");
  const [groups, setGroups] = useState<MailerLiteGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [subscribers, setSubscribers] = useState<MailerLiteSubscriber[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const loadAllIdRef = useRef(0);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingSubscribers, setLoadingSubscribers] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [allSubscribers, setAllSubscribers] = useState<MailerLiteSubscriber[]>([]);
  const [loadingAllSubscribers, setLoadingAllSubscribers] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [selectedSubscriber, setSelectedSubscriber] =
    useState<MailerLiteSubscriber | null>(null);
  const [subscriberDetails, setSubscriberDetails] =
    useState<Record<string, unknown> | null>(null);
  const [breezyStatus, setBreezyStatus] = useState<
    Record<string, "unknown" | "checking" | "exists" | "missing" | "error">
  >({});
  const [breezyActionLoading, setBreezyActionLoading] = useState<
    Record<string, boolean>
  >({});
  const [breezyActionMessage, setBreezyActionMessage] = useState<string | null>(
    null
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSendLoading, setBulkSendLoading] = useState(false);
  const [bulkPipelineLoading, setBulkPipelineLoading] = useState(false);
  const [pipelineActionLoading, setPipelineActionLoading] = useState<
    Record<string, boolean>
  >({});
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);
  const [filteredLeads, setFilteredLeads] = useState<FilteredLead[]>([]);
  const [filteredCounts, setFilteredCounts] = useState({
    main: 0,
    needs_improvement: 0,
    rejected: 0,
  });
  const [filteredLoading, setFilteredLoading] = useState(false);
  const [filteredRefreshing, setFilteredRefreshing] = useState(false);
  const [filteredError, setFilteredError] = useState<string | null>(null);
  const [filteredSearch, setFilteredSearch] = useState("");
  const [filteredUpdatedAt, setFilteredUpdatedAt] = useState<string | null>(null);
  const [filteredPage, setFilteredPage] = useState(1);
  const [filteredPageSize] = useState(50);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const filteredUpdatedAtRef = useRef<string | null>(null);
  const filteredPollRef = useRef<number | null>(null);
  const [pipelineIndexLoading, setPipelineIndexLoading] = useState(false);
  const [pipelineIndexError, setPipelineIndexError] = useState<string | null>(
    null
  );
  const [pipelineIds, setPipelineIds] = useState<Set<string>>(new Set());
  const [pipelineEmails, setPipelineEmails] = useState<Set<string>>(new Set());
  const [purgeBeforeDate, setPurgeBeforeDate] = useState<string>("");
  const [purgeInclusive, setPurgeInclusive] = useState(true);
  const [purgeAction, setPurgeAction] = useState<
    "remove_from_group" | "delete_subscriber"
  >("remove_from_group");
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgePreviewCount, setPurgePreviewCount] = useState<number | null>(null);
  const [purgeDeletedCount, setPurgeDeletedCount] = useState<number | null>(null);
  const [purgeFailureCount, setPurgeFailureCount] = useState<number | null>(null);
  const [purgeNote, setPurgeNote] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "")
    );
  }, [groups]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const visibleSubscribers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const baseList =
      query && allSubscribers.length > 0 ? allSubscribers : subscribers;
    const sorted = [...baseList].sort(
      (a, b) => getSubscriberTimestamp(b) - getSubscriberTimestamp(a)
    );
    if (!query) return sorted;
    return sorted.filter((subscriber) => {
      const email = subscriber.email ?? "";
      const name = getSubscriberName(subscriber).full ?? "";
      return (
        email.toLowerCase().includes(query) ||
        name.toLowerCase().includes(query)
      );
    });
  }, [searchQuery, subscribers, allSubscribers]);

  const visibleFilteredLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      const aTime = getSubscriberTimestamp(a.subscriber);
      const bTime = getSubscriberTimestamp(b.subscriber);
      return bTime - aTime;
    });
  }, [filteredLeads]);

  const suggestionOptions = useMemo(() => {
    const options = new Set<string>();
    subscribers.forEach((subscriber) => {
      if (subscriber.email) options.add(subscriber.email);
      const name = getSubscriberName(subscriber).full;
      if (name) options.add(name);
    });
    return Array.from(options).slice(0, 50);
  }, [subscribers]);

  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return suggestionOptions
      .filter((option) => option.toLowerCase().includes(query))
      .slice(0, 8);
  }, [suggestionOptions, searchQuery]);

  const loadPipelineIndex = useCallback(async () => {
    setPipelineIndexLoading(true);
    setPipelineIndexError(null);
    try {
      const { data, error } = await supabase
        .from("candidates")
        .select("id, data, pipeline_id");
      if (error) throw new Error(error.message);
      const ids = new Set<string>();
      const emails = new Set<string>();
      (data ?? []).forEach((row) => {
        const pipelineId = row.pipeline_id as string | null;
        if (pipelineId && pipelineId !== PIPELINE_ID) return;
        const id = row.id as string | null;
        if (id) ids.add(id);
        const payload = row.data as Record<string, unknown> | null;
        const email =
          typeof payload?.email === "string" ? payload.email : undefined;
        if (email) emails.add(email.toLowerCase());
      });
      setPipelineIds(ids);
      setPipelineEmails(emails);
    } catch (err) {
      setPipelineIndexError(
        err instanceof Error ? err.message : "Failed to load pipeline index"
      );
      setPipelineIds(new Set());
      setPipelineEmails(new Set());
    } finally {
      setPipelineIndexLoading(false);
    }
  }, [supabase]);

  const fetchStageMinOrder = useCallback(async () => {
    const { data, error } = await supabase
      .from("candidates")
      .select("order")
      .eq("pipeline_id", PIPELINE_ID)
      .eq("stage_id", PIPELINE_STAGE_ID)
      .order("order", { ascending: true })
      .limit(1);
    if (error) return 0;
    const min = data?.[0]?.order;
    return typeof min === "number" ? min : 0;
  }, [supabase]);

  const loadFilteredLeads = useCallback(
    async (force = false, silent = false, asyncMode = false) => {
      if (!silent) {
        setFilteredLoading(true);
      }
      setFilteredError(null);
    try {
      const params = new URLSearchParams({
        page: String(filteredPage),
        limit: String(filteredPageSize),
      });
      if (filteredSearch.trim()) {
        params.set("q", filteredSearch.trim());
      }
      if (force) params.set("force", "1");
      if (asyncMode) params.set("async", "1");
      const res = await fetch(
        `/api/mailerlite/filtered?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = (await res.json().catch(() => null)) as FilteredResponse | null;
      if (!res.ok) {
        throw new Error(data?.error ?? `Failed to load filtered leads (${res.status})`);
      }
      setFilteredLeads(Array.isArray(data?.data) ? data.data : []);
      setFilteredTotal(typeof data?.total === "number" ? data.total : 0);
      setFilteredCounts({
        main: data?.counts?.main ?? 0,
        needs_improvement: data?.counts?.needs_improvement ?? 0,
        rejected: data?.counts?.rejected ?? 0,
      });
      setFilteredUpdatedAt(data?.cachedAt ?? null);
    } catch (err) {
      setFilteredError(
        err instanceof Error ? err.message : "Failed to load filtered leads"
      );
    } finally {
      if (!silent) {
        setFilteredLoading(false);
      }
    }
  },
  [filteredPage, filteredPageSize, filteredSearch]
  );


  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/mailerlite/groups?limit=1000&page=1&sort=name`,
        { cache: "no-store" }
      );
      const contentType = res.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const data = (isJson ? await res.json() : null) as GroupsResponse | null;
      if (!res.ok) {
        const message =
          (data as { error?: string; details?: { message?: string } })?.error ??
          (data as { details?: { message?: string } })?.details?.message ??
          `Failed to load groups (${res.status})`;
        throw new Error(message);
      }
      setGroups(data?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups");
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const loadSubscribers = useCallback(
    async (groupId: string, cursor?: string | null) => {
      setLoadingSubscribers(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_LIMIT),
          sort: "-subscribed_at",
        });
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(
          `/api/mailerlite/group-subscribers?groupId=${encodeURIComponent(
            groupId
          )}&${params.toString()}`,
          { cache: "no-store" }
        );
        const contentType = res.headers.get("content-type") ?? "";
        const isJson = contentType.includes("application/json");
        const data = (isJson ? await res.json() : null) as SubscribersResponse | null;
        if (!res.ok) {
          const message =
            (data as { error?: string; details?: { message?: string } })?.error ??
            (data as { details?: { message?: string } })?.details?.message ??
            `Failed to load subscribers (${res.status})`;
          throw new Error(message);
        }

        setSubscribers(data?.data ?? []);

        const next = data?.meta?.next_cursor ?? extractCursor(data?.links?.next);
        const prev = data?.meta?.prev_cursor ?? extractCursor(data?.links?.prev);
        setNextCursor(next ?? null);
        setPrevCursor(prev ?? null);
        setCurrentCursor(cursor ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load subscribers");
      } finally {
        setLoadingSubscribers(false);
      }
    },
    []
  );

  const loadAllSubscribers = useCallback(
    async (groupId: string) => {
      const loadId = Date.now();
      loadAllIdRef.current = loadId;
      setLoadingAllSubscribers(true);

      try {
        const collected: MailerLiteSubscriber[] = [];
        const seen = new Set<string>();
        let cursor: string | null = null;

        while (true) {
          const params = new URLSearchParams({ limit: "100", sort: "-subscribed_at" });
          if (cursor) params.set("cursor", cursor);

          const res = await fetch(
            `/api/mailerlite/group-subscribers?groupId=${encodeURIComponent(
              groupId
            )}&${params.toString()}`,
            { cache: "no-store" }
          );
          const contentType = res.headers.get("content-type") ?? "";
          const isJson = contentType.includes("application/json");
          const data = (isJson ? await res.json() : null) as
            | SubscribersResponse
            | null;
          if (!res.ok) {
            throw new Error(`Failed to load subscribers (${res.status})`);
          }

          const items = data?.data ?? [];
          items.forEach((subscriber) => {
            if (!seen.has(subscriber.id)) {
              seen.add(subscriber.id);
              collected.push(subscriber);
            }
          });
          if (loadAllIdRef.current !== loadId) return;
          setAllSubscribers([...collected]);

          const next =
            data?.meta?.next_cursor ?? extractCursor(data?.links?.next);
          if (!next) break;

          cursor = next;
          if (loadAllIdRef.current !== loadId) return;
        }

        if (loadAllIdRef.current !== loadId) return;
        setAllSubscribers(collected);
      } catch {
        // ignore background indexing errors
      } finally {
        if (loadAllIdRef.current === loadId) {
          setLoadingAllSubscribers(false);
        }
      }
    },
    []
  );

  const runGroupPurge = useCallback(
    async (dryRun: boolean) => {
      setPurgeError(null);
      setPurgeDeletedCount(null);
      setPurgeFailureCount(null);
      setPurgeNote(null);
      if (!selectedGroupId) {
        setPurgeError("Select a group first.");
        return;
      }
      if (!purgeBeforeDate) {
        setPurgeError("Pick a date first.");
        return;
      }

      setPurgeLoading(true);
      try {
        const res = await fetch("/api/mailerlite/purge-group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: selectedGroupId,
            beforeDate: purgeBeforeDate,
            inclusive: purgeInclusive,
            dryRun,
            action: purgeAction,
            max: 250,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const status =
            typeof data?.status === "number" ? data.status : res.status;
          const detailsMessage =
            typeof data?.details?.message === "string"
              ? data.details.message
              : typeof data?.details?.error === "string"
                ? data.details.error
                : null;
          const base = typeof data?.error === "string" ? data.error : "Purge failed";
          throw new Error(
            detailsMessage ? `${base} (${status}): ${detailsMessage}` : `${base} (${status})`
          );
        }

        if (dryRun) {
          setPurgePreviewCount(
            typeof data?.matched === "number" ? data.matched : null
          );
          setPurgeNote(typeof data?.note === "string" ? data.note : null);
        } else {
          setPurgePreviewCount(null);
          setPurgeDeletedCount(
            typeof data?.deleted === "number" ? data.deleted : null
          );
          setPurgeFailureCount(
            typeof data?.failureCount === "number" ? data.failureCount : null
          );
          setPurgeNote(
            typeof data?.note === "string"
              ? data.note
              : typeof data?.warning === "string"
                ? data.warning
                : null
          );
          await Promise.all([
            loadSubscribers(selectedGroupId, null),
            loadAllSubscribers(selectedGroupId),
          ]);
        }
      } catch (err) {
        setPurgeError(err instanceof Error ? err.message : "Purge failed");
      } finally {
        setPurgeLoading(false);
      }
    },
    [
      selectedGroupId,
      purgeBeforeDate,
      purgeInclusive,
      purgeAction,
      loadSubscribers,
      loadAllSubscribers,
    ]
  );

  const loadSubscriberDetails = useCallback(
    async (subscriber: MailerLiteSubscriber) => {
      setSelectedSubscriber(subscriber);
      setSubscriberDetails(null);
      setDetailsError(null);
      setLoadingDetails(true);

      try {
        const res = await fetch(
          `/api/mailerlite/subscriber-details?subscriberId=${encodeURIComponent(
            subscriber.id
          )}`,
          { cache: "no-store" }
        );
        const contentType = res.headers.get("content-type") ?? "";
        const isJson = contentType.includes("application/json");
        const data = (isJson ? await res.json() : null) as
          | SubscriberDetailsResponse
          | null;
        if (!res.ok) {
          const message =
            (data as { error?: string; details?: { message?: string } })?.error ??
            (data as { details?: { message?: string } })?.details?.message ??
            `Failed to load subscriber (${res.status})`;
          throw new Error(message);
        }
        setSubscriberDetails(data?.data ?? null);
      } catch (err) {
        setDetailsError(
          err instanceof Error ? err.message : "Failed to load subscriber"
        );
      } finally {
        setLoadingDetails(false);
      }
    },
    []
  );

  const checkBreezyStatus = useCallback(
    async (_subscriber: MailerLiteSubscriber) => {
      // Breezy API is disabled; leave status as unknown for now.
      return;
    },
    []
  );

  const sendToBreezyRequest = useCallback(async (subscriberId: string) => {
      const res = await fetch(`/api/zapier/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberId }),
      });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        buildActionErrorMessage(
          data,
          `Zapier send failed (${res.status})`
        )
      );
    }
    return data;
  }, []);

  const sendToBreezy = useCallback(
    async (subscriber: MailerLiteSubscriber) => {
      setBreezyActionLoading((prev) => ({ ...prev, [subscriber.id]: true }));
      setBreezyActionMessage(null);

      try {
        await sendToBreezyRequest(subscriber.id);
        setBreezyStatus((prev) => ({ ...prev, [subscriber.id]: "exists" }));
        setBreezyActionMessage("Sent to Zapier.");
        // no-op: pipeline membership is tracked in Supabase
      } catch (err) {
        setBreezyActionMessage(
          err instanceof Error ? err.message : "Zapier send failed"
        );
        setBreezyStatus((prev) => ({ ...prev, [subscriber.id]: "error" }));
      } finally {
        setBreezyActionLoading((prev) => ({ ...prev, [subscriber.id]: false }));
      }
    },
    [sendToBreezyRequest]
  );

  // Delete flow removed in favor of pipeline actions.

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (viewMode !== "filtered") return;
    loadFilteredLeads();
  }, [viewMode, loadFilteredLeads, filteredPage, filteredSearch]);

  useEffect(() => {
    filteredUpdatedAtRef.current = filteredUpdatedAt;
  }, [filteredUpdatedAt]);

  useEffect(() => {
    return () => {
      if (filteredPollRef.current) {
        window.clearTimeout(filteredPollRef.current);
      }
    };
  }, []);


  useEffect(() => {
    loadPipelineIndex();
  }, [loadPipelineIndex]);

  useEffect(() => {
    const channel = supabase.channel("leads-pipeline-realtime");
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "candidates" },
      () => {
        loadPipelineIndex();
      }
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadPipelineIndex]);

  useEffect(() => {
    if (viewMode !== "group") return;
    if (!selectedGroupId) {
      setSubscribers([]);
      setNextCursor(null);
      setPrevCursor(null);
      setCurrentCursor(null);
      setAllSubscribers([]);
      return;
    }

    loadSubscribers(selectedGroupId, null);
    loadAllSubscribers(selectedGroupId);
  }, [selectedGroupId, loadSubscribers, loadAllSubscribers, viewMode]);

  useEffect(() => {
    if (viewMode !== "group") return;
    if (!selectedGroupId) return;
    if (currentCursor) return;
    if (searchQuery.trim()) return;

    const intervalId = window.setInterval(() => {
      if (loadingSubscribers) return;
      loadSubscribers(selectedGroupId, null);
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, [
    selectedGroupId,
    currentCursor,
    searchQuery,
    loadingSubscribers,
    loadSubscribers,
    viewMode,
  ]);

  useEffect(() => {
    if (subscribers.length === 0) return;
    subscribers.forEach((subscriber) => {
      checkBreezyStatus(subscriber);
    });
  }, [subscribers, checkBreezyStatus]);

  useEffect(() => {
    if (subscribers.length === 0) return;
    setAllSubscribers((prev) => mergeSubscribers(prev, subscribers));
  }, [subscribers]);

  useEffect(() => {
    if (subscribers.length === 0) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set<string>();
      subscribers.forEach((subscriber) => {
        if (prev.has(subscriber.id)) next.add(subscriber.id);
      });
      return next;
    });
  }, [subscribers]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const list = visibleSubscribers;
      if (list.length === 0) return prev;
      const allSelected = list.every((subscriber) =>
        prev.has(subscriber.id)
      );
      if (allSelected) return new Set();
      return new Set(list.map((subscriber) => subscriber.id));
    });
  };

  const bulkSendToBreezy = async () => {
    if (selectedIds.size === 0) return;
    setBulkSendLoading(true);
    setBreezyActionMessage(null);
    let successCount = 0;

    try {
      for (const id of selectedIds) {
        setBreezyActionLoading((prev) => ({ ...prev, [id]: true }));
        try {
          await sendToBreezyRequest(id);
          successCount += 1;
          setBreezyStatus((prev) => ({ ...prev, [id]: "exists" }));
          setSentIds((prev) => new Set([...prev, id]));
        } catch {
          setBreezyStatus((prev) => ({ ...prev, [id]: "error" }));
        } finally {
          setBreezyActionLoading((prev) => ({ ...prev, [id]: false }));
        }
      }
    } finally {
      setBulkSendLoading(false);
      // no-op: pipeline membership is tracked in Supabase
      setBreezyActionMessage(
        `Zapier send complete: ${successCount}/${selectedIds.size} succeeded.`
      );
    }
  };

  const buildPipelineCandidate = (
    subscriber: MailerLiteSubscriber,
    order: number
  ) => {
    const fields = isRecord(subscriber.fields) ? subscriber.fields : {};
    const email =
      subscriber.email ?? `unknown-${subscriber.id}@mailerlite.local`;
    const name =
      getSubscriberName(subscriber).full ??
      subscriber.name ??
      subscriber.email ??
      "Unknown Candidate";
    const createdAt =
      subscriber.subscribed_at ??
      subscriber.created_at ??
      new Date().toISOString();

    const country =
      (subscriber.country as string | undefined) ??
      (fields?.country as string | undefined) ??
      (fields?.country_name as string | undefined);
    const candidate: PipelineCandidate = {
      id: `ml-${subscriber.id}`,
      name,
      email,
      phone: (fields.phone as string | undefined) ?? undefined,
      avatar_url: null,
      pipeline_id: PIPELINE_ID,
      pool_id: PIPELINE_POOL_ID,
      stage_id: PIPELINE_STAGE_ID,
      country,
      status: "active",
      created_at: createdAt,
      updated_at: new Date().toISOString(),
      order,
      source: "MailerLite",
      mailerlite: undefined,
      experience_summary: "",
      work_history: [],
      education: [],
    };

    return candidate;
  };

  const addToPipeline = async (subscriber: MailerLiteSubscriber) => {
    setPipelineMessage(null);
    setPipelineActionLoading((prev) => ({ ...prev, [subscriber.id]: true }));
    try {
      const email = subscriber.email?.toLowerCase() ?? "";
      const pipelineId = `ml-${subscriber.id}`;
      const exists =
        pipelineIds.has(pipelineId) || (email ? pipelineEmails.has(email) : false);
      if (exists) {
        setPipelineMessage("Candidate already in pipeline.");
        return;
      }
      const minOrder = await fetchStageMinOrder();
      const candidate = buildPipelineCandidate(subscriber, minOrder - 1);
      const { error } = await supabase
        .from("candidates")
        .upsert(buildCandidateRow(candidate), { onConflict: "id" });
      if (error) {
        throw new Error(error.message);
      }
      setPipelineIds((prev) => new Set(prev).add(candidate.id));
      setPipelineEmails((prev) => {
        const next = new Set(prev);
        if (candidate.email) next.add(candidate.email.toLowerCase());
        return next;
      });
      setPipelineMessage("Added to pipeline.");
      await loadPipelineIndex();
    } catch (err) {
      setPipelineMessage(
        err instanceof Error ? err.message : "Failed to add to pipeline."
      );
    } finally {
      setPipelineActionLoading((prev) => ({ ...prev, [subscriber.id]: false }));
    }
  };

  const bulkAddToPipeline = () => {
    if (selectedIds.size === 0) return;
    setBulkPipelineLoading(true);
    setPipelineMessage(null);
    (async () => {
      try {
        const minOrder = await fetchStageMinOrder();
        let orderOffset = 1;
        const lookup = new Map<string, MailerLiteSubscriber>();
        [...subscribers, ...allSubscribers].forEach((subscriber) => {
          lookup.set(subscriber.id, subscriber);
        });
        const existingIds = new Set(pipelineIds);
        const existingEmails = new Set(pipelineEmails);
        const toAdd: PipelineCandidate[] = [];

        selectedIds.forEach((id) => {
          const subscriber = lookup.get(id);
          if (!subscriber) return;
          const candidate = buildPipelineCandidate(
            subscriber,
            minOrder - orderOffset
          );
          const email = candidate.email.toLowerCase();
          if (existingIds.has(candidate.id) || existingEmails.has(email)) {
            return;
          }
          orderOffset += 1;
          existingIds.add(candidate.id);
          existingEmails.add(email);
          toAdd.push(candidate);
        });

        if (toAdd.length > 0) {
          const { error } = await supabase
            .from("candidates")
            .upsert(toAdd.map(buildCandidateRow), { onConflict: "id" });
          if (error) throw new Error(error.message);
        }

        setPipelineIds(new Set(existingIds));
        setPipelineEmails(new Set(existingEmails));
        setPipelineMessage(
          toAdd.length > 0
            ? `Added ${toAdd.length} candidate(s) to pipeline.`
            : "All selected candidates are already in pipeline."
        );
        await loadPipelineIndex();
      } catch (err) {
        setPipelineMessage(
          err instanceof Error ? err.message : "Failed to add candidates."
        );
      } finally {
        setBulkPipelineLoading(false);
        setSelectedIds(new Set());
      }
    })();
  };

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">MailerLite Leads</h1>
        <p className="text-sm text-muted-foreground">
          Select a group to load subscribers. Pagination uses MailerLite cursors.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 text-sm ${
            viewMode === "group"
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-input"
          }`}
          onClick={() => setViewMode("group")}
        >
          Group view
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 text-sm ${
            viewMode === "filtered"
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-input"
          }`}
          onClick={() => setViewMode("filtered")}
        >
          Filtered view
        </button>
        {viewMode === "filtered" ? (
          <span className="text-xs text-muted-foreground">
            Rules: Main Collection wins, Rejected never shows.
          </span>
        ) : null}
      </section>

      {viewMode === "group" ? (
      <>
      <section className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Group
          <select
            className="h-10 min-w-[260px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={selectedGroupId}
            onChange={(event) => setSelectedGroupId(event.target.value)}
            disabled={loadingGroups}
          >
            <option value="">Select a group...</option>
            {sortedGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name ?? group.id}
              </option>
            ))}
          </select>
        </label>

        <button
          className="h-10 rounded-md border border-input px-4 text-sm"
          onClick={() => loadGroups()}
          disabled={loadingGroups}
          type="button"
        >
          {loadingGroups ? "Refreshing..." : "Refresh groups"}
        </button>

        <label className="flex flex-1 flex-col gap-2 text-sm font-medium">
          Search
          <div className="relative flex flex-1 items-center gap-2">
            <div className="relative w-full">
              <input
                className="h-10 w-full min-w-[240px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                }}
                placeholder="Search by name or email..."
                autoComplete="off"
              />
              {filteredSuggestions.length > 0 ? (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card shadow-lg">
                  {filteredSuggestions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setSearchQuery(option);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {searchQuery ? (
              <button
                type="button"
                className="h-10 rounded-md border border-input px-3 text-sm"
                onClick={() => setSearchQuery("")}
              >
                Clear
              </button>
            ) : null}
          </div>
          {loadingAllSubscribers && searchQuery ? (
            <span className="text-xs text-muted-foreground">
              Loading full group for search…
            </span>
          ) : null}
        </label>
      </section>
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium">Bulk remove subscribers</div>
            <div className="text-xs text-muted-foreground">
              Runs in batches of 250 (use Preview first).
            </div>
          </div>

          <label className="flex flex-col gap-2 text-sm font-medium">
            Before date
            <input
              className="h-10 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              type="date"
              value={purgeBeforeDate}
              onChange={(event) => setPurgeBeforeDate(event.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={purgeInclusive}
              onChange={(event) => setPurgeInclusive(event.target.checked)}
            />
            Include selected date
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium">
            Action
            <select
              className="h-10 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={purgeAction}
              onChange={(event) =>
                setPurgeAction(
                  event.target.value === "delete_subscriber"
                    ? "delete_subscriber"
                    : "remove_from_group"
                )
              }
            >
              <option value="remove_from_group">Remove from selected group</option>
              <option value="delete_subscriber">Delete subscriber permanently</option>
            </select>
          </label>

          <button
            type="button"
            className="h-10 rounded-md border border-input px-4 text-sm"
            disabled={purgeLoading || !selectedGroupId || !purgeBeforeDate}
            onClick={() => runGroupPurge(true)}
          >
            {purgeLoading ? "Working..." : "Preview"}
          </button>

          <button
            type="button"
            className="h-10 rounded-md border border-rose-200 bg-rose-50 px-4 text-sm text-rose-700"
            disabled={purgeLoading || !selectedGroupId || !purgeBeforeDate}
            onClick={async () => {
              const actionLabel =
                purgeAction === "delete_subscriber"
                  ? "PERMANENTLY DELETE subscribers"
                  : "remove subscribers from this group";
              const scopeLabel =
                purgeInclusive ? "on or before" : "before";
              const groupLabel = selectedGroup?.name ?? selectedGroupId;
              const ok = window.confirm(
                `This will ${actionLabel} who subscribed ${scopeLabel} ${purgeBeforeDate} in “${groupLabel}”. Continue?`
              );
              if (!ok) return;
              await runGroupPurge(false);
            }}
          >
            {purgeLoading ? "Working..." : "Delete"}
          </button>
        </div>

        {purgeError ? (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {purgeError}
          </div>
        ) : null}

        {purgePreviewCount !== null ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Preview: {purgePreviewCount} subscribers match.
          </div>
        ) : null}

        {purgeDeletedCount !== null ? (
          <div className="mt-1 text-sm text-muted-foreground">
            Deleted: {purgeDeletedCount}.
          </div>
        ) : null}

        {purgeFailureCount !== null && purgeFailureCount > 0 ? (
          <div className="mt-1 text-sm text-muted-foreground">
            Failed: {purgeFailureCount} (run again to continue).
          </div>
        ) : null}

        {purgeNote ? (
          <div className="mt-1 text-sm text-muted-foreground">{purgeNote}</div>
        ) : null}
      </section>
      </>
      ) : (
        <section className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2 text-sm font-medium">
            Auto-filtered lists
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Main: {filteredCounts.main}</span>
              <span>Need improvement: {filteredCounts.needs_improvement}</span>
              <span>Rejected: {filteredCounts.rejected}</span>
              {filteredUpdatedAt ? (
                <span>Updated {new Date(filteredUpdatedAt).toLocaleString()}</span>
              ) : null}
            </div>
          </div>
          <button
            className="h-10 rounded-md border border-input px-4 text-sm"
            onClick={async () => {
              setFilteredRefreshing(true);
              await loadFilteredLeads(false, true);
              setFilteredRefreshing(false);
            }}
            disabled={filteredLoading || filteredRefreshing}
            type="button"
          >
            {filteredLoading || filteredRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="h-10 rounded-md border border-amber-200 bg-amber-50 px-4 text-sm text-amber-700"
            onClick={async () => {
              if (filteredPollRef.current) {
                window.clearTimeout(filteredPollRef.current);
                filteredPollRef.current = null;
              }
              setFilteredRefreshing(true);
              await loadFilteredLeads(false, true);
              const previous = filteredUpdatedAtRef.current;
              void loadFilteredLeads(true, true, true);
              const startedAt = Date.now();
              const poll = async () => {
                await loadFilteredLeads(false, true);
                if (
                  filteredUpdatedAtRef.current &&
                  filteredUpdatedAtRef.current !== previous
                ) {
                  setFilteredRefreshing(false);
                  return;
                }
                if (Date.now() - startedAt > 60000) {
                  setFilteredRefreshing(false);
                  return;
                }
                filteredPollRef.current = window.setTimeout(poll, 5000);
              };
              filteredPollRef.current = window.setTimeout(poll, 5000);
            }}
            disabled={filteredLoading || filteredRefreshing}
            type="button"
          >
            {filteredLoading || filteredRefreshing ? "Syncing..." : "Rebuild from MailerLite"}
          </button>
          <label className="flex flex-1 flex-col gap-2 text-sm font-medium">
            Search
            <div className="relative flex flex-1 items-center gap-2">
              <input
                className="h-10 w-full min-w-[240px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                type="text"
                value={filteredSearch}
                onChange={(event) => {
                  setFilteredSearch(event.target.value);
                  setFilteredPage(1);
                }}
                placeholder="Search by name or email..."
                autoComplete="off"
              />
              {filteredSearch ? (
                <button
                  type="button"
                  className="h-10 rounded-md border border-input px-3 text-sm"
                  onClick={() => {
                    setFilteredSearch("");
                    setFilteredPage(1);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </label>
        </section>
      )}

      {viewMode === "group" && error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {viewMode === "filtered" && filteredError ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {filteredError}
        </div>
      ) : null}

      {viewMode === "group" ? (
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-medium">Subscribers</div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              {loadingSubscribers
                ? "Loading..."
                : searchQuery.trim()
                ? `${visibleSubscribers.length} result(s)`
                : `${subscribers.length} loaded`}
            </span>
            {selectedGroup ? (
              <span>
                Total in group:{" "}
                {selectedGroup.active_count ??
                  selectedGroup.total ??
                  "—"}
              </span>
            ) : null}
            <span>{selectedIds.size} selected</span>
            <button
              type="button"
              className="rounded-md border border-input px-2 py-1 text-xs"
              disabled={selectedIds.size === 0 || bulkSendLoading}
              onClick={(event) => {
                event.stopPropagation();
                bulkSendToBreezy();
              }}
            >
              {bulkSendLoading ? "Sending..." : "Send selected"}
            </button>
            <button
              type="button"
              className="rounded-md border border-input px-2 py-1 text-xs"
              disabled={selectedIds.size === 0 || bulkPipelineLoading}
              onClick={(event) => {
                event.stopPropagation();
                bulkAddToPipeline();
              }}
            >
              {bulkPipelineLoading ? "Adding..." : "Add selected to Pipeline"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={
                      visibleSubscribers.length > 0 &&
                      visibleSubscribers.every((subscriber) =>
                        selectedIds.has(subscriber.id)
                      )
                    }
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="py-2 pr-4 pl-2">Subscriber</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Country</th>
                <th className="px-4 py-2">Send</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={7}>
                    {selectedGroupId
                      ? loadingSubscribers
                        ? "Loading subscribers..."
                        : "No subscribers found."
                      : "Select a group to load subscribers."}
                  </td>
                </tr>
              ) : (
                visibleSubscribers.map((subscriber) => {
                  const email = subscriber.email?.toLowerCase() ?? "";
                  const pipelineId = `ml-${subscriber.id}`;
                  const inPipeline =
                    pipelineIds.has(pipelineId) ||
                    (email ? pipelineEmails.has(email) : false);

                  return (
                  <tr
                    key={subscriber.id}
                    className={`cursor-pointer border-t border-border transition ${
                      inPipeline
                        ? "bg-emerald-50/60 hover:bg-emerald-50"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => loadSubscriberDetails(subscriber)}
                  >
                    <td className="px-4 py-2 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(subscriber.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          event.stopPropagation();
                          toggleSelect(subscriber.id);
                        }}
                        aria-label={`Select ${subscriber.email ?? "subscriber"}`}
                      />
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 -translate-x-2">
                          {getInitials(
                            getSubscriberName(subscriber).full ?? subscriber.email
                          )}
                        </span>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {getSubscriberName(subscriber).full ?? "Unknown"}
                        </span>
                      </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[13px] font-medium text-slate-700">
                        {subscriber.email ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2">{subscriber.status ?? "—"}</td>
                    <td className="px-4 py-2">
                      {subscriber.country ??
                        (isRecord(subscriber.fields)
                          ? (subscriber.fields.country as string | undefined) ?? "—"
                          : "—")}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        className="h-9 rounded-md border border-input px-3 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          sendToBreezy(subscriber);
                        }}
                        disabled={breezyActionLoading[subscriber.id]}
                      >
                        {breezyActionLoading[subscriber.id]
                          ? "Sending..."
                          : "Send to Zapier"}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        className={`h-9 rounded-md border px-3 text-xs ${
                          inPipeline
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-input"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!inPipeline) addToPipeline(subscriber);
                        }}
                        disabled={
                          inPipeline || pipelineActionLoading[subscriber.id]
                        }
                      >
                        {pipelineActionLoading[subscriber.id]
                          ? "Adding..."
                          : inPipeline
                          ? "In Pipeline"
                          : "Add to Pipeline"}
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-xs text-muted-foreground">
            Page size: {PAGE_LIMIT}
          </div>
          {pipelineMessage ? (
            <div className="text-xs text-muted-foreground">{pipelineMessage}</div>
          ) : pipelineIndexError ? (
            <div className="text-xs text-rose-600">{pipelineIndexError}</div>
          ) : breezyActionMessage ? (
            <div className="text-xs text-muted-foreground">
              {breezyActionMessage}
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              className="h-9 rounded-md border border-input px-3 text-xs"
              disabled={!prevCursor || loadingSubscribers || !!searchQuery.trim()}
              onClick={() => loadSubscribers(selectedGroupId, prevCursor)}
              type="button"
            >
              Previous
            </button>
            <button
              className="h-9 rounded-md border border-input px-3 text-xs"
              disabled={!nextCursor || loadingSubscribers || !!searchQuery.trim()}
              onClick={() => loadSubscribers(selectedGroupId, nextCursor)}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </section>
      ) : (
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-medium">Filtered subscribers</div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              {filteredLoading
                ? "Loading..."
                : `Showing ${visibleFilteredLeads.length} of ${filteredTotal}`}
            </span>
            {filteredRefreshing && !filteredLoading ? (
              <span>Refreshing in background…</span>
            ) : null}
            <span>Refresh uses cache. Rebuild hits MailerLite.</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 pl-4">Subscriber</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Country</th>
                <th className="px-4 py-2">Sent</th>
                <th className="px-4 py-2">Opens</th>
                <th className="px-4 py-2">Clicks</th>
                <th className="px-4 py-2">Groups</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleFilteredLeads.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={8}>
                    {filteredLoading ? "Loading filtered leads..." : "No matches found."}
                  </td>
                </tr>
              ) : (
                visibleFilteredLeads.map((lead) => {
                  const subscriber = lead.subscriber;
                  const email = subscriber.email?.toLowerCase() ?? "";
                  const pipelineId = `ml-${subscriber.id}`;
                  const inPipeline =
                    pipelineIds.has(pipelineId) ||
                    (email ? pipelineEmails.has(email) : false);
                  const categoryLabel =
                    lead.category === "main" ? "Main collection" : "Need improvement";

                  return (
                    <tr
                      key={subscriber.id}
                      className={`border-t border-border transition ${
                        inPipeline
                          ? "bg-emerald-50/60 hover:bg-emerald-50"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => loadSubscriberDetails(subscriber)}
                    >
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 -translate-x-1">
                            {getInitials(
                              getSubscriberName(subscriber).full ?? subscriber.email
                            )}
                          </span>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {getSubscriberName(subscriber).full ?? "Unknown"}
                            </span>
                            <span className="text-[13px] font-medium text-slate-700">
                              {subscriber.email ?? "—"}
                            </span>
                          </div>
                        </div>
                      </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        lead.category === "main"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {categoryLabel}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {subscriber.country ??
                      (isRecord(subscriber.fields)
                        ? (subscriber.fields.country as string | undefined) ?? "—"
                        : "—")}
                  </td>
                  <td className="px-4 py-2">
                    {typeof subscriber.sent === "number" ? subscriber.sent : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {typeof subscriber.opens_count === "number"
                      ? subscriber.opens_count
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {typeof subscriber.clicks_count === "number"
                      ? subscriber.clicks_count
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      {lead.groups.map((group) => (
                            <span
                              key={`${subscriber.id}-${group}`}
                              className="rounded-full border border-border bg-muted px-2 py-1 text-xs"
                            >
                              {group}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          className={`h-9 rounded-md border px-3 text-xs ${
                            inPipeline
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-input"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!inPipeline) addToPipeline(subscriber);
                          }}
                          disabled={inPipeline || pipelineActionLoading[subscriber.id]}
                        >
                          {pipelineActionLoading[subscriber.id]
                            ? "Adding..."
                            : inPipeline
                            ? "In Pipeline"
                            : "Add to Pipeline"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <div className="text-xs text-muted-foreground">
            Page {filteredPage} of {Math.max(1, Math.ceil(filteredTotal / filteredPageSize))}
          </div>
          <div className="flex gap-2">
            <button
              className="h-9 rounded-md border border-input px-3 text-xs"
              disabled={filteredPage <= 1 || filteredLoading}
              onClick={() => setFilteredPage((prev) => Math.max(1, prev - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="h-9 rounded-md border border-input px-3 text-xs"
              disabled={
                filteredLoading ||
                filteredPage * filteredPageSize >= filteredTotal
              }
              onClick={() =>
                setFilteredPage((prev) => prev + 1)
              }
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </section>
      )}

      {selectedSubscriber ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Subscriber details</h2>
                <div className="space-y-1">
                  {getSubscriberName(selectedSubscriber).full ? (
                    <div className="text-sm font-medium text-foreground">
                      {getSubscriberName(selectedSubscriber).full}
                    </div>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {selectedSubscriber.email ??
                      selectedSubscriber.name ??
                      "Subscriber"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-md border border-input px-3 py-1.5 text-xs"
                onClick={() => setSelectedSubscriber(null)}
              >
                Close
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-4 text-sm">
              {loadingDetails ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-4 w-full rounded-md" />
                  ))}
                  <Skeleton className="h-24 w-full rounded-md" />
                </div>
              ) : detailsError ? (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                  {detailsError}
                </div>
              ) : subscriberDetails ? (
                (() => {
                  const details = subscriberDetails;
                  const fields = isRecord(details.fields) ? details.fields : null;
                  const groups = Array.isArray(details.groups) ? details.groups : null;
                  const entries = Object.entries(details).filter(
                    ([key]) => key !== "fields" && key !== "groups"
                  );

                  return (
                    <div className="space-y-6">
                      <div className="space-y-3">
                        {entries.map(([key, value]) => (
                          <div
                            key={key}
                            className="grid grid-cols-[220px_1fr] gap-4 border-b border-border/60 py-2"
                          >
                            <div className="text-xs uppercase text-muted-foreground">
                              {formatKey(key)}
                            </div>
                            <div className="break-words text-sm text-foreground">
                              {formatValue(value)}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3">
                        <div className="text-xs uppercase text-muted-foreground">
                          Groups
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {groups && groups.length > 0 ? (
                            groups.map((group, index) => (
                              <span
                                key={`${(group as { id?: string }).id ?? index}`}
                                className="rounded-full border border-border bg-muted px-3 py-1 text-xs"
                              >
                                {formatValue(group)}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="text-xs uppercase text-muted-foreground">
                          Fields
                        </div>
                        {fields ? (
                          <div className="space-y-2">
                            {Object.entries(fields).map(([key, value]) => (
                              <div
                                key={key}
                                className="grid grid-cols-[220px_1fr] gap-4 border-b border-border/60 py-2"
                              >
                                <div className="text-xs uppercase text-muted-foreground">
                                  {formatKey(key)}
                                </div>
                                <div className="break-words text-sm text-foreground">
                                  {formatValue(value)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">—</div>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-muted-foreground">
                  No details available.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
