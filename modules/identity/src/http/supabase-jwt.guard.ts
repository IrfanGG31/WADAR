import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { IDENTITY_JWT_OPTIONS } from "./tokens.js";

export interface SupabaseJwtGuardOptions {
  /**
   * Supabase project JWT signing mode — per-project, must be verified, not
   * assumed (a project's `/auth/v1/jwks` endpoint is empty if it's still
   * HS256). See docs/adr and the M1 plan's dependency table for why this
   * isn't hardcoded to one mode.
   */
  mode: "jwks" | "hs256";
  jwksUrl?: string;
  hs256Secret?: string;
}

export interface AuthenticatedUser {
  id: string;
  email?: string;
  phone?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

function unauthorized(detail: string, code: string) {
  return { type: "about:blank", title: "Unauthorized", status: 401, detail, code };
}

/**
 * Verifies the Supabase-issued JWT directly with `jose` — deliberately no
 * `@nestjs/passport`/`passport-jwt` (design decision #4 in the M1 plan):
 * Passport's multi-strategy abstraction is overhead a single JWT-verification
 * strategy doesn't need.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private readonly jwks?: JWTVerifyGetKey;
  private readonly hs256Key?: Uint8Array;

  constructor(@Inject(IDENTITY_JWT_OPTIONS) private readonly options: SupabaseJwtGuardOptions) {
    if (options.mode === "jwks") {
      if (!options.jwksUrl) {
        throw new Error("SUPABASE_JWKS_URL is required when SUPABASE_JWT_MODE=jwks");
      }
      this.jwks = createRemoteJWKSet(new URL(options.jwksUrl));
    } else {
      if (!options.hs256Secret) {
        throw new Error("SUPABASE_JWT_SECRET is required when SUPABASE_JWT_MODE=hs256");
      }
      this.hs256Key = new TextEncoder().encode(options.hs256Secret);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException(unauthorized("Missing Authorization header", "AUTH_MISSING"));
    }
    const token = authHeader.slice("Bearer ".length);

    try {
      const { payload } =
        this.options.mode === "jwks"
          ? await jwtVerify(token, this.jwks!)
          : await jwtVerify(token, this.hs256Key!);

      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new Error("token has no sub claim");
      }

      request.user = {
        id: payload.sub,
        email: typeof payload.email === "string" ? payload.email : undefined,
        phone: typeof payload.phone === "string" ? payload.phone : undefined,
      };
      return true;
    } catch {
      throw new UnauthorizedException(unauthorized("Invalid or expired token", "AUTH_INVALID_TOKEN"));
    }
  }
}
