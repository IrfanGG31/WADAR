import {
  Bot,
  Home,
  LineChart,
  MessagesSquare,
  MoreHorizontal,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { canOpenPage, type MemberRole } from "@/core/roles";

export interface NavItem {
  /** Page under the shop slug: /<slug>/<page>. */
  page: string;
  label: string;
  icon: LucideIcon;
  /** Other pages that should also light this item up (e.g. "Laporan" covers stok + keuangan). */
  alsoActiveOn?: string[];
}

/** PRD §7.2 — mobile bottom tabs (≤ 768px). */
export const MOBILE_NAV: NavItem[] = [
  { page: "beranda", label: "Beranda", icon: Home },
  { page: "kasir", label: "Transaksi", icon: Receipt },
  { page: "keuangan", label: "Laporan", icon: LineChart, alsoActiveOn: ["stok"] },
  { page: "chat", label: "Chat AI", icon: Bot, alsoActiveOn: ["konsultasi"] },
  { page: "lainnya", label: "Lainnya", icon: MoreHorizontal, alsoActiveOn: ["pelanggan", "pengaturan"] },
];

/** PRD §7.2 — desktop sidebar. */
export const DESKTOP_NAV: NavItem[] = [
  { page: "beranda", label: "Beranda", icon: Home },
  { page: "kasir", label: "Penjualan", icon: ShoppingCart },
  { page: "stok", label: "Stok", icon: Package },
  { page: "keuangan", label: "Keuangan", icon: Wallet },
  { page: "pelanggan", label: "Pelanggan", icon: Users },
  { page: "chat", label: "Chat AI", icon: Bot },
  { page: "konsultasi", label: "Konsultasi Bisnis", icon: MessagesSquare },
  { page: "pengaturan", label: "Pengaturan", icon: Settings },
];

/** Destinations listed on the mobile "Lainnya" page. */
export const MORE_NAV: NavItem[] = DESKTOP_NAV.filter((item) => !MOBILE_NAV.some((tab) => tab.page === item.page));

/** The items a role may open (CON-6): Keuangan, Konsultasi, Pengaturan… disappear for staff. */
export function navFor(items: NavItem[], role: MemberRole | null): NavItem[] {
  return items.filter((item) => canOpenPage(role, item.page));
}

/** The page segment of /<slug>/<page>/…, or undefined. */
export function currentPage(pathname: string): string | undefined {
  return pathname.split("/").filter(Boolean)[1];
}

export function isActive(item: NavItem, page: string | undefined): boolean {
  return page !== undefined && (item.page === page || (item.alsoActiveOn?.includes(page) ?? false));
}
