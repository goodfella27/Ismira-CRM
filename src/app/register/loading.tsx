import Skeleton from "@/components/Skeleton";

export default function RegisterLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-panel border border-border bg-card p-6 shadow-sm">
        <Skeleton className="h-6 w-36" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
