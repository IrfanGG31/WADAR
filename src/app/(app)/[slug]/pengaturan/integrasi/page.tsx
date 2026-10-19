import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { Badge } from "@/components/ui/badge";
import { INTEGRATION_STATUS_LABEL, INTEGRATIONS, type Integration } from "@/core/channels/integrations";
import { shopPath } from "@/lib/routes";

export const metadata = { title: "Integrasi" };

type Params = PageProps<"/[slug]/pengaturan/integrasi">["params"];

const GROUPS: { key: Integration["group"]; title: string }[] = [
  { key: "chat", title: "Chat pembeli" },
  { key: "marketplace", title: "Marketplace" },
  { key: "pembayaran", title: "Pembayaran" },
];

const TONE = { aktif: "success", manual: "muted", segera: "outline" } as const;

/** Pengaturan › Integrasi (ADR-002): what is connected, what runs by file, and what each future connection will ask for. */
export default function IntegrasiPage({ params }: PageProps<"/[slug]/pengaturan/integrasi">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <BackLink params={params} />
        <h1 className="text-2xl font-semibold tracking-tight">Integrasi</h1>
        <p className="text-sm text-muted-foreground">
          Sambungan ke aplikasi lain. Yang belum terhubung sudah disiapkan isiannya, jadi nanti tinggal diisi.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="settings">
          <List params={params} />
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

async function List({ params }: { params: Params }) {
  const { slug } = await params;
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((g) => (
        <section key={g.key} className="flex flex-col gap-3" aria-labelledby={`grup-${g.key}`}>
          <h2 id={`grup-${g.key}`} className="text-sm font-semibold text-muted-foreground">
            {g.title}
          </h2>
          {INTEGRATIONS.filter((i) => i.group === g.key).map((i) => (
            <article key={i.key} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">{i.name}</h3>
                  <p className="text-sm text-muted-foreground">{i.description}</p>
                </div>
                <Badge variant={TONE[i.status]} className="shrink-0">
                  {INTEGRATION_STATUS_LABEL[i.status]}
                </Badge>
              </div>
              {i.page && (
                <Link
                  href={shopPath(slug, i.page)}
                  className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {i.status === "manual" ? "Impor file pesanan" : "Buka pengaturan"}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
              {i.status !== "aktif" && i.fields.length > 0 && (
                <details className="rounded-lg bg-muted/50 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Yang perlu disiapkan saat menyambungkan</summary>
                  <fieldset disabled className="mt-3 flex flex-col gap-3" aria-label={`Isian ${i.name}`}>
                    {i.fields.map((f) => (
                      <div key={f.key} className="flex flex-col gap-1">
                        <label htmlFor={`${i.key}-${f.key}`} className="text-xs font-medium">
                          {f.label}
                          {f.secret ? " (rahasia)" : ""}
                        </label>
                        <input
                          id={`${i.key}-${f.key}`}
                          type={f.secret ? "password" : "text"}
                          placeholder={f.hint ?? ""}
                          className="h-11 rounded-md border border-border bg-background px-3 text-sm opacity-70"
                        />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">Belum bisa disimpan — sambungan ini sedang disiapkan.</p>
                  </fieldset>
                </details>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
