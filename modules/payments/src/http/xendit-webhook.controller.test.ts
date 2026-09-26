import { HttpException } from "@nestjs/common";
import type { Db } from "@wadar/platform";
import { describe, expect, it } from "vitest";
import { XenditWebhookController } from "./xendit-webhook.controller.js";

const controller = (options: ConstructorParameters<typeof XenditWebhookController>[1]) =>
  new XenditWebhookController({} as Db, options);

describe("XenditWebhookController", () => {
  it("rejects a wrong or missing callback token with 403", async () => {
    const c = controller({ provider: "xendit", secretKey: "k", callbackToken: "right-token" });
    await expect(c.handle("wrong-token", {})).rejects.toBeInstanceOf(HttpException);
    await expect(c.handle(undefined, {})).rejects.toMatchObject({ status: 403 });
  });

  it("rejects everything while running in simulator mode", async () => {
    await expect(controller({ provider: "simulator" }).handle("anything", {})).rejects.toMatchObject({ status: 403 });
  });

  it("acknowledges non-payment events so Xendit stops retrying", async () => {
    const c = controller({ provider: "xendit", secretKey: "k", callbackToken: "t" });
    expect(await c.handle("t", { event: "qr.code.created" })).toEqual({ status: "ignored" });
    expect(await c.handle("t", { event: "qr.payment", data: { status: "FAILED" } })).toEqual({ status: "ignored" });
  });
});
