import { BaseEnvSchema, parseEnv } from "@wadar/contracts";
import { z } from "zod";

export const WorkerEnvSchema = BaseEnvSchema.extend({
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3002),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function loadWorkerEnv(): WorkerEnv {
  return parseEnv(WorkerEnvSchema);
}
