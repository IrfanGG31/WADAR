/**
 * "This table/function does not exist on this database yet" — code shipped ahead of its migration
 * (e.g. deployed before `connect_hub` is applied). Readers treat it as "feature not installed"
 * instead of failing the page. Postgres: 42P01 undefined_table, 42883 undefined_function;
 * PostgREST: PGRST205 table not in schema cache, PGRST202 function not found.
 */
export function isSchemaPending(error: { code?: string | null } | null | undefined): boolean {
  return Boolean(error?.code && ["42P01", "42883", "PGRST205", "PGRST202"].includes(error.code));
}

/** What an action says when its table/function is not on this database yet. */
export const SCHEMA_PENDING_MESSAGE = "Fitur ini menunggu pembaruan database (migrasi connect_hub). Fitur lain tetap jalan.";

/**
 * `conversations.channel` not widened yet (migration conversation_channels): the CHECK still only
 * allows 'whatsapp' and 'widget', so a Telegram/API chat cannot open a conversation.
 */
export function isChannelPending(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null | undefined;
  return e?.code === "23514" && typeof e.message === "string" && e.message.includes("conversations_channel_check");
}
