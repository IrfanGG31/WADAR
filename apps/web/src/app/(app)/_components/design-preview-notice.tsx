import { Eye } from "lucide-react";

/**
 * Pages built as UI mockups ahead of their milestone show sample numbers,
 * not the shop's data. Say so plainly (PRD §4: never let the owner mistake
 * an example for their real money/stock), until the page is wired to the API.
 */
export function DesignPreviewNotice({ milestone }: { milestone: string }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950"
    >
      <Eye className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">Pratinjau desain.</span> Angka dan nama di halaman ini masih contoh, belum
        data tokomu — fitur ini aktif mulai {milestone}.
      </p>
    </div>
  );
}
