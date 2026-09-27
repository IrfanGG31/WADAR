"use client";

import { PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import { clearActiveTenantId } from "../../../lib/tenant-cookie";

/**
 * Shown to anonymous (demo) users: the shop is a sample made by "Coba demo",
 * and it can't be reopened after leaving — say so up front (PRD §4).
 */
export function DemoBanner() {
  const router = useRouter();

  async function leaveDemo() {
    await createClient().auth.signOut();
    clearActiveTenantId();
    router.push("/masuk");
    router.refresh();
  }

  return (
    <div role="note" className="flex items-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-2 text-sm">
      <PlayCircle className="h-4 w-4 shrink-0 text-primary" />
      <p className="flex-1">
        <span className="font-semibold">Mode demo.</span> Ini toko contoh — silakan coba jualan, catat pengeluaran, dan
        lihat laporannya.
      </p>
      <button type="button" onClick={leaveDemo} className="shrink-0 font-medium text-primary underline underline-offset-2">
        Keluar demo
      </button>
    </div>
  );
}
