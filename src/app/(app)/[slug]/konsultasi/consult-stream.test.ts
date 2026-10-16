import { describe, expect, it } from "vitest";
import { readConsultStream, STREAM_CUT_TEXT, type MessagePatch } from "./consult-stream";

const body = (lines: object[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(`${JSON.stringify(l)}\n`));
      c.close();
    },
  });

async function run(lines: object[]) {
  const patches: MessagePatch[] = [];
  await readConsultStream(body(lines), (p) => patches.push(p));
  return { patches, last: patches.at(-1)! };
}

describe("readConsultStream", () => {
  it("replaces the unverified draft with an error when the stream ends without a final line", async () => {
    const { last } = await run([
      { type: "status", text: "Membaca data tokomu…" },
      { type: "delta", text: "Omzetmu turun Rp9.999.999" },
    ]);
    expect(last).toMatchObject({ text: STREAM_CUT_TEXT, error: true, draft: false });
    expect(last.text).not.toContain("9.999.999");
  });

  it("also reports a stream that ended with nothing at all", async () => {
    expect((await run([])).last).toMatchObject({ error: true, text: STREAM_CUT_TEXT });
  });

  it("keeps the final grounded answer", async () => {
    const { last } = await run([
      { type: "delta", text: "draf" },
      { type: "final", text: "Untung turun Rp77.340.", engine: "llm", model: "m", tier: "consult_fast", grounding: "model", toolsUsed: [] },
    ]);
    expect(last).toMatchObject({ text: "Untung turun Rp77.340.", draft: false });
    expect(last.error).toBeUndefined();
  });
});
