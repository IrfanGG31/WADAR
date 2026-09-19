/**
 * The 5 fixed system roles (docs/ARCHITECTURE.md §9) — seeded for every
 * tenant at creation (`application/create-tenant.ts`). M1 scope has no
 * custom/dynamic roles (docs/BUILD-PLAN.md M1 cakupan) — see
 * `packages/contracts/src/identity/schemas.ts`'s `SystemRoleKey` for the
 * wire-level duplicate of these same 5 values.
 */
export enum SystemRole {
  Owner = "owner",
  Manager = "manager",
  Cashier = "cashier",
  ChatAdmin = "chat_admin",
  Warehouse = "warehouse",
}

export const SYSTEM_ROLES: readonly SystemRole[] = [
  SystemRole.Owner,
  SystemRole.Manager,
  SystemRole.Cashier,
  SystemRole.ChatAdmin,
  SystemRole.Warehouse,
];

/** Bahasa Indonesia sehari-hari display names (CLAUDE.md konvensi — teks UI). */
export const SYSTEM_ROLE_DISPLAY_NAME: Record<SystemRole, string> = {
  [SystemRole.Owner]: "Pemilik",
  [SystemRole.Manager]: "Manajer",
  [SystemRole.Cashier]: "Kasir",
  [SystemRole.ChatAdmin]: "Admin Chat",
  [SystemRole.Warehouse]: "Gudang",
};

/**
 * Capabilities a role can hold. M1 defines the set every later module's
 * routes will check via `@RequirePermission()` — a module that needs a new
 * capability adds a value here rather than inventing its own ad hoc string,
 * so `ROLE_PERMISSIONS` stays the single source of truth for "who can do
 * what" (docs/ARCHITECTURE.md §9).
 */
export enum Permission {
  FinanceView = "finance:view",
  FinanceManage = "finance:manage",
  CatalogManage = "catalog:manage",
  InventoryManage = "inventory:manage",
  OrdersManage = "orders:manage",
  PurchasingManage = "purchasing:manage",
  CashierOperate = "cashier:operate",
  AssistantUse = "assistant:use",
  AssistantManage = "assistant:manage",
  TeamManage = "team:manage",
  SettingsManage = "settings:manage",
}

const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/**
 * Static permission-per-role map (design decision #5 in the M1 plan):
 * simpler than a dynamic per-tenant permission table, sufficient for M1's
 * scope, and doesn't block a dynamic RBAC system later if ever needed.
 *
 * - Pemilik (Owner): semuanya.
 * - Manajer: operasional penuh + tim, TAPI tidak bisa ubah konfigurasi
 *   finansial inti atau pengaturan toko (tetap wewenang Pemilik).
 * - Kasir: POS + pesanan + tanya asisten saja.
 * - Admin Chat: kelola & pakai asisten AI saja.
 * - Gudang: stok + pembelian saja.
 */
export const ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  [SystemRole.Owner]: ALL_PERMISSIONS,
  [SystemRole.Manager]: [
    Permission.FinanceView,
    Permission.CatalogManage,
    Permission.InventoryManage,
    Permission.OrdersManage,
    Permission.PurchasingManage,
    Permission.CashierOperate,
    Permission.AssistantUse,
    Permission.AssistantManage,
    Permission.TeamManage,
  ],
  [SystemRole.Cashier]: [Permission.CashierOperate, Permission.OrdersManage, Permission.AssistantUse],
  [SystemRole.ChatAdmin]: [Permission.AssistantUse, Permission.AssistantManage],
  [SystemRole.Warehouse]: [Permission.InventoryManage, Permission.PurchasingManage],
};

export function permissionsForRole(role: SystemRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: SystemRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
