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
    // Tenant guard (x-tenant-id -> app.tenant_id) is built in M1; M0's dummy
    // endpoint only needs a value to key the snapshot by, so it reads the
    // header directly instead of a real tenant context.
    const tenantId = (request.headers["x-tenant-id"] as string | undefined) ?? "unset";

    return from(getSnapshot(this.db, key)).pipe(
      switchMap((existing) => {
        if (existing !== undefined) return of(existing);
        return next.handle().pipe(
          tap((response: unknown) => {
            void saveSnapshot(this.db, key, tenantId, response);
          }),
        );
      }),
    );
  }
}
