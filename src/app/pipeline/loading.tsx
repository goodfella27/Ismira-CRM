import Skeleton from "@/components/Skeleton";

export default function PipelineLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-none items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="h-9 w-36 rounded-full" />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-none flex-1 min-h-0 flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-32 rounded-md" />
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="flex gap-4 overflow-x-hidden pb-6">
            {Array.from({ length: 5 }).map((_, columnIndex) => (
              <div
                key={columnIndex}
                className="flex h-full w-[280px] flex-col rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-8 rounded-full" />
                </div>
                <div className="flex flex-1 flex-col gap-3 px-3 py-3">
                  {Array.from({ length: 4 }).map((_, rowIndex) => (
                    <Skeleton key={rowIndex} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
