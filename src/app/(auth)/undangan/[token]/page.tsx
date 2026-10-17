import Link from "next/link";
import { Suspense } from "react";
import { ROLE_LABEL, type MemberRole } from "@/core/roles";
import { INVITE_STATUS_TEXT, isInviteToken, type InviteStatus } from "@/core/team";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "../../_components/auth-shell";
import { AcceptButton } from "./accept-button";

export const metadata = { title: "Undangan toko" };

/** TEAM-1 accept page. Signed-out visitors are sent to /masuk?next=… by the proxy first. */
export default function UndanganPage({ params }: PageProps<"/undangan/[token]">) {
  return (
    <AuthShell title="Undangan bergabung" subtitle="Pemilik toko mengajakmu membantu mengelola tokonya.">
      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-muted" />}>
        <Invite params={params} />
      </Suspense>
    </AuthShell>
  );
}

interface Preview {
  shop_name: string;
  role: MemberRole;
  email: string;
  status: InviteStatus;
}

async function Invite({ params }: { params: PageProps<"/undangan/[token]">["params"] }) {
  const { token } = await params;
  let preview: Preview | null = null;
  if (isInviteToken(token)) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("shop_invite_preview", { p_token: token }).maybeSingle<Preview>();
    if (error) throw error;
    preview = data;
  }
  if (!preview) return <Notice text="Undangan tidak ditemukan. Periksa lagi tautannya atau minta pemilik toko mengirim ulang." />;
  if (preview.status !== "open") return <Notice text={INVITE_STATUS_TEXT[preview.status]} />;
  return (
    <div className="flex flex-col gap-4">
      <p>
        Kamu diundang ke <strong>{preview.shop_name}</strong> sebagai <strong>{ROLE_LABEL[preview.role]}</strong>.
      </p>
      <p className="text-sm text-muted-foreground">
        Undangan ini untuk <span className="font-medium text-foreground">{preview.email}</span>. Pastikan kamu masuk dengan email itu.
      </p>
      <AcceptButton token={token} />
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p>{text}</p>
      <Link href="/mulai" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Ke toko saya
      </Link>
    </div>
  );
}
