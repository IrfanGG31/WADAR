import { BaseEnvSchema, parseEnv } from "@wadar/contracts";
import { z } from "zod";

export const ApiEnvSchema = BaseEnvSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(3001),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function loadApiEnv(): ApiEnv {
  return parseEnv(ApiEnvSchema);
}
