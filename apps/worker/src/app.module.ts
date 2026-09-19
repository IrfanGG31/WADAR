import { PlatformModule } from "@wadar/platform";
import { Module, type DynamicModule } from "@nestjs/common";
import type { WorkerEnv } from "./env.js";

@Module({})
export class AppModule {
  static forRoot(env: WorkerEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PlatformModule.forRoot({ databaseUrl: env.DATABASE_URL, redisUrl: env.REDIS_URL }),
      ],
    };
  }
}
