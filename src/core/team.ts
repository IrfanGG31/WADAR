import { z } from "zod";
import { ROLE_LABEL, type MemberRole } from "./roles";

/**
 * Team (TEAM-1): invite staff by link, change roles, revoke access. Pure — the server
 * actions in /<slug>/pengaturan/anggota call the SQL functions of 20261017070054_shop_invites.
 */

/** Roles an owner can hand out; a second owner is not part of the sprint. */
export const INVITABLE_ROLES = ["cashier", "chat_admin"] as const satisfies readonly MemberRole[];
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const ROLE_HINT: Record<InvitableRole, string> = {
  cashier: "Catat penjualan dan stok masuk. Tidak melihat keuangan, konsultasi, atau pengaturan.",
  chat_admin: "Balas chat pembeli dan terima notifikasi eskalasi.",
};

const role = z.enum(INVITABLE_ROLES, { error: "Pilih peran: kasir atau admin chat." });

export const InviteInput = z.object({
  email: z.string({ error: "Isi email anggota." }).trim().toLowerCase().max(254, "Email terlalu panjang.").email("Email belum benar."),
  role,
});

export const RoleChangeInput = z.object({
  userId: z.string().uuid("Anggota tidak ditemukan."),
  role: z.enum(["owner", "cashier", "chat_admin"], { error: "Peran tidak dikenal." }),
});

/** Invite links are hex tokens (two UUIDs, 64 chars); anything else is not worth a DB call. */
export function isInviteToken(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/** Path of the accept page; the client prefixes its own origin when copying. */
export function invitePath(token: string): string {
  return `/undangan/${token}`;
}

export type InviteStatus = "open" | "expired" | "used" | "revoked";

export const INVITE_STATUS_TEXT: Record<Exclude<InviteStatus, "open">, string> = {
  expired: "Tautan undangan ini sudah kedaluwarsa. Minta pemilik toko membuat undangan baru.",
  used: "Tautan undangan ini sudah dipakai.",
  revoked: "Undangan ini sudah dibatalkan pemilik toko.",
};

export function roleLabel(r: MemberRole): string {
  return ROLE_LABEL[r];
}

/** SQL error (Postgres code + message) of the team functions → what the owner / invitee reads. */
export function teamError(error: { code?: string; message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  switch (error?.code) {
    case "23505":
      return "Email ini sudah jadi anggota toko.";
    case "22023":
      if (msg.includes("expired")) return INVITE_STATUS_TEXT.expired;
      if (msg.includes("email")) return "Email belum benar.";
      return "Pilih peran: kasir atau admin chat.";
    case "P0002":
      if (msg.includes("member")) return "Anggota ini sudah tidak ada di toko.";
      if (msg.includes("used")) return INVITE_STATUS_TEXT.used;
      return "Undangan tidak ditemukan atau sudah dibatalkan.";
    case "42501":
      if (msg.includes("own role")) return "Kamu tidak bisa mengubah peranmu sendiri.";
      if (msg.includes("yourself")) return "Kamu tidak bisa mencabut aksesmu sendiri.";
      if (msg.includes("another email")) return "Undangan ini untuk email lain. Masuk dengan email yang diundang.";
      return "Hanya pemilik toko yang bisa mengatur anggota tim.";
    case "28000":
      return "Masuk dulu untuk menerima undangan.";
    default:
      return "Belum berhasil. Coba lagi sebentar.";
  }
}
