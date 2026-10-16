import { cn } from "@/lib/utils";

type Shape = "cards" | "list" | "form" | "thread";

const bar = "animate-pulse rounded-lg bg-muted";

/**
 * Same-size placeholder for a route that is still streaming in (`loading.tsx`).
 * Pure markup, no data: it only has to keep the layout from jumping.
 */
export function PageSkeleton({ title, shape = "list" }: { title: string; shape?: Shape }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label={`Memuat ${title}`}>
      <div className="flex flex-col gap-2">
        <div className={cn(bar, "h-4 w-40")} />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {shape === "cards" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={cn(bar, "h-24")} />
            ))}
          </div>
          <div className={cn(bar, "h-56")} />
        </>
      )}
      {shape === "list" && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={cn(bar, "h-16")} />
          ))}
        </div>
      )}
      {shape === "form" && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn(bar, "h-28")} />
          ))}
        </div>
      )}
      {shape === "thread" && (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <div className={cn(bar, "h-64")} />
          <div className={cn(bar, "h-12")} />
        </div>
      )}
      <span className="sr-only">Memuat…</span>
    </div>
  );
}
