import { CatalogModule } from "@wadar/catalog";
import { IdentityModule } from "@wadar/identity";
import { InventoryModule } from "@wadar/inventory";
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
        IdentityModule.forRoot({
          supabaseJwt: {
            mode: env.SUPABASE_JWT_MODE,
            jwksUrl: env.SUPABASE_JWKS_URL,
            hs256Secret: env.SUPABASE_JWT_SECRET,
          },
        }),
        CatalogModule.forRoot({
          photoStorage:
            env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
              ? { supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }
              : undefined,
        }),
        InventoryModule.forRoot(),
      ],
    };
  }
}
