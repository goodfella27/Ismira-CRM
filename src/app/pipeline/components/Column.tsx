import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { MoreHorizontal, Plus } from "lucide-react";
import { Candidate, Stage } from "../types";
import CandidateCard from "./CandidateCard";

const columnStyles =
  "relative flex h-full w-[339px] shrink-0 flex-col rounded-md border border-border bg-muted/60";

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
      <div className="flex items-center justify-between rounded-t-xl border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
            {stage.name}
          </div>
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-foreground">
            {candidates.length}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <button type="button" className="rounded-md p-1 hover:bg-card">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-md p-1 hover:bg-card">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={
          "flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" +
          (isOver ? " bg-muted/70" : "")
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
          <div className="rounded-lg border border-dashed border-border bg-card/60 px-3 py-6 text-center text-xs text-muted-foreground">
            Drop candidates here
          </div>
        ) : null}
      </div>
    </div>
  );
}
