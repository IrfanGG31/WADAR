import type { EscalationCause } from "./schema";
import { hasAnyPhrase, hasPhrase, normalizeText, words } from "./text";

/**
 * Deterministic pre-router (TECH-SPEC §7.3 step 1): runs before retrieval and
 * before any LLM call. A hit goes straight to the owner with the holding
 * message — the model never sees the message.
 *
 * Spec routes: media → `media_received`; asking for a person → `human_requested`;
 * complaint words → `complaint`. Added for the sprint DoD ("minta diskon →
 * eskalasi"): haggling → `negotiation`, so it escalates even if a model would
 * have played along. Order matters: a complaint that also asks for the admin is
 * a complaint.
 */
export type PreRoute = Extract<EscalationCause, "media_received" | "human_requested" | "complaint" | "negotiation">;

export interface PreRouteInput {
  text: string;
  /** The message carries an image / document (proof of transfer, photo of a damaged item…). */
  hasMedia?: boolean;
}

const COMPLAINT_PHRASES = [
  "kecewa",
  "rusak",
  "refund",
  "komplain",
  "komplen",
  "complain",
  "belum sampai",
  "tidak sampai",
  "belum datang",
  "belum diterima",
  "salah kirim",
  "pecah",
  "bocor",
  "cacat",
  "penipu",
  "penipuan",
  "nipu",
  "uang kembali",
] as const;

/** Words that only mean "a person, not the bot" (TECH-SPEC: "admin", "cs", "orang", "manusia"). */
const HUMAN_ALWAYS = ["manusia", "operator", "customer service", "bukan bot", "orang asli", "pemilik toko"] as const;
const HUMAN_TARGETS = ["admin", "adminnya", "cs", "csnya", "orang", "owner", "pemilik", "penjual", "seller"] as const;
const HUMAN_VERBS = [
  "minta",
  "tolong",
  "panggil",
  "panggilkan",
  "sambungkan",
  "hubungkan",
  "hubungi",
  "bicara",
  "ngomong",
  "ngobrol",
  "chat",
  "telepon",
  "telpon",
  "langsung",
] as const;
const HUMAN_PREPOSITIONS = ["sama", "dengan", "ke", "sm"] as const;
const HUMAN_TAIL = ["dong", "donk", "mana", "please", "tolong", "ada"];

const NEGOTIATION_PHRASES = [
  "nego",
  "negoin",
  "nego dong",
  "bisa nego",
  "tawar",
  "ditawar",
  "tawarin",
  "kurangin",
  "dikurangin",
  "kurang dong",
  "kurang lagi",
  "bisa kurang",
  "murahin",
  "dimurahin",
  "lebih murah dong",
  "harga teman",
  "harga temen",
  "diskonin",
  "potongin",
] as const;
const PERK_WORDS = ["diskon", "potongan", "cashback", "bonus", "gratis ongkir", "harga khusus", "harga spesial", "murah"] as const;

/**
 * Asking for a person needs a target word plus either a request verb or a
 * preposition right before it ("minta admin", "mau ngobrol sama admin",
 * "bisa ke cs?"), or the target as the whole message ("admin?"). A greeting
 * like "halo admin, serum ready?" or "mau tanya admin" is not a request —
 * sellers are routinely addressed as "admin"/"min" — and neither is
 * "aman untuk orang hamil?".
 */
function asksForHuman(normalized: string): boolean {
  if (hasAnyPhrase(normalized, HUMAN_ALWAYS)) return true;
  const w = words(normalized);
  const isTarget = (word: string) => word !== "orang" && (HUMAN_TARGETS as readonly string[]).includes(word);
  // "admin", "admin dong", "adminnya mana?" — the target is the whole request.
  if (w.length >= 1 && w.length <= 2 && isTarget(w[0]) && (w.length === 1 || HUMAN_TAIL.includes(w[1]))) return true;
  return w.some((word, i) => {
    if (!(HUMAN_TARGETS as readonly string[]).includes(word)) return false;
    const before = w.slice(Math.max(0, i - 3), i);
    const prev = w[i - 1];
    if (word === "orang") return prev !== undefined && (HUMAN_PREPOSITIONS as readonly string[]).includes(prev);
    return (
      before.some((b) => (HUMAN_VERBS as readonly string[]).includes(b)) ||
      (prev !== undefined && (HUMAN_PREPOSITIONS as readonly string[]).includes(prev))
    );
  });
}

/** "kasih diskon dong", "minta potongan", "bisa nego?", "diskon ya kak". Asking whether a promo exists is not haggling. */
function haggles(normalized: string): boolean {
  if (hasAnyPhrase(normalized, NEGOTIATION_PHRASES)) return true;
  return PERK_WORDS.some(
    (perk) =>
      hasPhrase(normalized, `kasih ${perk}`) ||
      hasPhrase(normalized, `kasi ${perk}`) ||
      hasPhrase(normalized, `minta ${perk}`) ||
      hasPhrase(normalized, `bisa ${perk}`) ||
      hasPhrase(normalized, `${perk} dong`) ||
      hasPhrase(normalized, `${perk} donk`) ||
      hasPhrase(normalized, `${perk} ya`) ||
      hasPhrase(normalized, `${perk} lah`) ||
      hasPhrase(normalized, `${perk} boleh`) ||
      hasPhrase(normalized, `${perk} bisa`),
  );
}

export function preRoute(input: PreRouteInput): PreRoute | null {
  if (input.hasMedia) return "media_received";
  const normalized = normalizeText(input.text);
  if (hasAnyPhrase(normalized, COMPLAINT_PHRASES)) return "complaint";
  if (asksForHuman(normalized)) return "human_requested";
  if (haggles(normalized)) return "negotiation";
  return null;
}
