import Skeleton from "@/components/Skeleton";

export default function CompanyLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl gap-6 px-6 py-8">
      <div className="w-64 shrink-0 space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex-1 space-y-6">
        <Skeleton className="h-10 w-64 rounded-md" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
