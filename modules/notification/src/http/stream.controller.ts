import { Controller, Get, Inject, Req, Res, UseGuards } from "@nestjs/common";
import { SupabaseJwtGuard, TenantGuard } from "@wadar/identity";
import { PLATFORM_REALTIME, type RealtimeBroker } from "@wadar/platform";
import type { FastifyReply, FastifyRequest } from "fastify";

const HEARTBEAT_MS = 20_000;

/**
 * Per-tenant server-sent events (ARCHITECTURE §6.3, docs/adr/004): the web
 * app opens this with its normal Authorization + x-tenant-id headers (a
 * fetch stream, not EventSource, so the token never goes in a URL). The
 * TenantGuard scopes the subscription to the caller's own tenant.
 *
 * Deliberately NOT @TenantScoped(): the tenant-isolation generator calls
 * every tagged GET and this response never ends. Its isolation is tested
 * explicitly instead.
 */
@Controller("v1/events")
@UseGuards(SupabaseJwtGuard, TenantGuard)
export class StreamController {
  constructor(@Inject(PLATFORM_REALTIME) private readonly realtime: RealtimeBroker) {}

  @Get("stream")
  async stream(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const tenantId = request.tenant!.tenantId;
    // Hijacking bypasses Fastify's reply pipeline, so carry over headers
    // hooks already set (CORS from app.enableCors) by hand.
    const inherited = Object.fromEntries(
      Object.entries(reply.getHeaders()).filter(([key]) => key.toLowerCase().startsWith("access-control-")),
    );
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      ...inherited,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    raw.write(": connected\n\n");

    const unsubscribe = await this.realtime.subscribe(tenantId, (message) => {
      raw.write(`event: ${message.event}\ndata: ${JSON.stringify(message.payload)}\n\n`);
    });
    const heartbeat = setInterval(() => raw.write(": ping\n\n"), HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      void unsubscribe();
    };
    request.raw.on("close", close);
    raw.on("error", close);
  }
}
