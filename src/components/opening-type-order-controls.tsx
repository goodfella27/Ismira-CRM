"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

export function OpeningTypeOrderControls({ label, index, count, disabled, onMove }: {
  label: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 sm:col-span-4">
      <span className="text-xs font-medium text-slate-500">Display order: {index + 1}</span>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label={`Move ${label} up`}
          title="Move up"
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={`Move ${label} down`}
          title="Move down"
          disabled={disabled || index === count - 1}
          onClick={() => onMove(1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
