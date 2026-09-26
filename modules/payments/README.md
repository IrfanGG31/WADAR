# modules/payments — Payment Listener (PRD F1, ARCHITECTURE §6)

## Alur QRIS di Kasir
1. Kasir menyelesaikan pesanan dengan metode QRIS → pesanan tercatat **belum lunas** (piutang).
2. `POST /v1/payments/qris {orderId}` membuat *payment intent* untuk sisa tagihan (dipakai ulang kalau masih ada intent pending yang belum kedaluwarsa).
3. Pembeli membayar → webhook `POST /v1/webhooks/xendit` (token `x-callback-token` dicek *constant-time*) → `provider_events` (unik per event id penyedia = anti-duplikat) → `incoming_payments` → event `payments.payment.received`.
4. Konsumen: `sales` (tandai lunas → `sales.order.paid`), `finance` (Dr dompet QRIS / Cr piutang), `notification` (push realtime + kalimat TTS).
5. Job `payments-reconcile` (15 menit) menarik status QR yang masih pending dari penyedia (kalau webhook hilang) dan meng-expire intent yang lewat waktu.

## Mode
| `PAYMENTS_PROVIDER` | Perilaku |
|---|---|
| `simulator` (default) | Tidak ada uang sungguhan. QR berisi payload tiruan; tombol **"Simulasikan bayar"** di Kasir menjalankan jalur pemrosesan yang SAMA dengan webhook asli. |
| `xendit` | Xendit QR Codes API (`api-version: 2022-07-31`). Butuh `XENDIT_SECRET_KEY` + `XENDIT_CALLBACK_TOKEN`; boot gagal keras kalau salah satu kosong. Gunakan **kunci test** dulu. Daftarkan URL callback QR ke `https://<api>/v1/webhooks/xendit`. |

## ⚠️ Wajib sebelum menerima uang sungguhan (xenPlatform)
Menerima dana **atas nama merchant** harus memakai skema platform/sub-akun (Xendit **xenPlatform**): setiap toko = sub-akun, QR dibuat dengan header `for-user-id: <sub-account id>`, sehingga dana mengalir ke rekening merchant — **bukan** ke rekening WADAR (ARCHITECTURE §6.1, CLAUDE.md catatan terbuka). Implementasi saat ini memakai satu akun (cocok untuk mode test/pilot internal). Sebelum go-live:
1. Validasi skema xenPlatform + persyaratan KYC merchant dengan Xendit.
2. Simpan `xendit_sub_account_id` per tenant (tabel baru di modul ini) dan kirim `for-user-id` di `XenditProvider.createQris`.
3. Callback xenPlatform membawa `business_id`/`for-user-id` — cocokkan dengan tenant selain `reference_id`.

## Belum dibangun (sengaja)
- Parser teks notifikasi bank/e-wallet (`packages/payment-parser`, PRD F1.3 — P1).
- Pencocokan otomatis uang masuk tanpa intent ↔ pesanan (F1.4 — P1).
