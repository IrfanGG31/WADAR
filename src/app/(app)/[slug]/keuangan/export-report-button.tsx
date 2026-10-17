"use client";

import { Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exportFinanceReport } from "./export-actions";

/** Unduh laporan (FIN-7): the period shown on screen as a CSV file. */
export function ExportReportButton({ slug, days }: { slug: string; days: number }) {
  const [message, setMessage] = useState<{ error?: string; note?: string }>();
  const [pending, startTransition] = useTransition();

  const download = () => {
    setMessage(undefined);
    startTransition(async () => {
      const result = await exportFinanceReport(slug, String(days));
      if ("error" in result) return setMessage(result);
      const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: result.filename });
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ note: `${result.filename} sudah diunduh.` });
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" disabled={pending} onClick={download} className="min-h-11">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Unduh laporan (CSV)
      </Button>
      {message?.error && (
        <p role="alert" className="text-sm text-red-800">
          {message.error}
        </p>
      )}
      {message?.note && (
        <p role="status" className="text-sm text-emerald-700">
          {message.note}
        </p>
      )}
    </div>
  );
}
