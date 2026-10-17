"use client";

import { BellRing, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { serviceWorkerUrl } from "@/lib/service-worker";
import { saveNotificationPrefs, savePushSubscription } from "./notification-actions";

/**
 * GAP #7: "beri tahu saya saat chat perlu dibalas" + push to this device. `pushKey` is the VAPID
 * public key, null when push is not configured on the server (then in-app notifications only).
 */
export function NotificationSettings({
  slug,
  onEscalation,
  pushEnabled,
  pushKey,
}: {
  slug: string;
  onEscalation: boolean;
  pushEnabled: boolean;
  pushKey: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ error?: string; note?: string }>();
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) =>
    startTransition(async () => {
      setMessage(await saveNotificationPrefs(slug, { onEscalation: next }));
      router.refresh();
    });

  const enablePush = () =>
    startTransition(async () => {
      setMessage(undefined);
      if (!pushKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setMessage({ error: "Browser ini belum mendukung notifikasi push." });
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        setMessage({ error: "Izin notifikasi ditolak. Aktifkan lewat pengaturan browser." });
        return;
      }
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl(slug));
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(pushKey) }));
      const result = await savePushSubscription(slug, subscription.toJSON());
      setMessage(result.error ? result : { note: "Notifikasi aktif di perangkat ini." });
      router.refresh();
    });

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Notifikasi</h2>
        <p className="text-sm text-muted-foreground">Kalau asisten tidak bisa menjawab atau pembeli minta admin, kamu diberi tahu.</p>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 accent-primary"
          checked={onEscalation}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
        />
        Beri tahu saya saat chat perlu dibalas
      </label>
      {onEscalation &&
        (pushKey ? (
          <Button type="button" variant="outline" disabled={pending} onClick={enablePush} className="self-start">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            {pushEnabled ? "Tambah perangkat ini" : "Aktifkan notifikasi di HP ini"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Notifikasi muncul di menu Chat. Notifikasi push ke HP belum diatur.</p>
        ))}
      {message?.error && (
        <p role="alert" className="text-sm text-destructive">
          {message.error}
        </p>
      )}
      {message?.note && <p className="text-sm text-muted-foreground">{message.note}</p>}
    </section>
  );
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
