/**
 * Root loading state. Unlike the `(app)/loading.tsx` skeleton, this one wraps
 * the nested signed-in layout, so it covers the session lookup on first load —
 * the one query the app-level skeleton cannot see.
 */
export default function Loading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-7xl px-4 py-6">
      <div className="h-8 w-56 max-w-full animate-pulse rounded bg-slate-200" />
      <div className="mt-6 h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
      <p role="status" className="sr-only">
        Loading…
      </p>
    </div>
  );
}
