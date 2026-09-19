import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { getCorrelationId } from "@wadar/platform";
import type { FastifyReply, FastifyRequest } from "fastify";
import pino from "pino";

const logger = pino({ name: "wadar-api-errors" });

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  correlationId: string;
  [key: string]: unknown;
}

function isPostgresUndefinedSettingError(exception: unknown): boolean {
  // SQLSTATE 42704 (undefined_object) — exactly what
  // `current_setting('app.tenant_id')` throws (no `missing_ok`) when a
  // tenant-scoped query ran outside `withTenantContext`. See
  // docs/adr/002-postgres-role-separation-for-rls.md: this is a deliberate
  // "fail loud" choice, not a bug to silently swallow — this filter's job
  // is only to stop it from leaking a raw stack trace / crashing the
  // process, not to make it disappear.
  return (
    typeof exception === "object" &&
    exception !== null &&
    "code" in exception &&
    (exception as { code?: unknown }).code === "42704"
  );
}

function toProblemDetails(exception: unknown, correlationId: string): ProblemDetails {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    if (typeof body === "object" && body !== null) {
      const bodyRecord = body as Record<string, unknown>;
      return {
        type: "about:blank",
        title: exception.name,
        code: "ERROR",
        // Nest's own built-in exceptions (e.g. `new NotFoundException("x")`,
        // or ones thrown internally by a guard/pipe this app didn't author)
        // default to `{ statusCode, message, error }`, never `detail` — map
        // `message` across so those still come out RFC7807-shaped instead
        // of silently missing `detail`. A controller's own already-RFC7807
        // object (with an explicit `detail`) always wins via the spread below.
        detail: typeof bodyRecord.message === "string" ? bodyRecord.message : undefined,
        ...bodyRecord,
        status,
        correlationId,
      } as ProblemDetails;
    }
    return {
      type: "about:blank",
      title: exception.name,
      status,
      detail: typeof body === "string" ? body : exception.message,
      code: "ERROR",
      correlationId,
    };
  }

  if (isPostgresUndefinedSettingError(exception)) {
    return {
      type: "about:blank",
      title: "Internal Server Error",
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: "A required tenant context was missing for this operation.",
      code: "TENANT_CONTEXT_MISSING",
      correlationId,
    };
  }

  return {
    type: "about:blank",
    title: "Internal Server Error",
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: "An unexpected error occurred.",
    code: "INTERNAL_ERROR",
    correlationId,
  };
}

/**
 * Global exception filter (CLAUDE.md convention: "Error API: RFC 7807
 * dengan code dan correlationId"). Every error response — a controller's
 * own deliberately-thrown HttpException, or something unhandled — gets
 * `correlationId` merged in here, in exactly one place, rather than every
 * controller having to remember to add it. Didn't exist before M1: M0 had
 * no route that could throw a domain error in the request path (the
 * `platform`'s own `outbox-relay.tick()` catch-and-log pattern is correct
 * for a background loop, but must NOT be copied into a request handler —
 * see the M1 plan's design decision #2).
 */
@Catch()
export class Rfc7807Filter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const correlationId =
      getCorrelationId() ?? (request.headers["x-correlation-id"] as string | undefined) ?? "unknown";

    const problem = toProblemDetails(exception, correlationId);

    if (problem.status >= 500) {
      logger.error({ err: exception, correlationId, path: request.url }, "unhandled error");
    }

    void response.status(problem.status).header("content-type", "application/problem+json").send(problem);
  }
}
