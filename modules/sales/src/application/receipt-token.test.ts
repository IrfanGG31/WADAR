import { describe, expect, it } from "vitest";
import { signReceiptToken, verifyReceiptToken } from "./receipt-token.js";

const tenant = "01a0df39-a7cd-724e-b107-95005d6b51d9";
const order = "01a0df39-a7ef-70f0-a2f3-dcbd23f05e48";

describe("receipt token", () => {
  it("round-trips", () => {
    expect(verifyReceiptToken("s3cret", signReceiptToken("s3cret", tenant, order))).toEqual({ tenantId: tenant, orderId: order });
  });

  it("rejects a tampered body, a wrong secret and garbage", () => {
    const token = signReceiptToken("s3cret", tenant, order);
    const [, sig] = token.split(".");
    const otherOrder = Buffer.from((tenant + "01a0df390000" + "70f0a2f3dcbd23f05e48").replaceAll("-", ""), "hex").toString("base64url");
    const forged = `${otherOrder}.${sig}`;
    expect(token.length).toBeLessThan(100);
    expect(verifyReceiptToken("s3cret", forged)).toBeNull();
    expect(verifyReceiptToken("other", token)).toBeNull();
    expect(verifyReceiptToken("s3cret", "nope")).toBeNull();
  });
});
