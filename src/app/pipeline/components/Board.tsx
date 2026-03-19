import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Candidate, Stage } from "../types";
import { getAvatarClass } from "./CandidateCard";
import { formatEmailShort } from "../utils";
import Column from "./Column";

const previewInitials = (name: string) => {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

type BoardProps = {
  stages: Stage[];
  candidates: Candidate[];
  noteCounts: Record<string, number>;
  attachmentCounts: Record<string, number>;
  onDragEnd: (activeId: string, overId: string | null) => void;
  onOpenCandidate: (candidate: Candidate) => void;
  onDeleteCandidate: (candidate: Candidate) => void;
};

export default function Board({
  stages,
  candidates,
  noteCounts,
  attachmentCounts,
  onDragEnd,
  onOpenCandidate,
  onDeleteCandidate,
}: BoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeCandidate = candidates.find((candidate) => candidate.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setActiveId(event.active.id as string)}
      onDragEnd={(event) => {
        setActiveId(null);
        onDragEnd(event.active.id as string, event.over?.id as string | null);
      }}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-6 hide-scrollbar">
        {stages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            candidates={candidates
              .filter((c) => c.stage_id === stage.id)
              .sort((a, b) => a.order - b.order)}
            noteCounts={noteCounts}
            attachmentCounts={attachmentCounts}
            onOpenCandidate={onOpenCandidate}
            onDeleteCandidate={onDeleteCandidate}
          />
        ))}
      </div>
      <DragOverlay>
        {activeCandidate ? (
          <div className="w-[260px] rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${getAvatarClass(
                  activeCandidate.name
                )}`}
              >
                {previewInitials(activeCandidate.name)}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {activeCandidate.name}
                </div>
                <div
                  className="text-xs text-slate-500"
                  title={activeCandidate.email || undefined}
                >
                  {formatEmailShort(activeCandidate.email)}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
