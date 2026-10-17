"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "./actions";

export function AcceptButton({ token }: { token: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        className="h-11"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvite(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Gabung ke toko
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
