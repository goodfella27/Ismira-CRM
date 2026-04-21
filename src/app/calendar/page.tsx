"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Copy, ExternalLink, Search } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAppDialogs } from "@/components/app-dialogs";

type MeetingRow = {
  id: string;
  data: Record<string, unknown> | null;
  updated_at?: string | null;
};

type MeetingItem = {
  candidateId: string;
  candidateName: string;
  meetingLink: string;
  meetingStart?: string;
  meetingTimezone?: string;
  meetingTitle?: string;
  meetingInterviewers?: string;
  meetingProvider?: string;
  meetingEventId?: string;
  candidateData: Record<string, unknown>;
  updatedAt?: string | null;
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDayKey = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDayKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const monthLabel = (date: Date) =>
  date.toLocaleString("en-US", { month: "long", year: "numeric" });

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const dialogs = useAppDialogs();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingItem | null>(
    null
  );
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    let ignore = false;
    const loadMeetings = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("candidates")
          .select("id,data,updated_at");
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as MeetingRow[];
        const meetings = rows
          .map((row) => {
            const data = (row.data ?? {}) as Record<string, unknown>;
            const meetingLink = data.meeting_link as string | undefined;
            if (!meetingLink) return null;
            return {
              candidateId: row.id,
              candidateName: (data.name as string) ?? row.id,
              meetingLink,
              meetingStart: data.meeting_start as string | undefined,
              meetingTimezone: data.meeting_timezone as string | undefined,
              meetingTitle: data.meeting_title as string | undefined,
              meetingInterviewers: data.meeting_interviewers as string | undefined,
              meetingProvider: data.meeting_provider as string | undefined,
              meetingEventId: data.meeting_event_id as string | undefined,
              candidateData: data,
              updatedAt: row.updated_at ?? null,
            } as MeetingItem;
          })
          .filter((item): item is MeetingItem => item !== null);

        meetings.sort((a, b) => {
          const aTime = a.meetingStart ? new Date(a.meetingStart).getTime() : 0;
          const bTime = b.meetingStart ? new Date(b.meetingStart).getTime() : 0;
          return aTime - bTime;
        });

        if (!ignore) {
          setItems(meetings);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load meetings.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    loadMeetings();
    return () => {
      ignore = true;
    };
  }, [supabase]);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingItem[]>();
    items.forEach((item) => {
      const key = formatDayKey(item.meetingStart);
      if (!key) return;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [items]);

  const analytics = useMemo(() => {
    const now = new Date();
    const todayKey = formatDayKey(now.toISOString());
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const weekEnd = new Date(startOfToday);
    weekEnd.setDate(startOfToday.getDate() + 7);
    let weekCount = 0;
    meetingsByDay.forEach((dayMeetings, key) => {
      const date = parseDayKey(key);
      if (!date) return;
      if (date >= startOfToday && date <= weekEnd) {
        weekCount += dayMeetings.length;
      }
    });
    const todayCount = todayKey ? (meetingsByDay.get(todayKey) ?? []).length : 0;
    return {
      total: items.length,
      weekCount,
      todayCount,
    };
  }, [items, meetingsByDay]);

  const upcoming = items.filter((item) => {
    if (!item.meetingStart) return false;
    return new Date(item.meetingStart) >= new Date();
  });

  const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const daysInMonth = new Date(
    viewDate.getFullYear(),
    viewDate.getMonth() + 1,
    0
  ).getDate();
  const startOffset = (startOfMonth.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const calendarDays = Array.from({ length: totalCells }).map((_, index) => {
    const dayNumber = index - startOffset + 1;
    const date = new Date(
      viewDate.getFullYear(),
      viewDate.getMonth(),
      dayNumber
    );
    const isCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
    const key = formatDayKey(date.toISOString());
    return {
      key: key ?? `${viewDate.getFullYear()}-${viewDate.getMonth()}-${index}`,
      date,
      dayNumber: date.getDate(),
      isCurrentMonth,
      meetings: key ? meetingsByDay.get(key) ?? [] : [],
    };
  });

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Task calendar</h1>
          <p className="text-sm text-slate-500">
            Track interviews and upcoming meetings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-56 rounded-full border border-slate-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-emerald-300"
              placeholder="Task search"
            />
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            By topic name
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2.2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 text-sm font-semibold text-slate-700">
              Employee performance analytics
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Availability score</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {Math.min(100, Math.round((analytics.total || 1) * 12))}%
                </div>
                <div className="mt-1 text-xs text-emerald-600">+4.8%</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Meetings this week</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {analytics.weekCount}
                </div>
                <div className="mt-1 text-xs text-slate-500">Next 7 days</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Today</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {analytics.todayCount}
                </div>
                <div className="mt-1 text-xs text-slate-500">Interviews</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-700">
                {monthLabel(viewDate)}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1.5"
                  onClick={() =>
                    setViewDate(
                      new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1)
                    )
                  }
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1.5"
                  onClick={() =>
                    setViewDate(
                      new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-7 text-xs text-slate-400">
              {dayNames.map((day) => (
                <div key={day} className="px-2 py-2 text-center">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day) => (
                <div
                  key={day.key}
                  className={`min-h-[96px] rounded-xl border border-slate-200 p-2 text-xs ${
                    day.isCurrentMonth
                      ? "bg-white"
                      : "bg-slate-50 text-slate-400"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">
                      {day.dayNumber}
                    </span>
                    {day.meetings.length > 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        {day.meetings.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 space-y-1">
                    {day.meetings.slice(0, 2).map((meeting) => (
                      <button
                        key={`${day.key}-${meeting.candidateId}`}
                        type="button"
                        onClick={() => setSelectedMeeting(meeting)}
                        className="w-full truncate rounded-md bg-emerald-50 px-2 py-1 text-left text-[10px] text-emerald-700 hover:bg-emerald-100"
                        title={meeting.meetingTitle}
                      >
                        {meeting.meetingTitle || "Interview"}
                      </button>
                    ))}
                    {day.meetings.length > 2 ? (
                      <div className="text-[10px] text-slate-400">
                        +{day.meetings.length - 2} more
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">At work</div>
            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-xs text-slate-500">Loading meetings...</div>
              ) : error ? (
                <div className="text-xs text-rose-600">{error}</div>
              ) : upcoming.length === 0 ? (
                <div className="text-xs text-slate-400">No upcoming meetings.</div>
              ) : (
                upcoming.slice(0, 4).map((item) => (
                  <div
                    key={item.candidateId}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-700">
                        {item.meetingTitle || "Interview"}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.candidateName}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {formatTimestamp(item.meetingStart)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">
              Interview details
            </div>
            <div className="mt-3 space-y-3 text-xs text-slate-500">
              <div>
                Keep track of interviews across teams, departments, and onboarding
                stages in one view.
              </div>
              <ul className="list-disc pl-4">
                <li>See upcoming conversations at a glance.</li>
                <li>Open a meeting link directly from the calendar.</li>
                <li>Coordinate interviewers and candidates.</li>
              </ul>
              {items[0]?.meetingLink ? (
                <a
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  href={items[0].meetingLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Join next meeting
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {selectedMeeting ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedMeeting(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {selectedMeeting.meetingTitle || "Interview"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Candidate: {selectedMeeting.candidateName}
                </div>
                {selectedMeeting.meetingInterviewers ? (
                  <div className="text-xs text-slate-500">
                    With: {selectedMeeting.meetingInterviewers}
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-slate-500">
                  {selectedMeeting.meetingStart
                    ? `Starts ${formatTimestamp(selectedMeeting.meetingStart)}`
                    : "Time not set"}
                  {selectedMeeting.meetingTimezone
                    ? ` • ${selectedMeeting.meetingTimezone}`
                    : ""}
                </div>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:bg-slate-50"
                onClick={() => setSelectedMeeting(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <a
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                href={selectedMeeting.meetingLink}
                target="_blank"
                rel="noreferrer"
              >
                Join meeting
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  navigator.clipboard.writeText(
                    selectedMeeting.meetingLink ?? ""
                  );
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  Copy link
                  <Copy className="h-3.5 w-3.5" />
                </span>
              </button>
              <button
                type="button"
                className="rounded-md border border-rose-200 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50"
                disabled={canceling}
                onClick={async () => {
                  if (!selectedMeeting?.meetingLink) return;
                  const confirmed = await dialogs.confirm({
                    title: "Cancel meeting?",
                    message: "This will cancel the scheduled meeting.",
                    confirmText: "Cancel meeting",
                    cancelText: "Keep",
                    tone: "danger",
                  });
                  if (!confirmed) return;
                  setCanceling(true);
                  try {
                    if (selectedMeeting.meetingEventId) {
                      await fetch("/api/google/meet/cancel", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          eventId: selectedMeeting.meetingEventId,
                        }),
                      });
                    }
                            const updatedData = {
                              ...selectedMeeting.candidateData,
                              meeting_link: null,
                              meeting_provider: null,
                              meeting_event_id: null,
                              meeting_start: null,
                              meeting_end: null,
                              meeting_timezone: null,
                              meeting_title: null,
                              meeting_interviewers: null,
                              meeting_conference_record: null,
                              meeting_recording_url: null,
                              meeting_recording_file: null,
                              meeting_recording_state: null,
                              meeting_transcript_url: null,
                              meeting_transcript_doc: null,
                              meeting_transcript_state: null,
                              meeting_transcript_excerpt: null,
                              meeting_transcript_summary: null,
                              meeting_artifacts_checked_at: null,
                            };
                    await supabase
                      .from("candidates")
                      .update({ data: updatedData })
                      .eq("id", selectedMeeting.candidateId);
                    setItems((prev) =>
                      prev.filter((item) => item.candidateId !== selectedMeeting.candidateId)
                    );
                    setSelectedMeeting(null);
                  } finally {
                    setCanceling(false);
                  }
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {canceling ? "Canceling..." : "Cancel meeting"}
                  <Ban className="h-3.5 w-3.5" />
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
