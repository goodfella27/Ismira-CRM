export function PositionsPageSkeleton() {
  return (
    <div role="status" aria-label="Loading positions" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <span className="sr-only">Loading positions and filters…</span>
      <div aria-hidden="true" className="space-y-7 motion-safe:animate-pulse">
        <div className="space-y-3"><div className="h-3 w-20 rounded bg-slate-100" /><div className="h-14 rounded-2xl bg-slate-100" /></div>
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-20 rounded-2xl bg-slate-100" />)}</div>
        </div>
        <div className="flex gap-3">{[0, 1, 2].map(i => <div key={i} className="h-11 w-44 rounded-full bg-slate-100" />)}</div>
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="h-12 bg-slate-50" />
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="flex items-center gap-6 border-t border-slate-100 p-5"><div className="h-12 w-12 shrink-0 rounded-full bg-slate-100" /><div className="h-5 w-2/3 rounded bg-slate-100" /><div className="ml-auto hidden h-6 w-24 rounded bg-slate-100 sm:block" /></div>)}
        </div>
      </div>
    </div>
  );
}
