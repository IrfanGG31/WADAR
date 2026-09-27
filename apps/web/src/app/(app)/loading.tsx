/**
 * Shown the instant a menu item is tapped, while the next page's data loads
 * on the server. Without a loading boundary the old page just freezes until
 * the new one is fully rendered, which feels like the app hung. It also lets
 * Next.js prefetch this shell for every link in the nav.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <span className="sr-only">Memuat…</span>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-20 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
