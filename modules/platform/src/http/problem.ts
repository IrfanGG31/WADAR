import { HttpException } from "@nestjs/common";

const TITLES: Record<number, string> = {
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  502: "Bad Gateway",
};

/**
 * RFC 7807 error (CLAUDE.md konvensi). `detail` is shown to end users by
 * apps/web, so write it in Bahasa Indonesia sehari-hari. `correlationId`
 * is added by apps/api's global filter.
 */
export function problem(status: number, code: string, detail: string, extra: Record<string, unknown> = {}): HttpException {
  return new HttpException(
    { type: "about:blank", title: TITLES[status] ?? "Error", status, detail, code, ...extra },
    status,
  );
}
