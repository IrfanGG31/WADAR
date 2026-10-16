import { createHash } from "node:crypto";
import { normalizeQuestion } from "../consult/cache";
import type { ChatContext } from "./context";
import type { Engine } from "./pipeline";
import type { ChatReply } from "./schema";

/**
 * FAQ answer cache for Customer Chat (PDF §C.1 Tabel 9). The key is tenant +
 * fingerprint of everything the reply may quote (cards with price/stock, KB,
 * policies, persona) + the normalized question. A price or stock change gives
 * a new fingerprint, so a cached reply never quotes stale data; the TTL only
 * bounds how long we keep it.
 */
export const CHAT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface CachedChatReply {
  text: string;
  reply: ChatReply;
  engine: Engine;
  model: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * null when the turn must not be cached: follow-ups depend on the conversation,
 * and a reply may quote the buyer's own phone number.
 */
export function chatCacheKey(p: { scope: string; question: string; context: ChatContext }): string | null {
  const { context } = p;
  if (context.history.length > 0 || context.buyerPhone) return null;
  const facts = sha256(
    JSON.stringify({ s: context.shopName, p: context.persona, o: context.policies, c: context.cards, k: context.kb }),
  ).slice(0, 24);
  return ["chat", p.scope, facts, sha256(normalizeQuestion(p.question)).slice(0, 24)].join("|");
}
