import type { ArgumentsHost } from "@nestjs/common";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Rfc7807Filter } from "./rfc7807.filter.js";

function createMockHost(headers: Record<string, string> = {}) {
  const response = {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  const request = { headers, url: "/v1/test" };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe("Rfc7807Filter", () => {
  it("passes through an HttpException's own RFC7807 body, adding correlationId", () => {
    const filter = new Rfc7807Filter();
    const { host, response } = createMockHost({ "x-correlation-id": "corr-1" });
    const exception = new ForbiddenException({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      detail: "Not a member of this tenant",
      code: "TENANT_FORBIDDEN",
    });

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: "TENANT_FORBIDDEN", correlationId: "corr-1", status: 403 }),
    );
  });

  it("maps a bare NotFoundException (string body) to an RFC7807 shape", () => {
    const filter = new Rfc7807Filter();
    const { host, response } = createMockHost({ "x-correlation-id": "corr-2" });

    filter.catch(new NotFoundException("nope"), host);

    expect(response.status).toHaveBeenCalledWith(404);
    const [body] = response.send.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({ status: 404, correlationId: "corr-2", detail: "nope" });
  });

  it("translates a raw Postgres SQLSTATE 42704 error into a 500 with a safe message (no stack trace leak)", () => {
    const filter = new Rfc7807Filter();
    const { host, response } = createMockHost({ "x-correlation-id": "corr-3" });
    const pgError = Object.assign(new Error('unrecognized configuration parameter "app.tenant_id"'), {
      code: "42704",
    });

    filter.catch(pgError, host);

    expect(response.status).toHaveBeenCalledWith(500);
    const [body] = response.send.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({ status: 500, code: "TENANT_CONTEXT_MISSING", correlationId: "corr-3" });
    expect(JSON.stringify(body)).not.toContain("app.tenant_id");
  });

  it("falls back to a generic 500 for a completely unknown thrown value", () => {
    const filter = new Rfc7807Filter();
    const { host, response } = createMockHost();

    filter.catch("not even an Error object", host);

    expect(response.status).toHaveBeenCalledWith(500);
    const [body] = response.send.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({ status: 500, code: "INTERNAL_ERROR", correlationId: "unknown" });
  });
});
