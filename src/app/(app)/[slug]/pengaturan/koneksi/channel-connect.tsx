"use client";

import { ChevronDown, ExternalLink, Loader2, MessageCircle, Send } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { connectTelegram, connectWhatsApp, disconnectChannel, reconnectTelegram, testChannel, type ChannelActionResult } from "./channel-actions";

export interface ConnectorView {
  kind: "telegram" | "whatsapp";
  label: string;
  status: "pending" | "active" | "error";
  last_error: string | null;
  last_event_label: string | null;
  username?: string;
  callback_url?: string;
  verify_token?: string | null;
}

type Message = { ok: boolean; text: string } | undefined;

function useConnectorAction() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [message, setMessage] = useState<Message>();
  const [pending, startTransition] = useTransition();
  const run = (fn: (slug: string) => Promise<ChannelActionResult>, onOk?: () => void) => {
    setMessage(undefined);
    startTransition(async () => {
      const r = await fn(slug);
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? "Tersimpan." });
      if (!r.error) onOk?.();
      router.refresh();
    });
  };
  return { message, pending, run };
}

function Status({ view }: { view: ConnectorView }) {
  const tone = view.status === "active" ? "bg-emerald-100 text-emerald-800" : view.status === "error" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900";
  const label = view.status === "active" ? "Aktif" : view.status === "error" ? "Bermasalah" : "Menunggu";
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>{label}</span>
        <span className="font-medium">{view.label}</span>
      </p>
      {view.status === "error" && view.last_error && <p className="text-destructive">{view.last_error}</p>}
      <p className="text-xs text-muted-foreground">{view.last_event_label ? `Pesan terakhir masuk ${view.last_event_label}` : "Belum ada pesan masuk."}</p>
    </div>
  );
}

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role="status" className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
      {message.text}
    </p>
  );
}

function Guide({ title, steps }: { title: string; steps: ReactNode[] }) {
  return (
    <details className="group rounded-xl bg-surface p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-navy">
        {title}
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="mt-3 flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-primary ring-1 ring-border">
              {i + 1}
            </span>
            <span className="pt-0.5 leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

const link = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
    {text} <ExternalLink className="h-3 w-3" aria-hidden />
  </a>
);

function Card({ icon, title, sub, children }: { icon: ReactNode; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky/15 text-primary" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-navy">{title}</p>
          <p className="text-sm text-muted-foreground">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Telegram: paste the BotFather token, WADAR does the rest (check, encrypt, webhook). */
export function TelegramConnect({ view }: { view: ConnectorView | null }) {
  const [token, setToken] = useState("");
  const { message, pending, run } = useConnectorAction();

  return (
    <Card icon={<Send className="h-5 w-5" />} title="Bot Telegram" sub="Paling cepat: tempel token bot, selesai dalam 1 menit.">
      {view ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <Status view={view} />
          <div className="flex flex-wrap gap-2">
            {view.username && (
              <a
                href={`https://t.me/${view.username}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Buka bot <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run((s) => testChannel(s, "telegram"))}>
              Tes
            </Button>
            {view.status !== "active" && (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run((s) => reconnectTelegram(s))}>
                Sambungkan ulang
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run((s) => disconnectChannel(s, "telegram"))}>
              Putuskan
            </Button>
          </div>
        </div>
      ) : (
        <Guide
          title="Cara membuat bot (3 langkah)"
          steps={[
            <>Buka {link("https://t.me/BotFather", "@BotFather")} di Telegram, ketik <b>/newbot</b>.</>,
            <>Isi nama toko, lalu username yang berakhiran <b>bot</b> (contoh: glowbysari_bot).</>,
            <>BotFather mengirim token seperti <code className="rounded bg-background px-1">123456789:AAH…</code>. Salin, tempel di bawah, klik <b>Sambungkan</b>.</>,
          ]}
        />
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run((s) => connectTelegram(s, { bot_token: token }), () => setToken(""));
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="tg-token">{view ? "Ganti bot (token baru)" : "Token bot"}</Label>
          <Input id="tg-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AAH…" autoComplete="off" />
        </div>
        <Button type="submit" disabled={pending || !token.trim()} className="sm:w-40">
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {pending ? "Menyambungkan…" : "Sambungkan"}
        </Button>
      </form>
      <Feedback message={message} />
    </Card>
  );
}

const WA_FIELDS = [
  { name: "phone_number_id", label: "Phone number ID", hint: "WhatsApp › API Setup", secret: false },
  { name: "waba_id", label: "WhatsApp Business Account ID", hint: "WhatsApp › API Setup", secret: false },
  { name: "app_id", label: "App ID", hint: "App settings › Basic", secret: false },
  { name: "app_secret", label: "App secret", hint: "App settings › Basic › Show", secret: true },
  { name: "access_token", label: "Access token (permanen)", hint: "Business settings › System users › Generate token", secret: true },
] as const;

type WaForm = Record<(typeof WA_FIELDS)[number]["name"], string>;
const EMPTY_WA: WaForm = { phone_number_id: "", waba_id: "", app_id: "", app_secret: "", access_token: "" };

/** WhatsApp Cloud API (Meta's official API): five values, then WADAR registers its own webhook. */
export function WhatsAppConnect({ view }: { view: ConnectorView | null }) {
  const [form, setForm] = useState<WaForm>(EMPTY_WA);
  const [open, setOpen] = useState(!view);
  const { message, pending, run } = useConnectorAction();
  const complete = WA_FIELDS.every((f) => form[f.name].trim());

  return (
    <Card icon={<MessageCircle className="h-5 w-5" />} title="WhatsApp Business (resmi Meta)" sub="Nomor bisnismu dijawab langsung lewat WhatsApp Cloud API, tanpa aplikasi perantara.">
      {view && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Status view={view} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run((s) => testChannel(s, "whatsapp"))}>
                Tes
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setOpen((o) => !o)}>
                {open ? "Tutup isian" : "Ganti data"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run((s) => disconnectChannel(s, "whatsapp"))}>
                Putuskan
              </Button>
            </div>
          </div>
          {view.callback_url && (
            <details className="rounded-lg bg-background p-3 text-sm">
              <summary className="cursor-pointer font-medium text-navy">Isi manual di Meta (kalau otomatis gagal)</summary>
              <p className="mt-2 text-muted-foreground">
                Meta Developers › aplikasimu › WhatsApp › Configuration › Webhook › Edit. Tempel dua nilai ini, lalu centang <b>messages</b> di Webhook fields.
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {[
                  ["Callback URL", view.callback_url],
                  ["Verify token", view.verify_token ?? ""],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1 sm:flex-row sm:items-center">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">{k}</span>
                    <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1.5 text-xs">{v || "—"}</code>
                    {v && <CopyButton text={v} />}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
      {open && (
        <>
          <Guide
            title="Cara mengambil lima isian dari Meta (sekali saja)"
            steps={[
              <>Buka {link("https://developers.facebook.com/apps", "Meta for Developers")} › <b>Create app</b> › pilih <b>Business</b>, lalu tambahkan produk <b>WhatsApp</b>.</>,
              <>Di <b>WhatsApp › API Setup</b>: tambahkan nomor bisnismu (atau pakai nomor uji), salin <b>Phone number ID</b> dan <b>WhatsApp Business Account ID</b>.</>,
              <>Di <b>App settings › Basic</b>: salin <b>App ID</b>, klik Show pada <b>App secret</b> lalu salin.</>,
              <>
                Di {link("https://business.facebook.com/settings/system-users", "Business settings › System users")}: buat system user (Admin), beri akses ke aplikasi
                dan akun WhatsApp, klik <b>Generate token</b> dengan izin <b>whatsapp_business_messaging</b> dan <b>whatsapp_business_management</b>, masa
                berlaku <b>Never</b>.
              </>,
              <>Tempel kelimanya di bawah, klik <b>Sambungkan</b>. WADAR mendaftarkan webhook-nya sendiri; kamu tidak perlu mengisi apa pun lagi di Meta.</>,
            ]}
          />
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run((s) => connectWhatsApp(s, form), () => {
                setForm(EMPTY_WA);
                setOpen(false);
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {WA_FIELDS.map((f) => (
                <div key={f.name} className={cn("flex flex-col gap-1.5", f.name === "access_token" && "sm:col-span-2")}>
                  <Label htmlFor={`wa-${f.name}`}>{f.label}</Label>
                  <Input
                    id={`wa-${f.name}`}
                    type={f.secret ? "password" : "text"}
                    inputMode={f.secret ? undefined : "numeric"}
                    value={form[f.name]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">App secret dan access token disimpan terenkripsi; tidak bisa dilihat lagi, termasuk oleh kamu.</p>
            <Button type="submit" size="lg" disabled={pending || !complete}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {pending ? "Menyambungkan ke Meta…" : "Sambungkan"}
            </Button>
          </form>
        </>
      )}
      <Feedback message={message} />
    </Card>
  );
}
