import { CatalogModule } from "@wadar/catalog";
import { FinanceModule } from "@wadar/finance";
import { IdentityModule } from "@wadar/identity";
import { InventoryModule } from "@wadar/inventory";
import { SalesModule } from "@wadar/sales";
import { PlatformModule } from "@wadar/platform";
import { Module, type DynamicModule } from "@nestjs/common";
import { createHash } from "node:crypto";
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
        FinanceModule.forRoot(),
        SalesModule.forRoot({
          receiptSecret:
            env.RECEIPT_SIGNING_SECRET ??
            createHash("sha256").update(`wadar-receipt:${env.DATABASE_URL}`).digest("base64url"),
        }),
      ],
    };
  }
}
