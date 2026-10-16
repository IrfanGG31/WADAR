/**
 * Reads the NDJSON stream of /api/consult into message patches. `delta` lines
 * are the model's unverified draft; only a `final` / `weekly` / `remembered` /
 * `error` line ends a turn. If the stream stops before one of those (timeout,
 * dropped connection), the draft — whose numbers were never checked — is
 * replaced by an error, so an unverified number never stays on screen.
 */
export interface Meta {
  engine: "llm" | "offline";
  model: string;
  tier?: string;
  grounding?: string;
  fallbackReason?: string | null;
  toolsUsed?: string[];
  /** Replayed from the server cache, not freshly generated. */
  cached?: boolean;
}

export interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** The model's unverified draft is still streaming. */
  draft?: boolean;
  status?: string;
  question?: string;
  meta?: Meta;
  remember?: { content: string; state: "pending" | "saved" | "skipped" };
  error?: boolean;
}

export type MessagePatch = Partial<Message>;

export const STREAM_CUT_TEXT = "Jawaban terputus sebelum angkanya selesai diperiksa. Coba tanya lagi.";

const TERMINAL = new Set(["final", "weekly", "remembered", "error"]);

export async function readConsultStream(body: ReadableStream<Uint8Array>, patch: (p: MessagePatch) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let draft = "";
  let ended = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const e = JSON.parse(line) as Record<string, unknown> & { type: string };
      if (TERMINAL.has(e.type)) ended = true;
      if (e.type === "status") patch({ status: String(e.text) });
      else if (e.type === "delta") {
        draft += String(e.text);
        patch({ text: draft, draft: true, status: "Memeriksa angka…" });
      } else if (e.type === "final") {
        patch({
          text: String(e.text),
          draft: false,
          status: undefined,
          meta: {
            engine: e.engine as Meta["engine"],
            model: String(e.model),
            tier: String(e.tier),
            grounding: String(e.grounding),
            fallbackReason: (e.fallbackReason as string | null) ?? null,
            toolsUsed: (e.toolsUsed as string[]) ?? [],
            cached: e.cached === true,
          },
          remember: e.kind === "remember" && e.remember ? { content: (e.remember as { content: string }).content, state: "pending" } : undefined,
        });
      } else if (e.type === "weekly") {
        patch({
          text: String(e.text),
          draft: false,
          status: undefined,
          meta: { engine: e.engine as Meta["engine"], model: String(e.model), tier: "narrate", grounding: String(e.grounding), fallbackReason: (e.fallbackReason as string | null) ?? null, cached: e.cached === true },
        });
      } else if (e.type === "remembered") {
        patch({ text: `Oke, sudah kuingat: "${String(e.content)}".`, status: undefined, draft: false });
      } else if (e.type === "error") {
        patch({ text: String(e.text), error: true, draft: false, status: undefined });
      }
    }
  }
  if (!ended) patch({ text: STREAM_CUT_TEXT, error: true, draft: false, status: undefined });
}
