"use client";

import { Loader2, Pencil } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseTags } from "@/core/customer-profile";
import { updateCustomerProfile } from "../actions";

/** CRM-2: labels + notes shown on the profile; one tap to edit (also the buyer's name). */
export function CustomerNotes({ customerId, name, notes, tags }: { customerId: string; name: string | null; notes: string | null; tags: string[] }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [editing, setEditing] = useState(false);
  const [nameText, setNameText] = useState(name ?? "");
  const [tagText, setTagText] = useState(tags.join(", "));
  const [noteText, setNoteText] = useState(notes ?? "");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-border p-4" aria-labelledby="catatan-pelanggan">
        <div className="flex items-center justify-between gap-2">
          <h2 id="catatan-pelanggan" className="text-sm font-semibold">Label & catatan</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden />
            Ubah
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="outline">{t}</Badge>
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {notes ?? (tags.length ? "" : "Belum ada catatan. Tambahkan label seperti \"reseller\" atau catatan seperti \"suka warna pastel\".")}
        </p>
      </section>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const result = await updateCustomerProfile(slug, customerId, { name: nameText, notes: noteText, tags: parseTags(tagText) });
          if (result.error) return setError(result.error);
          setEditing(false);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cust-name">Nama</Label>
        <Input id="cust-name" value={nameText} onChange={(e) => setNameText(e.target.value)} maxLength={80} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cust-tags">Label (pisahkan dengan koma)</Label>
        <Input id="cust-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="reseller, langganan" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cust-notes">Catatan</Label>
        <textarea
          id="cust-notes"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="mis. Kulit sensitif, suka dikirim pagi"
          className="rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Batal
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
