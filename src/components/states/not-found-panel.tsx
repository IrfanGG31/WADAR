import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Body of every `not-found.tsx`: unknown page, or a shop the user is not a member of (RLS hides it). */
export function NotFoundPanel({ href, label }: { href: string; label: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <SearchX className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Halaman tidak ditemukan</h1>
      <p className="text-sm text-muted-foreground">
        Alamatnya mungkin salah, atau toko ini bukan milik akunmu.
      </p>
      <Button asChild className="mt-2">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}
