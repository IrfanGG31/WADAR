# WADAR v2 — Peta modul (pola Odoo, ukuran UMKM)

Status: rancangan disetujui untuk tahap 1 (Okt 2026). Keputusan: ADR-003.

## Prinsip

Odoo memisahkan bisnis menjadi **aplikasi** (Sales, Inventory, Accounting, CRM, Purchase, POS). Tiap aplikasi punya
modelnya sendiri, dan semuanya terhubung lewat beberapa model bersama (`product`, `res.partner`) dan **dokumen
penghubung** (`stock.move`, `account.move`). WADAR memakai pola yang sama, dengan dua penyesuaian untuk UMKM:

1. **Satu layar, banyak modul.** Pemilik tidak perlu tahu ada modul; Kasir sekaligus mengurangi stok, mencatat
   untung, dan memperbarui pelanggan.
2. **AI sebagai lapisan di atas, bukan di dalam modul.** Modul hanya menyimpan fakta dan menghitung angka
   (`src/core` + SQL). AI membaca hasilnya lewat *tools*/RAG dan tidak pernah menulis uang atau stok langsung.

## Modul dan pemilik datanya

| Modul WADAR | Padanan Odoo | Tabel yang dimiliki | Logika inti (murni + tes) | Menulis lewat |
|---|---|---|---|---|
| **Katalog** | Product | `products`, `variants`, `channel_prices`, `catalog_imports` | `catalog-schema`, `catalog-import` | RPC katalog, impor |
| **Persediaan** | Inventory | `stock_movements` (append-only), `variants.on_hand`, `stock_daily_rollup` | `stock`, `stock-insight`, `stock-level`, `expiry` | `stock_in`, `adjust_stock`, `stock_opname` |
| **Penjualan / POS** | Sales + POS | `sales`, `sale_items` (append-only), `channels`, `marketplace_imports` | `cart`, `sale-schema`, `sale-void`, `marketplace-import`, `channel-settings` | `record_sale`, `void_sale`, `import_marketplace_orders` |
| **Keuangan** | Accounting (ringan) | `expenses` (append-only), `fin_daily_rollup` | `money` (BigInt, largest remainder), `finance`, `finance-insight`, `expense` | `void_expense`, insert pengeluaran |
| **CRM** | Contacts + CRM | `customers` | `customers`, `customer-profile` | update terbatas kolom (nama, catatan, label) |
| **Pengetahuan (RAG)** | Knowledge | `kb_documents`, `kb_chunks` (pgvector + tsvector), `store_profile` | `chat/kb`, `chat/kb-doc`, `chat/retrieval`, `chat/store-policies` | FAQ, dokumen, profil toko |
| **Percakapan** | Discuss / Live chat | `conversations`, `messages`, `notifications` | `chat/pipeline`, `chat/guardrails`, `chat/widget-service` | pipeline chat |
| **Konsultasi** | (tidak ada di Odoo) | `memory_items`, `insights`, `weekly_insight_digests` | `consult/*` | tools baca-saja |
| **Koneksi** | Integrations / API | `ai_providers`, `api_keys` | `channels/ai-provider`, `channels/api-key`, `channels/api-orders`, `channels/adapter` | RPC pemilik, `api_*` |
| **Autopilot** | Automated actions | `agent_settings`, `agent_tasks` | `agent` (aturan, tanpa LLM) | cron + tutup tugas |
| **Platform** | Base | `tenants`, `memberships`, `shop_invites`, `audit_log` | `roles`, `audit` | RLS `app.is_member` / `app.has_shop_role` |

**Aturan batas:** sebuah modul hanya menulis tabel miliknya. Kalau satu kejadian menyentuh beberapa modul, satu
fungsi SQL transaksional yang menjadi "dokumen penghubung" (seperti `stock.move` di Odoo) menuliskannya sekaligus.

## Satu penjualan, semua lini (alur terintegrasi)

```
Kasir / impor marketplace / API orders
  └─ record_sale | import_marketplace_orders            (Penjualan, satu transaksi)
       ├─ sales + sale_items  (harga, diskon, komisi dialokasikan largest remainder, HPP saat terjual)
       ├─ stock_movements kind=sale  →  variants.on_hand  (Persediaan)
       ├─ customers.total_spent / orders_count            (CRM)
       └─ audit_log bila void / ubah harga                (Platform)
  → rollup harian  →  fin_daily_rollup / stock_daily_rollup   (Keuangan, Persediaan)
  → Beranda, Keuangan, prakiraan stok, insight mingguan        (dibaca, bukan ditulis)
  → Autopilot: draf pesan ulang bila prakiraan stok kritis      (agent_tasks)
```

## Lapisan AI

| Fungsi | Masukan | Model | Pengaman |
|---|---|---|---|
| Chat pembeli (RAG) | `chat_product_cards` (tanpa HPP), kebijakan, FAQ, dokumen | model toko → Gemini → templat offline | guardrail angka (harga/stok harus sama dengan data), filter data internal, eskalasi ke pemilik |
| Konsultasi Bisnis | tools baca-saja atas angka `src/core` | model toko → Gemini → templat | grounding: angka di jawaban harus ada di hasil tools |
| Insight mingguan | hasil `consult/insights` | sama | narasi saja; angka dari core |
| Autopilot | prakiraan stok, chat yang dioper | **tanpa LLM** | aturan deterministik; hanya draf, pemilik yang mengeksekusi |

`src/ai/models.ts` menentukan rute per tugas. Toko yang mengisi **Otak AI** (Pusat Koneksi) mendapat
`routesWithCustom()`: modelnya sendiri di depan, cadangan tetap ada. Embedding tetap di Gemini (768 dimensi) supaya
satu basis pengetahuan berada di satu ruang vektor.

## Tahap 2 (setelah demo)

1. **Pembelian (Purchase):** `suppliers`, `purchase_orders`, `purchase_order_lines`, penerimaan barang →
   `stock_movements kind=purchase`. Draf Autopilot berubah menjadi draf PO; batas nominal auto-kirim berlaku di sini.
2. **Jurnal double-entry:** `journal_entries` + `journal_lines` (trigger: debit = kredit, append-only) diisi dari
   penjualan, pembelian, dan pengeluaran. `fin_daily_rollup` tetap sebagai cache baca.
3. **Event outbox:** `outbox_events` ditulis di transaksi yang sama dengan perubahan; handler idempoten
   (`processed_events`) menggantikan pemanggilan lintas modul langsung. Webhook keluar untuk aplikasi luar.
4. **Konektor resmi:** WhatsApp Cloud API (`ChannelAdapter` whatsapp), Telegram Bot API, sinkron pesanan
   marketplace via OAuth seller center. Rahasia per toko memakai `src/lib/secret-box.ts`.
