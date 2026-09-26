"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { errorMessage } from "../../../../lib/errors";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;
type Accepted = (typeof ACCEPTED)[number];
const MAX_BYTES = 5 * 1024 * 1024;

export function PhotoUpload({ productId, hasPhoto }: { productId: string; hasPhoto: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>();

  async function upload(file: File) {
    if (!ACCEPTED.includes(file.type as Accepted)) {
      setStatus("Foto harus JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("Ukuran foto maksimal 5 MB.");
      return;
    }
    setStatus("Mengunggah...");
    try {
      const { uploadUrl, path } = await apiFetch<{ uploadUrl: string; path: string }>(`/v1/products/${productId}/photo-upload`, {
        method: "POST",
        body: { contentType: file.type },
      });
      const res = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!res.ok) throw new Error("upload failed");
      await apiFetch(`/v1/products/${productId}/photo`, { method: "PATCH", body: { path } });
      setStatus(undefined);
      router.refresh();
    } catch (err) {
      setStatus(errorMessage(err, "Gagal mengunggah foto."));
    }
  }

  return (
    <div className="mt-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => input.current?.click()} className="text-sm font-medium text-primary underline">
        {hasPhoto ? "Ganti foto" : "Tambah foto"}
      </button>
      {status && <p className="mt-1 text-sm text-muted-foreground">{status}</p>}
    </div>
  );
}
