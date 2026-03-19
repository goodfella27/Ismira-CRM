import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { MoreHorizontal, Plus } from "lucide-react";
import { Candidate, Stage } from "../types";
import CandidateCard from "./CandidateCard";

const columnStyles =
  "relative flex h-full w-[339px] shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50/60";

type ColumnProps = {
  stage: Stage;
  candidates: Candidate[];
  noteCounts: Record<string, number>;
  attachmentCounts: Record<string, number>;
  onOpenCandidate: (candidate: Candidate) => void;
  onDeleteCandidate: (candidate: Candidate) => void;
};

export default function Column({
  stage,
  candidates,
  noteCounts,
  attachmentCounts,
  onOpenCandidate,
  onDeleteCandidate,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${stage.id}` });

  return (
    <div className={columnStyles}>
      <div className="flex items-center justify-between rounded-t-xl border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            {stage.name}
          </div>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {candidates.length}
          </span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <button type="button" className="rounded-md p-1 hover:bg-white">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-md p-1 hover:bg-white">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={
          "flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" +
          (isOver ? " bg-slate-100/70" : "")
        }
      >
        <SortableContext
          items={candidates.map((candidate) => candidate.id)}
          strategy={verticalListSortingStrategy}
        >
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              noteCount={noteCounts[candidate.id] ?? 0}
              attachmentCount={attachmentCounts[candidate.id] ?? 0}
              onOpen={onOpenCandidate}
              onDelete={onDeleteCandidate}
            />
          ))}
        </SortableContext>
        {candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-6 text-center text-xs text-slate-400">
            Drop candidates here
          </div>
        ) : null}
      </div>
    </div>
  );
}
