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
    const tenantId = (request.headers["x-tenant-id"] as string | undefined) ?? "unset";
    // Namespaced by tenant: a key is only meaningful within the tenant that
    // sent it, and a bare-key lookup would hand tenant A's cached response
    // to anyone who replays A's key under tenant B.
    const scopedKey = `${tenantId}:${key}`;

    return from(getSnapshot(this.db, scopedKey)).pipe(
      switchMap((existing) => {
        if (existing !== undefined) return of(existing);
        return next.handle().pipe(
          tap((response: unknown) => {
            void saveSnapshot(this.db, scopedKey, tenantId, response);
          }),
        );
      }),
    );
  }
}
