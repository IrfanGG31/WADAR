"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_SCOPES, SCOPE_LABEL, type ApiScope } from "@/core/channels/api-key";
import { cn } from "@/lib/utils";
import { createApiKey, revokeApiKey } from "./api-actions";

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  created_label: string;
  used_label: string | null;
  revoked: boolean;
}

/** Create a key (shown once), list and revoke keys. */
export function ApiKeyManager({ keys }: { keys: ApiKeyView[] }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [name, setName] = useState("Bot WhatsApp");
  const [scopes, setScopes] = useState<ApiScope[]>([...API_SCOPES]);
  const [fresh, setFresh] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-5">
      {fresh && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4" role="status">
          <p className="text-sm font-semibold text-emerald-900">Simpan kunci ini sekarang. Setelah halaman ditutup, kunci tidak bisa dilihat lagi.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded-md bg-background px-3 py-2 text-sm">{fresh}</code>
            <CopyButton text={fresh} label="Salin kunci" />
          </div>
        </div>
      )}

      <form
        className="flex flex-col gap-3 rounded-xl bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          startTransition(async () => {
            const r = await createApiKey(slug, { name, scopes });
            if ("error" in r) return setError(r.error);
            setFresh(r.key);
            router.refresh();
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="key-name">Nama kunci</Label>
          <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="mis. Bot WhatsApp, n8n, Sinkron Shopee" />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Boleh melakukan</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {API_SCOPES.map((s) => (
              <label key={s} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={scopes.includes(s)}
                  onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))}
                />
                {SCOPE_LABEL[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={pending || !name.trim() || scopes.length === 0} className="w-fit">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
          Buat API key
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>

      {keys.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {keys.map((k) => (
            <li key={k.id} className={cn("flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between", k.revoked && "opacity-60")}>
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {k.name} <span className="font-mono text-xs text-muted-foreground">{k.prefix}_…</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {k.scopes.map((s) => SCOPE_LABEL[s]).join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Dibuat {k.created_label} · {k.revoked ? "dicabut" : k.used_label ? `terakhir dipakai ${k.used_label}` : "belum pernah dipakai"}
                </p>
              </div>
              {!k.revoked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await revokeApiKey(slug, k.id);
                      if (r.error) setError(r.error);
                      router.refresh();
                    })
                  }
                >
                  Cabut
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
