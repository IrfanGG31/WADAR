import type { LucideIcon } from "lucide-react";

/** Empty state for app pages that are not built yet in the sprint. */
export function PagePlaceholder({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <Icon className="h-10 w-10 text-muted-foreground" />
        <p className="max-w-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
