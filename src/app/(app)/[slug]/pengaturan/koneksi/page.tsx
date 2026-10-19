import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getAi } from "@/ai";
import { CopyButton } from "@/components/copy-button";
import { PageGate } from "@/components/shell/page-gate";
import { getAgentSettings, listOpenAgentTasks } from "@/db/agent";
import { getAiProviderSettings, isConnectHubInstalled } from "@/db/ai-provider";
import { listApiKeys } from "@/db/api-keys";
import { listChannelConnections, whatsappVerifyToken, type ChannelConnectionView } from "@/db/channel-connections";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { requestOrigin } from "@/lib/request-origin";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { AgentSettingsForm } from "./agent-settings-form";
import { AiProviderForm } from "./ai-provider-form";
import { ApiKeyManager } from "./api-key-manager";
import { TelegramConnect, WhatsAppConnect, type ConnectorView } from "./channel-connect";
import { SchemaPendingNotice } from "./schema-pending-notice";
import { Step, type StepState } from "./step";

export const metadata = { title: "Pusat Koneksi" };

type Params = PageProps<"/[slug]/pengaturan/koneksi">["params"];

/** Pusat Koneksi (ADR-003): every connection in one guided list — AI brain, chat, API, WA/Telegram, marketplace, Autopilot. */
export default function KoneksiPage({ params }: PageProps<"/[slug]/pengaturan/koneksi">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Suspense fallback={<div className="h-11 w-28" aria-hidden />}>
          <BackLink params={params} />
        </Suspense>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Pusat Koneksi</h1>
        <p className="text-sm text-muted-foreground">
          Sambungkan sekali, setelah itu berjalan sendiri. Ikuti langkah dari atas; tiap langkah punya tombol tes.
        </p>
      </div>
      <Suspense fallback={<div className="h-[40rem] animate-pulse rounded-2xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="settings">
          <Steps params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function BackLink({ params }: { params: Params }) {
  const { slug } = await params;
  return (
    <Link href={shopPath(slug, "pengaturan")} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" aria-hidden /> Pengaturan
    </Link>
  );
}

function Code({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-navy p-4 pr-24 text-xs leading-relaxed text-white">
        <code>{children}</code>
      </pre>
      <CopyButton text={children} className="absolute right-2 top-2 bg-background" />
    </div>
  );
}

async function Steps({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const { origin } = await requestOrigin();
  const supabase = await createClient();
  const [installed, ai, keys, agent, tasks, outsideChats, imports, connectors] = await Promise.all([
    isConnectHubInstalled(),
    getAiProviderSettings(shop.id),
    listApiKeys(shop.id),
    getAgentSettings(shop.id),
    listOpenAgentTasks(shop.id),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", shop.id).in("channel", ["whatsapp", "telegram", "api"]),
    supabase.from("marketplace_imports").select("id", { count: "exact", head: true }).eq("tenant_id", shop.id),
    listChannelConnections(shop.id),
  ]);
  const activeKeys = keys.filter((k) => !k.revoked_at);
  const messageKey = activeKeys.some((k) => k.scopes.includes("messages:write"));
  const orderKey = activeKeys.some((k) => k.scopes.includes("orders:write"));
  const defaultAiOk = getAi().offlineReason() === null;
  const connectorView = async (c: ChannelConnectionView | undefined): Promise<ConnectorView | null> =>
    c
      ? {
          kind: c.kind,
          label: c.label,
          status: c.status,
          last_error: c.last_error,
          last_event_label: c.last_event_at ? formatDateTime(c.last_event_at, shop.timezone) : null,
          username: c.settings.username,
          ...(c.kind === "whatsapp" ? { callback_url: `${origin}/api/channels/whatsapp/${c.id}`, verify_token: await whatsappVerifyToken(c.id) } : {}),
        }
      : null;
  const [telegram, whatsapp] = await Promise.all([
    connectorView(connectors.connections.find((c) => c.kind === "telegram")),
    connectorView(connectors.connections.find((c) => c.kind === "whatsapp")),
  ]);
  const connectorActive = connectors.connections.some((c) => c.status === "active");

  const states: Record<string, StepState> = {
    ai: ai?.enabled && ai.last_test_ok ? "done" : defaultAiOk ? "ready" : "todo",
    chat: "done",
    api: activeKeys.length ? "done" : "todo",
    wa: connectorActive || (outsideChats.count ?? 0) > 0 ? "done" : connectors.connections.length || messageKey ? "ready" : "todo",
    marketplace: (imports.count ?? 0) > 0 || orderKey ? "done" : "ready",
    agent: agent.enabled ? "done" : "todo",
  };
  const doneCount = Object.values(states).filter((s) => s === "done").length;
  const total = Object.keys(states).length;
  const keyPlaceholder = "wdr_xxxxxxxx_KUNCI_ANDA";

  return (
    <div className="flex flex-col gap-5">
      {!installed && <SchemaPendingNotice />}
      <div className="flex flex-col gap-2 rounded-2xl border border-border p-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-navy">
            {doneCount} dari {total} tersambung
          </p>
          <p className="text-xs text-muted-foreground">Tersimpan otomatis</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((doneCount / total) * 100)}%` }} />
        </div>
        <nav className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="Langkah">
          {[
            ["ai", "Otak AI"],
            ["chat", "Chat web"],
            ["api", "API WADAR"],
            ["wa", "WhatsApp & Telegram"],
            ["marketplace", "Marketplace"],
            ["agent", "Autopilot"],
          ].map(([id, label], i) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-border bg-card px-3 py-1.5 hover:bg-muted">
              {i + 1}. {label}
            </a>
          ))}
        </nav>
      </div>

      <Step
        n={1}
        id="ai"
        title="Otak AI"
        state={states.ai as StepState}
        why={
          ai
            ? "Model pilihanmu yang menjawab pembeli dan Konsultasi Bisnis. Kalau sedang gangguan, WADAR otomatis pindah ke AI bawaan."
            : defaultAiOk
              ? "Sekarang memakai AI bawaan WADAR. Mau pakai akun AI sendiri (OpenAI, Gemini, OpenRouter, Groq, DeepSeek, server sendiri)? Isi di bawah."
              : "AI bawaan belum aktif di server ini, jadi jawaban memakai templat. Isi akun AI sendiri supaya jawaban lebih pintar."
        }
        tutorial={[
          <>Pilih penyedia di bawah, lalu klik <b>Ambil API key</b>. Daftar atau masuk di situs penyedia.</>,
          <>Buat API key baru, salin. Pastikan akun punya saldo/kuota.</>,
          <>Salin satu nama model dari daftar model penyedia (contoh petunjuknya ada di bawah kolom).</>,
          <>Tempel API key dan nama model di sini, lalu klik <b>Tes & simpan</b>. Kalau berhasil, langsung aktif.</>,
        ]}
      >
        <AiProviderForm
          current={
            ai
              ? {
                  base_url: ai.base_url,
                  chat_model: ai.chat_model,
                  api_key_hint: ai.api_key_hint,
                  enabled: ai.enabled,
                  last_test_ok: ai.last_test_ok,
                  last_test_error: ai.last_test_error,
                  last_test_label: ai.last_test_at ? formatDateTime(ai.last_test_at, shop.timezone) : null,
                }
              : null
          }
        />
      </Step>

      <Step n={2} id="chat" title="Chat pembeli di web" state="done" why="Sudah aktif. Bagikan tautan ini di bio Instagram, TikTok, atau katalog WhatsApp; asisten menjawab 24 jam.">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-3 py-2 text-sm">{`${origin}/w/${slug}`}</code>
          <CopyButton text={`${origin}/w/${slug}`} label="Salin tautan" />
        </div>
      </Step>

      <Step
        n={3}
        id="api"
        title="API WADAR"
        state={states.api as StepState}
        why="Kunci untuk aplikasi atau agent lain (bot WA, n8n, Make, Zapier, sinkron marketplace). Satu kunci = satu aplikasi, bisa dicabut kapan saja."
        tutorial={[
          <>Beri nama sesuai aplikasinya, centang izin yang perlu saja, klik <b>Buat API key</b>.</>,
          <>Salin kunci yang muncul dan simpan di aplikasi tujuan. Kunci hanya tampil sekali.</>,
          <>
            Di aplikasi tujuan, isi <b>Base URL</b> <code className="rounded bg-background px-1">{`${origin}/api/v1`}</code> dan header{" "}
            <code className="rounded bg-background px-1">Authorization: Bearer &lt;kunci&gt;</code>.
          </>,
          <>Kalau aplikasi itu tidak dipakai lagi, klik <b>Cabut</b>. Kuncinya langsung berhenti bekerja.</>,
        ]}
      >
        <div className="flex flex-col gap-5">
          <ApiKeyManager
            keys={keys.map((k) => ({
              id: k.id,
              name: k.name,
              prefix: k.prefix,
              scopes: k.scopes,
              created_label: formatDateTime(k.created_at, shop.timezone),
              used_label: k.last_used_at ? formatDateTime(k.last_used_at, shop.timezone) : null,
              revoked: Boolean(k.revoked_at),
            }))}
          />
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Endpoint</th>
                  <th className="px-3 py-2 font-medium">Untuk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["POST /api/v1/messages", "Teruskan pesan pembeli, terima balasan AI"],
                  ["GET /api/v1/messages?since=…", "Ambil balasan yang kamu tulis dari inbox"],
                  ["POST /api/v1/orders", "Kirim pesanan (stok & keuangan ikut jalan)"],
                  ["GET /api/v1/products", "Daftar produk, harga, stok"],
                  ["GET /api/v1/summary", "Penjualan hari ini & stok menipis"],
                ].map(([path, use]) => (
                  <tr key={path}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{path}</td>
                    <td className="px-3 py-2 text-muted-foreground">{use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Step>

      <Step
        n={4}
        id="wa"
        title="WhatsApp & Telegram"
        state={states.wa as StepState}
        why="Pembeli chat ke bot Telegram atau nomor WhatsApp bisnismu, asisten toko menjawab di sana. Yang perlu kamu tangani muncul di menu Chat, dan balasanmu terkirim balik otomatis."
      >
        <div className="flex flex-col gap-4">
          {connectors.installed ? (
            <div className="flex flex-col gap-4">
              <TelegramConnect view={telegram} />
              <WhatsAppConnect view={whatsapp} />
            </div>
          ) : (
            <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Sambungan langsung ke Telegram dan WhatsApp menunggu pembaruan database. Sementara itu, bot yang sudah kamu punya bisa memakai cara lewat API di
              bawah.
            </p>
          )}
          <details className="group rounded-xl border border-border p-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-navy">Punya bot atau alur n8n/Make sendiri? Sambungkan lewat API</summary>
            <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">
              <li>
                Buat API key di langkah 3 dengan izin <b>Chat pembeli</b>.
              </li>
              <li>
                Di bot, setiap ada pesan masuk: kirim ke endpoint di bawah, lalu kirim isi <code className="rounded bg-surface px-1">reply</code> ke pembeli.
              </li>
              <li>
                Kalau balasannya <code className="rounded bg-surface px-1">mode: &quot;human&quot;</code>, chat sudah diteruskan ke kamu. Bot cukup memanggil GET
                tiap beberapa detik untuk mengirim jawabanmu.
              </li>
            </ol>
            <div className="mt-3">
              <Code>{`curl -X POST ${origin}/api/v1/messages \\
  -H "Authorization: Bearer ${keyPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{"channel":"whatsapp","from":"+6281234567890","message_id":"wamid.123","text":"Kak, serum vit c ready?"}'

# Jawaban: {"reply":"Serum Vit C 20ml ready Kak…","mode":"ai","duplicate":false}`}</Code>
            </div>
          </details>
        </div>
      </Step>

      <Step
        n={5}
        id="marketplace"
        title="Marketplace"
        state={states.marketplace as StepState}
        why="Pesanan Shopee, TikTok Shop, dan Tokopedia masuk ke penjualan: stok berkurang, komisi dihitung, untung per kanal ikut benar."
        tutorial={[
          <>
            Cara cepat: unduh laporan pesanan (CSV) dari Seller Center, lalu impor di{" "}
            <Link href={shopPath(slug, "kasir/marketplace")} className="font-medium text-primary hover:underline">
              Transaksi › Marketplace
            </Link>
            .
          </>,
          <>Otomatis: alat sinkron pesananmu (atau n8n/Make) mengirim pesanan ke endpoint di bawah dengan kunci berizin <b>Kirim pesanan</b>.</>,
          <>Pesanan yang sama tidak tercatat dua kali, jadi aman dikirim ulang.</>,
        ]}
      >
        <Code>{`curl -X POST ${origin}/api/v1/orders \\
  -H "Authorization: Bearer ${keyPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{"channel":"shopee","orders":[{"external_order_id":"2610180A1B2C3D","items":[{"sku":"SERU-001","qty":2,"unit_price":89000}]}]}'`}</Code>
      </Step>

      <Step
        n={6}
        id="agent"
        title="Autopilot"
        state={states.agent as StepState}
        why="Agent yang menyiapkan pekerjaan rutin: pesanan ulang ke pemasok dan FAQ baru. Kamu tinggal satu ketuk; yang sudah tidak perlu hilang sendiri."
      >
        <AgentSettingsForm settings={agent} openTasks={tasks.length} />
      </Step>
    </div>
  );
}
