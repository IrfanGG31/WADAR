import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";

/**
 * Console exporter only for M0 — no OTLP backend configured yet
 * (docs/BUILD-PLAN.md M0 plan notes / modules/platform/README.md). Swap for
 * an OTLP exporter once there's somewhere to send traces to.
 */
export function startInstrumentation(): void {
  const sdk = new NodeSDK({
    serviceName: "wadar-api",
    traceExporter: new ConsoleSpanExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();

  process.on("SIGTERM", () => {
    void sdk.shutdown();
  });
}
