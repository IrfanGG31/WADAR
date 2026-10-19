"use client";

import { Check, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { closeAgentTask } from "../pengaturan/koneksi/agent-actions";

/** "Selesai" / "Abaikan" on one or several tasks (closing is audited server-side). */
export function TaskActions({ taskIds, doneLabel = "Selesai", primary = true }: { taskIds: string[]; doneLabel?: string; primary?: boolean }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const close = (status: "done" | "dismissed") =>
    startTransition(async () => {
      for (const id of taskIds) {
        const r = await closeAgentTask(slug, id, status);
        if (r.error) return setError(r.error);
      }
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant={primary ? "default" : "outline"} disabled={pending} onClick={() => close("done")}>
        <Check className="h-4 w-4" aria-hidden />
        {doneLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => close("dismissed")}>
        <X className="h-4 w-4" aria-hidden />
        Abaikan
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
