"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type TaskNotificationRow = {
  id: string;
  kind: string;
  recipient_user_id: string;
  candidate_id: string;
  task_id: string;
  task_title: string;
  candidate_name?: string | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  created_at: string | null;
  read_at?: string | null;
};

const OPEN_PROFILE_EVENT = "pipeline-open-profile";

const getCandidateShareKey = (candidateId: string) => {
  const cleaned = candidateId.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (!cleaned) return "00000000";

  let hash = 0;
  for (const char of cleaned) {
    const digit = Number.parseInt(char, 16);
    if (Number.isNaN(digit)) continue;
    hash = (hash * 16 + digit) % 100000000;
  }

  return hash.toString().padStart(8, "0");
};

const toSlugPart = (value?: string) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getCandidateLastNameSlug = (name?: string | null) => {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const lastName =
    parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "candidate";
  return toSlugPart(lastName) || "candidate";
};

const getCandidateShareSlug = (candidateId: string, candidateName?: string | null) =>
  `${getCandidateShareKey(candidateId)}-${getCandidateLastNameSlug(candidateName)}`;

const formatWhen = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function TaskNotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<TaskNotificationRow[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncStateRef = useRef({
    userId: null as string | null,
    done: false,
    running: false,
  });

  useEffect(() => {
    let ignore = false;
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data?.user || ignore) return;
        setUserId(data.user.id);
      } catch {
        // ignore
      }
    };
    loadUser();
    return () => {
      ignore = true;
    };
  }, [supabase]);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("task_notifications")
        .select(
          "id,kind,recipient_user_id,candidate_id,task_id,task_title,candidate_name,actor_user_id,actor_name,actor_email,created_at,read_at"
        )
        .eq("recipient_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) {
        setLoadError(error.message);
        return;
      }
      const next = (data ?? []) as TaskNotificationRow[];
      setItems(next);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) return;
    if (syncStateRef.current.userId !== userId) {
      syncStateRef.current = { userId, done: false, running: false };
    }
    if (syncStateRef.current.done) {
      void loadNotifications();
      return;
    }
    if (syncStateRef.current.running) return;
    syncStateRef.current.running = true;
    let ignore = false;
    const run = async () => {
      try {
        setSyncError(null);
        const response = await fetch("/api/tasks/sync-assigned-notifications", {
          method: "POST",
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          setSyncError(data?.error ?? "Failed to sync task notifications.");
        }
      } catch {
        setSyncError("Failed to sync task notifications.");
      } finally {
        if (ignore) return;
        syncStateRef.current.done = true;
        syncStateRef.current.running = false;
        void loadNotifications();
      }
    };
    void run();
    return () => {
      ignore = true;
    };
  }, [userId, loadNotifications]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`task-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as TaskNotificationRow;
          if (!row?.id) return;
          setItems((prev) => {
            if (prev.some((item) => item.id === row.id)) return prev;
            return [row, ...prev].slice(0, 50);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "task_notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as TaskNotificationRow;
          if (!row?.id) return;
          setItems((prev) => {
            const index = prev.findIndex((item) => item.id === row.id);
            if (index === -1) return prev;
            const next = [...prev];
            next[index] = { ...next[index], ...row };
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  const unreadCount = items.filter((item) => !item.read_at).length;

  const markRead = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read_at: now } : item))
      );
      await supabase
        .from("task_notifications")
        .update({ read_at: now })
        .eq("id", id);
    },
    [supabase]
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    await supabase
      .from("task_notifications")
      .update({ read_at: now })
      .eq("recipient_user_id", userId)
      .is("read_at", null);
  }, [supabase, userId]);

  if (!userId) return null;

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
        onClick={() => {
          if (!open) {
            void loadNotifications();
          }
          setOpen((prev) => !prev);
        }}
        aria-label="Task notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.5)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Notifications
              </div>
              <div className="text-[11px] text-slate-500">
                Task creations, assignments, and completions
              </div>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              Mark all read
            </button>
          </div>

	          {loading ? (
	            <div className="px-4 py-4 text-xs text-slate-500">Loading…</div>
	          ) : syncError ? (
	            <div className="px-4 py-4 text-xs text-rose-600">{syncError}</div>
	          ) : loadError ? (
	            <div className="px-4 py-4 text-xs text-rose-600">
	              {loadError}
	            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-slate-400">
              No notifications yet.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {items.map((item) => {
                const when = formatWhen(item.created_at);
                const actor =
                  item.actor_name?.trim() ||
                  item.actor_email?.trim() ||
                  (item.actor_user_id ? item.actor_user_id.slice(0, 8) : "Someone");
                const candidate =
                  item.candidate_name?.trim() ||
                  item.candidate_id ||
                  "Candidate";
                const shareSlug = getCandidateShareSlug(
                  item.candidate_id,
                  item.candidate_name ?? null
                );
                const href = `/pipeline?profile=${shareSlug}&tab=tasks`;
                const unread = !item.read_at;
                const kind = (item.kind ?? "completed").toLowerCase();
                const subtitle =
                  kind === "created"
                    ? `Created by ${actor} • ${candidate}`
                    : kind === "assigned"
                      ? `Assigned by ${actor} • ${candidate}`
                      : `Completed by ${actor} • ${candidate}`;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 ${
                      unread ? "bg-emerald-50/40" : ""
                    }`}
                    onClick={async () => {
                      if (unread) {
                        await markRead(item.id);
                      }
                      setOpen(false);
                      if (
                        typeof window !== "undefined" &&
                        (pathname === "/pipeline" || pathname.startsWith("/pipeline/"))
                      ) {
                        window.dispatchEvent(
                          new CustomEvent(OPEN_PROFILE_EVENT, {
                            detail: { shareSlug, rightTab: "tasks" },
                          })
                        );
                      } else {
                        router.push(href);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-900">
                          {item.task_title}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-600">
                          {subtitle}
                        </div>
                      </div>
                      {when ? (
                        <div className="shrink-0 text-[11px] text-slate-400">
                          {when}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
