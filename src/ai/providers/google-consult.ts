import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { stepCountIs, streamText, tool } from "ai";
import type { ConsultModel } from "../consult";
import { TOOL_DEFS } from "../consult-tools";

/**
 * Konsultasi through the Vercel AI SDK `streamText` with read-only tools.
 * Only src/ai/consult.ts calls this. NOT verified live from the dev machine
 * (no Gemini key): model ids, `stopWhen`, the tool/usage fields need one real call.
 */
export function googleConsultModel(apiKey: string): ConsultModel {
  const google = createGoogleGenerativeAI({ apiKey });
  return {
    async generate(call) {
      const tools = Object.fromEntries(
        call.tools.map((name) => [
          name,
          tool({
            description: TOOL_DEFS[name].description,
            inputSchema: TOOL_DEFS[name].input,
            execute: async (args: unknown) => call.runTool(name, args),
          }),
        ]),
      );
      const result = streamText({
        model: google(call.modelId),
        system: call.system,
        messages: call.messages,
        tools,
        stopWhen: stepCountIs(call.maxSteps),
        maxOutputTokens: call.maxOutputTokens,
        temperature: 0.2,
        abortSignal: call.signal,
      });
      for await (const delta of result.textStream) call.onDelta?.(delta);
      const [text, usage] = await Promise.all([result.text, result.totalUsage]);
      return {
        text,
        usage: {
          inputTokens: usage.inputTokens ?? 0,
          cachedTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
        },
      };
    },
  };
}
