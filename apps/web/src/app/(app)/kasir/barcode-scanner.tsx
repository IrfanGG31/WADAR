"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

/** Camera scanning uses the browser's BarcodeDetector (Chrome on Android); elsewhere the button is hidden and USB/Bluetooth scanners still work via the search box. */
export function barcodeScanSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>();
  const [last, setLast] = useState<string>();
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastCode = "";
    let lastAt = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new window.BarcodeDetector!({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
        timer = setInterval(async () => {
          if (!video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          const code = codes[0]?.rawValue;
          // Same code within 1.5 s = the camera still seeing the same item.
          if (code && (code !== lastCode || Date.now() - lastAt > 1_500)) {
            lastCode = code;
            lastAt = Date.now();
            setLast(code);
            navigator.vibrate?.(60);
            onDetectedRef.current(code);
          }
        }, 250);
      } catch {
        setError("Kamera tidak bisa dibuka. Izinkan akses kamera, atau ketik kodenya di kolom cari.");
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan barcode" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4">
        <p className="font-semibold">Arahkan kamera ke barcode</p>
        <button type="button" onClick={onClose} aria-label="Selesai scan" className="rounded-full bg-white/10 p-2">
          <X className="h-5 w-5" />
        </button>
      </div>
      <video ref={video} className="flex-1 object-cover" muted playsInline />
      <p className="p-4 text-center text-sm" aria-live="polite">
        {error ?? (last ? `Terbaca: ${last}` : "Scan beberapa barang berturut-turut, lalu tekan X.")}
      </p>
    </div>
  );
}
