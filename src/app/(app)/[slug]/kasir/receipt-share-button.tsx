"use client";

import { Check, Copy, Loader2, ReceiptText } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getReceiptLink } from "./actions";

/** Struk publik (POS-3): fetch the sale's receipt link, then copy it or send it on WhatsApp. */
export function ReceiptShareButton({ slug, saleId, className }: { slug: string; saleId: string; className?: string }) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const open = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await getReceiptLink(slug, saleId);
      if (result.error || !result.path) {
        setError(result.error ?? "Tautan struk belum bisa dibuat.");
        return;
      }
      setUrl(`${window.location.origin}${result.path}`);
    });
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Tidak bisa menyalin otomatis. Tekan lama tautannya untuk menyalin.");
    }
  };

  if (!url) {
    return (
      <div className={className}>
        <Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={open} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ReceiptText className="h-3.5 w-3.5" />}
          Struk
        </Button>
        {error && <p className="text-xs text-red-800">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`flex w-full flex-col gap-2 ${className ?? ""}`}>
      <a href={url} target="_blank" rel="noreferrer" className="break-all text-xs text-primary underline">
        {url}
      </a>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Tersalin" : "Salin tautan"}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`https://wa.me/?text=${encodeURIComponent(`Struk belanja kamu: ${url}`)}`} target="_blank" rel="noreferrer">
            Kirim lewat WhatsApp
          </a>
        </Button>
      </div>
      {error && <p className="text-xs text-red-800">{error}</p>}
    </div>
  );
}
