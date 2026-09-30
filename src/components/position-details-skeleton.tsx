export function PositionDetailsSkeleton() {
  return (
    <div role="status" aria-label="Loading job description">
      <span className="sr-only">Loading job description…</span>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="rounded-panel border border-border p-5">
          <div className="mb-4 h-3 w-36 rounded bg-muted" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-14 rounded-md bg-muted" />
            ))}
          </div>
          <div className="mb-4 mt-6 h-3 w-48 rounded bg-muted" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="h-8 w-28 rounded-full bg-muted" />
            ))}
          </div>
        </div>
        {[0, 1].map(section => (
          <div key={section} className="space-y-4 rounded-panel border border-border p-5">
            <div className="mb-6 h-4 w-40 rounded bg-muted" />
            {["w-full", "w-11/12", "w-full", "w-4/5", "w-2/3"].map((width, index) => (
              <div key={index} className={`h-4 rounded bg-muted ${width}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
