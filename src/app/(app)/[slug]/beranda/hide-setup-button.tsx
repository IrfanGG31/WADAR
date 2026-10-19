"use client";

import { X } from "lucide-react";
import { useParams } from "next/navigation";
import { useState, useTransition } from "react";
import { hideSetupChecklist } from "./setup-actions";

export function HideSetupButton() {
  const { slug } = useParams<{ slug: string }>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await hideSetupChecklist(slug)).error))}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Sembunyikan daftar persiapan"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
