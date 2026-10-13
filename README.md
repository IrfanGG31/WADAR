# WADAR AI

PWA untuk UMKM lintas kanal: POS/CRM ringan + empat mesin AI (Stock Intelligence, Finance Insight, Customer Chat, Business Consultation). Aturan proyek ada di `CLAUDE.md`; dokumen produk di `docs/`.

## Menjalankan

```bash
cp .env.example .env.local   # isi NEXT_PUBLIC_SUPABASE_URL & NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm install
pnpm dev                     # http://localhost:3000
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

Kode versi 1 (monorepo NestJS + Next.js, milestone M0–M6) tersimpan di riwayat git, commit `59e2c54`.
