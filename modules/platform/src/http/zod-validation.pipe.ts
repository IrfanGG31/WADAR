import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Custom validation pipe instead of `nestjs-zod` — see docs/adr/001-custom-zod-validation-pipe.md
 * for why. Maps a Zod parse failure to an RFC 7807 problem body
 * (docs/ARCHITECTURE.md §11).
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        type: "about:blank",
        title: "Validation failed",
        status: 400,
        detail: result.error.issues.map((issue) => issue.message).join("; "),
        code: "VALIDATION_ERROR",
        errors: result.error.issues,
      });
    }
    return result.data;
  }
}
