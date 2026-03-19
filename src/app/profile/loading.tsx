import Skeleton from "@/components/Skeleton";

export default function ProfileLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-8 py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-40" />
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center px-6 py-10">
        <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-full" />
            ))}
          </div>
          <div className="mt-6">
            <Skeleton className="h-10 w-full rounded-full" />
          </div>
          <div className="mt-6 flex justify-end">
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
