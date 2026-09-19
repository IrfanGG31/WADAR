# CLAUDE.md — WADAR

Instruksi proyek untuk Claude Code. Baca file ini di awal setiap sesi.

## Apa ini
WADAR (nama kerja) = asisten bisnis AI untuk UMKM Indonesia dengan 3 pilar:
1. **Keuangan Otomatis** — payment listener, ledger, dasbor untung riil untuk orang awam.
2. **Operasional Terpadu** — POS, stok, pesanan lintas kanal, CRM, pembelian.
3. **Asisten Chat Cerdas** — Business Brain dengan memori + kondisi bisnis realtime, untuk pemilik dan pembeli (WhatsApp).

Dokumen acuan (baca bagian relevan sebelum mengerjakan tugas):
- `docs/PRD.md` — apa & kenapa (ID fitur seperti F1.2, O2.1, A2.4 dipakai di commit/PR).
- `docs/ARCHITECTURE.md` — bagaimana (bounded context, event, data, AI, keamanan).
- `docs/BUILD-PLAN.md` — urutan milestone + Definition of Done.
- `docs/COMPETITORS.md` — acuan fitur/UX kompetitor: pola yang ditiru (U1–U12), anti-pola, dan usulan perubahan PRD (R1–R7).

## Stack
pnpm + Turborepo · Next.js 15 (web PWA) · Expo (mobile, v2) · NestJS + Fastify (api, worker) · Drizzle ORM · Supabase (Postgres + pgvector, Auth, Realtime, Storage) · Redis + BullMQ · Vercel AI SDK · Zod · Vitest · Playwright · Testcontainers.

## Perintah
```bash
pnpm dev            # web + api + worker
pnpm test           # unit + integration
pnpm lint && pnpm typecheck && pnpm depcruise
pnpm db:generate    # drizzle migration dari schema
pnpm db:migrate
pnpm evals          # evaluasi AI (golden set)
docker compose -f infra/docker-compose.yml up -d
```
(Perbarui bagian ini jika perintah berubah.)

## Aturan Wajib (jangan dilanggar)
1. **Batas modul.** Kode di `modules/A` hanya boleh mengimpor `modules/B/public.ts`, `modules/platform/public.ts`, dan `packages/*`. Tidak ada query/JOIN ke tabel modul lain. Butuh data modul lain → port sinkron; butuh efek samping → event.
2. **Tenant di mana-mana.** Setiap tabel domain punya `tenant_id`; setiap query dijalankan dalam konteks tenant (`set_config('app.tenant_id')`). Setiap route baru harus tercakup tes isolasi tenant.
3. **Uang = BIGINT rupiah.** Tidak ada float untuk nominal. Format hanya di layer UI (`@wadar/core/money`).
4. **Transaksi append-only.** Order, pembayaran, jurnal, pergerakan stok tidak di-update/hapus; koreksi = entri pembalik/void dengan audit log.
5. **Event lewat outbox.** Tulis perubahan + baris outbox dalam satu transaksi. Semua handler idempoten (`processed_events`).
6. **Idempotency-Key** wajib untuk POST yang membuat transaksi.
7. **AI tidak akses DB langsung.** Kemampuan AI = tool bertipe (Zod) di `modules/brain/tools` yang memanggil port modul dengan cek izin. Aksi tulis = action proposal yang butuh persetujuan (kecuali aturan auto-approve eksplisit).
8. **Angka AI harus ter-grounding.** Jangan menonaktifkan guardrail numeric grounding atau filter data internal mode customer.
9. **Validasi semua input** dengan skema dari `packages/contracts`; kontrak API & event hanya didefinisikan di sana.
10. **Brand terpusat.** Nama produk, tagline, warna, copy brand hanya dari `packages/brand` — jangan hardcode "WADAR" di fitur.
11. **Rahasia** tidak pernah di-commit; tambahkan ke `.env.example` dengan nilai kosong.

## Konvensi
- Kode, nama variabel, komentar: **Bahasa Inggris**. Teks UI & pesan pengguna: **Bahasa Indonesia sehari-hari** (lihat PRD §4 — "Uang masuk", "Untung bersih", bukan istilah akuntansi).
- Struktur modul: `public.ts`, `domain/`, `application/`, `infra/`, `http/`, `db/schema.ts`.
- Nama event: `<module>.<aggregate>.<pastTenseVerb>` (mis. `sales.order.completed`), payload berversi.
- ID: UUIDv7. Waktu: `timestamptz`, zona waktu tenant untuk tampilan.
- Error API: RFC 7807 dengan `code` dan `correlationId`.
- Commit: `feat(sales): complete order with idempotency [O2.1]`.
- Tes: domain logic → unit; handler/port/DB → integration (Testcontainers); alur pengguna inti → Playwright.

## Cara Bekerja
- Mulai tugas besar dengan rencana (plan mode) yang menyebut file yang akan diubah dan tes yang akan ditulis; tunggu persetujuan.
- Periksa versi stabil terbaru pustaka sebelum memasang dependensi baru.
- Sebelum menyatakan selesai: jalankan lint, typecheck, test, depcruise; sebutkan hasilnya.
- Keputusan arsitektur baru → tulis ADR pendek di `docs/adr/`.
- Jika instruksi pengguna bertentangan dengan aturan wajib di atas, jelaskan konfliknya dan tawarkan alternatif — jangan diam-diam melanggar.

## Status
- Milestone saat ini: **M0 — belum dimulai**
- Terakhir selesai: —
- Catatan terbuka: nama brand masih bisa berubah; validasi skema sub-akun Xendit sebelum M5.
