/**
 * Demo reset (SPRINT-8D §5): the hidden control behind `/<slug>/pengaturan?reset-demo=1`.
 * The reset itself is SQL (`public.reset_demo_shop`: archives the old shop and
 * seeds a fresh one under the same slug); this module only decides when the
 * control may be shown and how the RPC answer reads.
 */
export const RESET_DEMO_PARAM = "reset-demo";

type ParamValue = string | string[] | undefined;

/** `?reset-demo=1` — anything else (missing, "0", repeated) leaves the control hidden. */
export function wantsDemoReset(value: ParamValue): boolean {
  return value === "1";
}

/** Only a demo shop can be reset, and only when asked for explicitly. Real shops never show it. */
export function canResetDemo(shop: { is_demo: boolean }, param: ParamValue): boolean {
  return shop.is_demo && wantsDemoReset(param);
}

export type ResetResult = { ok: true; slug: string } | { ok: false; error: string };

/** Reads the RPC answer. Postgres 42501 = "not a demo shop" / not a member. */
export function interpretReset(res: { data: unknown; error: { code?: string } | null }, expectedSlug: string): ResetResult {
  if (res.error) {
    return {
      ok: false,
      error: res.error.code === "42501" ? "Hanya toko demo yang bisa di-reset." : "Reset belum berhasil. Datamu tidak berubah, coba lagi sebentar.",
    };
  }
  if (typeof res.data !== "string" || res.data !== expectedSlug) {
    return { ok: false, error: "Reset selesai tetapi alamat toko berubah. Buka ulang dari halaman awal." };
  }
  return { ok: true, slug: res.data };
}
