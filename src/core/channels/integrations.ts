/**
 * Pengaturan › Integrasi: every outside connection the product plans, what the owner will need to
 * fill in, and its state. Only the web chat widget and CSV marketplace import exist today; the rest
 * are listed so the setup shape is agreed before the connector is built (no secrets stored yet).
 */
export type IntegrationStatus = "aktif" | "manual" | "segera";

export interface IntegrationField {
  key: string;
  label: string;
  hint?: string;
  secret?: boolean;
}

export interface Integration {
  key: string;
  name: string;
  group: "chat" | "marketplace" | "pembayaran";
  status: IntegrationStatus;
  description: string;
  /** Page under /<slug>/ to use it today, when there is one. */
  page?: string;
  /** What the owner will enter when the connector arrives. */
  fields: IntegrationField[];
}

export const INTEGRATIONS: readonly Integration[] = [
  {
    key: "widget",
    name: "Chat di web (tautan toko)",
    group: "chat",
    status: "aktif",
    description: "Pembeli chat lewat tautan toko; asisten menjawab dari produk, kebijakan, FAQ, dan dokumen.",
    page: "pengaturan",
    fields: [],
  },
  {
    key: "whatsapp",
    name: "WhatsApp Business",
    group: "chat",
    status: "segera",
    description: "Asisten membalas chat WhatsApp pembeli dan meneruskan ke kamu kalau perlu.",
    fields: [
      { key: "phone_number_id", label: "Phone Number ID", hint: "Dari Meta Business › WhatsApp Manager" },
      { key: "business_account_id", label: "WhatsApp Business Account ID" },
      { key: "access_token", label: "Access token permanen", secret: true },
      { key: "app_secret", label: "App secret (cek tanda tangan webhook)", secret: true },
    ],
  },
  {
    key: "telegram",
    name: "Telegram",
    group: "chat",
    status: "segera",
    description: "Bot Telegram toko yang dijawab asisten.",
    fields: [
      { key: "bot_token", label: "Token bot dari @BotFather", secret: true },
      { key: "bot_username", label: "Username bot", hint: "mis. glowbysari_bot" },
    ],
  },
  {
    key: "shopee",
    name: "Shopee",
    group: "marketplace",
    status: "manual",
    description: "Sekarang: impor file pesanan dari Seller Center. Nanti: tarik pesanan otomatis lewat Shopee Open Platform.",
    page: "kasir/marketplace",
    fields: [{ key: "shop_id", label: "Shop ID" }, { key: "partner_auth", label: "Otorisasi toko", hint: "Login Shopee saat terhubung" }],
  },
  {
    key: "tiktok_shop",
    name: "TikTok Shop",
    group: "marketplace",
    status: "manual",
    description: "Sekarang: impor file pesanan. Nanti: sinkron otomatis lewat TikTok Shop Partner API.",
    page: "kasir/marketplace",
    fields: [{ key: "shop_cipher", label: "Toko TikTok", hint: "Dipilih saat login TikTok Shop" }],
  },
  {
    key: "tokopedia",
    name: "Tokopedia",
    group: "marketplace",
    status: "manual",
    description: "Sekarang: impor file pesanan dari Seller Center.",
    page: "kasir/marketplace",
    fields: [],
  },
  {
    key: "qris",
    name: "QRIS dinamis",
    group: "pembayaran",
    status: "segera",
    description: "QR per transaksi yang otomatis tercatat lunas di Kasir. Sekarang: QRIS statis dicatat manual.",
    fields: [{ key: "merchant_id", label: "Merchant ID penyedia pembayaran" }, { key: "api_key", label: "API key", secret: true }],
  },
];

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  aktif: "Aktif",
  manual: "Lewat file",
  segera: "Belum terhubung",
};
