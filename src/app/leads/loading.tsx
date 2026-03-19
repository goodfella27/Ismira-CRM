import Skeleton from "@/components/Skeleton";

export default function LeadsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-80" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-8 w-32 rounded-md" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Skeleton className="h-10 w-60 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
        <Skeleton className="h-10 w-full max-w-2xl rounded-md" />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="px-4 py-3">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
