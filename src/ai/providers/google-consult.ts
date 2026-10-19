import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { stepCountIs, streamText, tool, type LanguageModel } from "ai";
import type { ConsultModel } from "../consult";
import { TOOL_DEFS } from "../consult-tools";

/**
 * Konsultasi through the Vercel AI SDK `streamText` with read-only tools.
 * Only src/ai/consult.ts calls this. NOT verified live from the dev machine
 * (no Gemini key): model ids, `stopWhen`, the tool/usage fields need one real call.
 */
export function googleConsultModel(apiKey: string): ConsultModel {
  const google = createGoogleGenerativeAI({ apiKey });
  return sdkConsultModel((id) => google(id));
}

/** The same tool loop over any AI SDK model factory. */
export function sdkConsultModel(model: (modelId: string) => LanguageModel): ConsultModel {
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
        model: model(call.modelId),
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

/**
 * The shop's own model first (its model id replaces the route's), then the default model. A
 * failure after text has streamed is not retried: the grounding step judges what was produced.
 */
export function fallbackConsultModel(primary: { model: ConsultModel; modelId: string }, fallback?: ConsultModel): ConsultModel {
  return {
    async generate(call) {
      let streamed = false;
      try {
        return await primary.model.generate({
          ...call,
          modelId: primary.modelId,
          onDelta: call.onDelta
            ? (text) => {
                streamed = true;
                call.onDelta?.(text);
              }
            : undefined,
        });
      } catch (e) {
        if (!fallback || streamed) throw e;
        return fallback.generate(call);
      }
    },
  };
}
