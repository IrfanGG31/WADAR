import { PlatformModule } from "@wadar/platform";
import { Module, type DynamicModule } from "@nestjs/common";
import type { ApiEnv } from "./env.js";

@Module({})
export class AppModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PlatformModule.forRoot({ databaseUrl: env.DATABASE_URL, redisUrl: env.REDIS_URL }),
      ],
    };
  }
}
