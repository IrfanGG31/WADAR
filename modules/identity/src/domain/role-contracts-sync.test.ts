import { Permission as ContractPermission, SystemRoleKey } from "@wadar/contracts";
import { describe, expect, it } from "vitest";
import { Permission, SystemRole } from "./role.js";

/**
 * `packages/contracts` can't import `modules/identity` (packages must never
 * depend on modules/*, ARCHITECTURE §13), so its `SystemRoleKey`/`Permission`
 * wire enums are hand-duplicated from this file's `SystemRole`/`Permission`.
 * This test is the thing that actually keeps them honest — a value added
 * to one without the other fails here, not silently at runtime in
 * apps/web's nav filtering.
 */
describe("packages/contracts identity wire enums stay in sync with domain enums", () => {
  it("SystemRoleKey matches SystemRole exactly", () => {
    expect(new Set(SystemRoleKey.options)).toEqual(new Set(Object.values(SystemRole)));
  });

  it("Permission matches Permission exactly", () => {
    expect(new Set(ContractPermission.options)).toEqual(new Set(Object.values(Permission)));
  });
});
