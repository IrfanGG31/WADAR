import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

describe("ZodValidationPipe", () => {
  const schema = z.object({ message: z.string().min(1) });
  const pipe = new ZodValidationPipe(schema);

  it("returns parsed data for valid input", () => {
    expect(pipe.transform({ message: "hi" })).toEqual({ message: "hi" });
  });

  it("throws BadRequestException for invalid input", () => {
    expect(() => pipe.transform({ message: "" })).toThrow(BadRequestException);
  });

  it("throws BadRequestException with RFC 7807 shape", () => {
    try {
      pipe.transform({});
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response.status).toBe(400);
      expect(response.code).toBe("VALIDATION_ERROR");
      expect(response.type).toBe("about:blank");
    }
  });
});
