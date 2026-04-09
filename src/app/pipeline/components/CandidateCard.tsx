import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import {
  MoreHorizontal,
  MessageCircle,
  Paperclip,
  Clock,
  Trash2,
  CalendarDays,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Candidate } from "../types";
import { getCountryDisplay } from "@/lib/country";
import { useLocalDayKey } from "@/lib/use-day-key";
import { formatDateShort, formatEmailShort, formatRelative } from "../utils";

const initials = (name?: string) => {
  const safeName = name?.trim() || "";
  const parts = safeName.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};


const avatarColors = [
  "bg-emerald-50 text-emerald-600",
  "bg-blue-50 text-blue-600",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-600",
  "bg-violet-50 text-violet-600",
  "bg-teal-50 text-teal-600",
  "bg-sky-50 text-sky-600",
  "bg-cyan-50 text-cyan-600",
  "bg-lime-50 text-lime-600",
  "bg-green-50 text-green-600",
  "bg-yellow-50 text-yellow-600",
  "bg-orange-50 text-orange-600",
  "bg-red-50 text-red-600",
  "bg-pink-50 text-pink-600",
  "bg-fuchsia-50 text-fuchsia-600",
  "bg-purple-50 text-purple-600",
  "bg-indigo-50 text-indigo-600",
  "bg-emerald-100 text-emerald-700",
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-cyan-100 text-cyan-700",
  "bg-lime-100 text-lime-700",
  "bg-green-100 text-green-700",
  "bg-yellow-100 text-yellow-700",
  "bg-orange-100 text-orange-700",
  "bg-red-100 text-red-700",
  "bg-pink-100 text-pink-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-purple-100 text-purple-700",
  "bg-indigo-100 text-indigo-700",
];

export function getAvatarClass(name?: string) {
  const safeName = name?.trim();
  if (!safeName) return avatarColors[0];
  const index = safeName.charCodeAt(0) % avatarColors.length;
  return avatarColors[index];
}

type CandidateCardProps = {
  candidate: Candidate;
  noteCount: number;
  attachmentCount: number;
  onOpen: (candidate: Candidate) => void;
  onDelete: (candidate: Candidate) => void;
};

export default function CandidateCard({
  candidate,
  noteCount,
  attachmentCount,
  onOpen,
  onDelete,
}: CandidateCardProps) {
  // Flip to false to revert to the previous flat card styling.
  const USE_STACKED_CARDS = true;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [menuOpen]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: candidate.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const country = getCountryDisplay(candidate.country);
  const rawSubtitle =
    (candidate.pipeline_id === "companies"
      ? candidate.website_url
      : candidate.email)?.trim() ?? "";
  const email = formatEmailShort(rawSubtitle);
  const countryLine =
    country.label !== "—"
      ? `${country.flag ? `${country.flag} ` : ""}${country.label}`
      : candidate.source ?? "Pipeline";

  const avatarClass = getAvatarClass(candidate.name);
  const avatarBg = avatarClass.split(" ")[0] ?? "bg-emerald-100";
  const localDayKey = useLocalDayKey();
  const startDatePart = (candidate.start_date ?? "").trim().split("T")[0] ?? "";
  const hasDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(startDatePart);
  const isStarted = hasDateOnly ? startDatePart < localDayKey : false;
  const startDateLabel =
    candidate.pipeline_id !== "companies" ? formatDateShort(candidate.start_date) : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(candidate)}
      className={
        (USE_STACKED_CARDS
          ? `cursor-pointer rounded-[28px] p-2 shadow-[0_16px_34px_-20px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-22px_rgba(15,23,42,0.55)] ${avatarBg}`
          : "cursor-pointer rounded-lg border border-border bg-white px-3 py-3 shadow-sm transition hover:shadow-md") +
        (isDragging ? " opacity-60" : "")
      }
    >
      <div
        className={
          USE_STACKED_CARDS
            ? "rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm"
            : ""
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-semibold shadow-sm ${avatarClass}`}
            >
              {initials(candidate.name)}
            </div>
            <div>
              <div className="max-w-[160px] truncate text-sm font-semibold text-slate-900">
                {candidate.name}
              </div>
              <div
                className="max-w-[160px] truncate text-xs text-slate-500"
                title={rawSubtitle || undefined}
              >
                {email || countryLine}
              </div>
              {email ? (
                <div className="text-xs text-slate-400">
                  {countryLine}
                </div>
              ) : null}
            </div>
          </div>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              aria-label="Candidate actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(false);
                    onDelete(candidate);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete profile
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {noteCount}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1">
            <Paperclip className="h-3.5 w-3.5" />
            {attachmentCount}
          </span>
          {candidate.meeting_start || candidate.meeting_link ? (
            <span
              className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700"
              title={
                candidate.meeting_start
                  ? `Meeting starts: ${new Date(
                      candidate.meeting_start
                    ).toLocaleString()}`
                  : "Meeting scheduled"
              }
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
      </div>
      {USE_STACKED_CARDS ? (
        <div className="flex flex-wrap items-center justify-center gap-1 px-2 pb-1 pt-2 text-center text-[10px] font-semibold uppercase text-slate-600/70">
          {startDateLabel ? (
            <>
              <CalendarDays className="h-3 w-3" />
              {isStarted ? "Started" : "Start"} {startDateLabel}
              <span className="px-0.5">•</span>
            </>
          ) : null}
          <Clock className="h-3 w-3" />
          Created {formatRelative(candidate.created_at)}
        </div>
      ) : null}
    </div>
  );
}
