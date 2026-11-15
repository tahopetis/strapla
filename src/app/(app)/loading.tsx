/**
 * Instant loading state for the signed-in app. The layout resolves the session
 * before this boundary renders, so the skeleton covers page data (which can be
 * slow) rather than the session lookup.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-64 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200/70" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-6 w-28 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
      </div>

      <p role="status" className="sr-only">
        Loading…
      </p>
    </div>
  );
}
