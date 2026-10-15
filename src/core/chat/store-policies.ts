import { z } from "zod";
import { formatRupiah } from "@/core/money";
import { findForbiddenTerms } from "./text";

/**
 * Structured shop policies (KB-1) and chat persona (CHT-3), stored as
 * `store_profile.policies` / `store_profile.persona` (jsonb) and always parsed
 * through these schemas. Policies are never embedded: they go into the chat
 * context whole (TECH-SPEC §7.5) and their rupiah amounts are the only
 * non-catalog amounts a reply may quote (price guardrail).
 */
const text = (max: number) => z.string().trim().max(max).default("");
const rupiah = z.number().int().min(0).max(100_000_000);

export const ShippingEstimate = z
  .object({
    area: z.string().trim().min(1, "Nama area wajib diisi.").max(60),
    cost_min: rupiah,
    cost_max: rupiah,
    eta: text(60),
    /** Cities / words that point to this area ("surabaya", "jawa"); lowercase. */
    keywords: z.array(z.string().trim().toLowerCase().min(2).max(30)).max(20).default([]),
  })
  .refine((e) => e.cost_max >= e.cost_min, { message: "Ongkir maksimum tidak boleh lebih kecil dari minimum." });

export const StorePolicies = z.object({
  hours: text(200),
  address: text(300),
  shipping_areas: text(300),
  shipping_estimates: z.array(ShippingEstimate).max(10).default([]),
  /** available null = not filled in yet: the chat must not claim either way. */
  cod: z.object({ available: z.boolean().nullable().default(null), note: text(200) }).default({ available: null, note: "" }),
  payment_methods: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  returns: text(400),
  warranty: text(300),
  processing_time: text(200),
  order_steps: text(400),
  /** The shop's own admin number; the only phone number a reply may contain besides the buyer's. */
  admin_contact: text(40),
  /** Running promo in the owner's words. Promise words (diskon, gratis ongkir, …) are allowed only if written here or in the KB. */
  promo: text(300),
});

export type StorePolicies = z.infer<typeof StorePolicies>;
export type ShippingEstimate = z.infer<typeof ShippingEstimate>;

export const DEFAULT_HOLDING_MESSAGE =
  "Pertanyaan Kakak sudah aku teruskan ke admin toko ya. Mohon tunggu sebentar, admin akan membalas langsung di chat ini.";

export const StorePersona = z.object({
  name: text(40),
  salutation: z.string().trim().min(1).max(20).default("Kak"),
  style: z.enum(["santai", "formal"]).default("santai"),
  emoji: z.boolean().default(true),
  holding_message: z
    .string()
    .trim()
    .max(300)
    .default("")
    .refine((m) => findForbiddenTerms(m).length === 0, {
      message: "Pesan penahan tidak boleh menyebut HPP, modal, margin, untung, saldo, atau laba.",
    }),
});

export type StorePersona = z.infer<typeof StorePersona>;

/** Parse whatever is in the jsonb column; unknown/invalid → defaults, so chat never breaks on a bad row. */
export function parsePolicies(raw: unknown): StorePolicies {
  const parsed = StorePolicies.safeParse(raw ?? {});
  return parsed.success ? parsed.data : StorePolicies.parse({});
}

export function parsePersona(raw: unknown): StorePersona {
  const parsed = StorePersona.safeParse(raw ?? {});
  return parsed.success ? parsed.data : StorePersona.parse({});
}

export function holdingMessage(persona: StorePersona): string {
  return persona.holding_message || DEFAULT_HOLDING_MESSAGE;
}

/** Policy facts as (key, sentence) pairs: the [KEBIJAKAN] block of the prompt and the `policy:<key>` source ids. */
export interface PolicyFact {
  key: string;
  label: string;
  text: string;
}

export function policyFacts(p: StorePolicies): PolicyFact[] {
  const facts: PolicyFact[] = [];
  const add = (key: string, label: string, value: string) => {
    if (value.trim()) facts.push({ key, label, text: value.trim() });
  };
  add("hours", "Jam buka", p.hours);
  add("address", "Alamat", p.address);
  add("shipping_areas", "Area & cara kirim", p.shipping_areas);
  if (p.shipping_estimates.length > 0) {
    add("shipping_estimates", "Estimasi ongkir", p.shipping_estimates.map(formatShippingEstimate).join("; "));
  }
  if (p.cod.available !== null) {
    add("cod", "COD", p.cod.available ? `Bisa COD${p.cod.note ? ` (${p.cod.note})` : ""}` : "Tidak melayani COD");
  }
  if (p.payment_methods.length > 0) add("payment_methods", "Metode bayar", p.payment_methods.join(", "));
  add("returns", "Retur/tukar", p.returns);
  add("warranty", "Garansi", p.warranty);
  add("processing_time", "Waktu proses pesanan", p.processing_time);
  add("order_steps", "Cara pesan", p.order_steps);
  add("admin_contact", "Kontak admin", p.admin_contact);
  add("promo", "Promo berjalan", p.promo);
  return facts;
}

/** "Pulau Jawa Rp12.000–Rp25.000 (2–4 hari)"; a single amount when min = max. */
export function formatShippingEstimate(e: ShippingEstimate): string {
  const cost =
    e.cost_min === e.cost_max ? formatRupiah(e.cost_min) : `${formatRupiah(e.cost_min)}–${formatRupiah(e.cost_max)}`;
  return `${e.area} ${cost}${e.eta ? ` (${e.eta})` : ""}`;
}

/** What the Pengaturan form submits. Policy text is shown to buyers, so internal-data words are rejected on save. */
export const StoreProfileInput = z
  .object({ policies: StorePolicies, persona: StorePersona })
  .superRefine((value, ctx) => {
    for (const fact of policyFacts(value.policies)) {
      if (findForbiddenTerms(fact.text).length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["policies", fact.key],
          message: `${fact.label}: jangan tulis HPP, modal, margin, untung, saldo, atau laba — teks ini dibaca pembeli.`,
        });
      }
    }
  });

export type StoreProfileInput = z.infer<typeof StoreProfileInput>;
