"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useTenantEvent } from "../../../lib/realtime";

/** Re-render the Beranda when the ledger or stock changes (debounced). */
export function LiveRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refresh = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 1_500);
  };
  useTenantEvent("ledger.updated", refresh);
  useTenantEvent("stock.alert", refresh);
  return null;
}
