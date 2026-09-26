import {
  BadRequestException,
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { from, of, switchMap, tap, type Observable } from "rxjs";
import { PLATFORM_DB } from "./tokens.js";
import { getSnapshot, saveSnapshot } from "../infra/idempotency-keys.repository.js";
import type { Db } from "../infra/db.js";
import pino from "pino";

const logger = pino({ name: "idempotency" });
/** `idempotency_keys.tenant_id` is a NOT NULL uuid; tenant-less routes store the nil UUID. */
const NO_TENANT = "00000000-0000-0000-0000-000000000000";

/**
 * Enforces CLAUDE.md aturan #6 (Idempotency-Key wajib untuk POST yang membuat
 * transaksi) and implements ARCHITECTURE §11's 24h response-snapshot cache.
 * Reusable across every module's write endpoints, not just platform's own
 * dummy ping — see docs/BUILD-PLAN.md M0 plan notes.
 */
@Injectable()
export class IdempotencyKeyInterceptor implements NestInterceptor {
  constructor(@Inject(PLATFORM_DB) private readonly db: Db) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) {
      throw new BadRequestException({
        type: "about:blank",
        title: "Missing Idempotency-Key",
        status: 400,
        detail: "Idempotency-Key header is required for this endpoint.",
        code: "IDEMPOTENCY_KEY_REQUIRED",
      });
    }
    // Guards run before interceptors, so `request.tenant`/`request.user` are
    // already verified here. The key is namespaced by the verified tenant —
    // or by the user on tenant-less routes (onboarding, accepting an
    // invitation) — so one caller can never replay another's cached response.
    const verified = request as FastifyRequest & { tenant?: { tenantId: string }; user?: { id: string } };
    const tenantId = verified.tenant?.tenantId ?? NO_TENANT;
    const scope = verified.tenant ? `t:${verified.tenant.tenantId}` : `u:${verified.user?.id ?? "anon"}`;
    const scopedKey = `${scope}:${key}`;

    return from(getSnapshot(this.db, scopedKey)).pipe(
      switchMap((existing) => {
        if (existing !== undefined) return of(existing);
        return next.handle().pipe(
          tap((response: unknown) => {
            // Never leave this promise unhandled: an unhandled rejection
            // terminates a Node 22 process.
            saveSnapshot(this.db, scopedKey, tenantId, response).catch((error: unknown) => {
              logger.error({ err: error }, "idempotency snapshot save failed");
            });
          }),
        );
      }),
    );
  }
}
