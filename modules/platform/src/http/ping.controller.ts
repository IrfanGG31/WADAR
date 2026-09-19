import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  UseInterceptors,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createPing } from "../application/ping-command.js";
import type { Db } from "../infra/db.js";
import { IdempotencyKeyInterceptor } from "./idempotency-key.interceptor.js";
import { PLATFORM_DB } from "./tokens.js";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

const CreatePingBody = z.object({ message: z.string().min(1) });
type CreatePingBody = z.infer<typeof CreatePingBody>;

/**
 * Dummy write endpoint used only to prove the outbox + Idempotency-Key
 * pattern end to end (docs/BUILD-PLAN.md M0 DoD). Not a real feature.
 */
@Controller("ping")
export class PingController {
  constructor(@Inject(PLATFORM_DB) private readonly db: Db) {}

  @Post()
  @UseInterceptors(IdempotencyKeyInterceptor)
  async create(
    @Body(new ZodValidationPipe(CreatePingBody)) body: CreatePingBody,
    @Headers("x-tenant-id") tenantId: string | undefined,
    @Headers("x-correlation-id") correlationId: string | undefined,
  ) {
    if (!tenantId) {
      throw new BadRequestException({
        type: "about:blank",
        title: "Missing x-tenant-id",
        status: 400,
        detail: "x-tenant-id header is required.",
        code: "TENANT_ID_REQUIRED",
      });
    }
    return createPing(this.db, {
      tenantId,
      message: body.message,
      correlationId: correlationId ?? randomUUID(),
    });
  }
}
