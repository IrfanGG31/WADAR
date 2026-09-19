import { describe, expect, it } from "vitest";
import {
  Permission,
  ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_DISPLAY_NAME,
  SystemRole,
  permissionsForRole,
  roleHasPermission,
} from "./role.js";

describe("ROLE_PERMISSIONS", () => {
  it("seeds exactly the 5 fixed system roles, each with a display name", () => {
    expect(SYSTEM_ROLES).toHaveLength(5);
    for (const role of SYSTEM_ROLES) {
      expect(SYSTEM_ROLE_DISPLAY_NAME[role]).toBeTruthy();
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it("Owner has every permission", () => {
    const allPermissions = Object.values(Permission);
    expect(new Set(permissionsForRole(SystemRole.Owner))).toEqual(new Set(allPermissions));
  });

  it("Manager can manage the team but not finance or settings", () => {
    expect(roleHasPermission(SystemRole.Manager, Permission.TeamManage)).toBe(true);
    expect(roleHasPermission(SystemRole.Manager, Permission.FinanceManage)).toBe(false);
    expect(roleHasPermission(SystemRole.Manager, Permission.SettingsManage)).toBe(false);
  });

  it("Cashier can only operate the register, handle orders, and use the assistant", () => {
    const cashierPermissions = permissionsForRole(SystemRole.Cashier);
    expect(cashierPermissions).toEqual(
      expect.arrayContaining([Permission.CashierOperate, Permission.OrdersManage, Permission.AssistantUse]),
    );
    expect(roleHasPermission(SystemRole.Cashier, Permission.TeamManage)).toBe(false);
    expect(roleHasPermission(SystemRole.Cashier, Permission.SettingsManage)).toBe(false);
    expect(roleHasPermission(SystemRole.Cashier, Permission.FinanceView)).toBe(false);
  });

  it("Admin Chat can only touch the assistant, not finance/team/operations", () => {
    const chatAdminPermissions = permissionsForRole(SystemRole.ChatAdmin);
    expect(chatAdminPermissions).toEqual(
      expect.arrayContaining([Permission.AssistantUse, Permission.AssistantManage]),
    );
    expect(chatAdminPermissions).toHaveLength(2);
  });

  it("Gudang (Warehouse) can only manage inventory and purchasing", () => {
    const warehousePermissions = permissionsForRole(SystemRole.Warehouse);
    expect(warehousePermissions).toEqual(
      expect.arrayContaining([Permission.InventoryManage, Permission.PurchasingManage]),
    );
    expect(warehousePermissions).toHaveLength(2);
    expect(roleHasPermission(SystemRole.Warehouse, Permission.CashierOperate)).toBe(false);
  });

  it("no non-owner role gets every permission (Owner is a strict superset for M1's roles)", () => {
    for (const role of SYSTEM_ROLES) {
      if (role === SystemRole.Owner) continue;
      expect(permissionsForRole(role).length).toBeLessThan(permissionsForRole(SystemRole.Owner).length);
    }
  });
});
