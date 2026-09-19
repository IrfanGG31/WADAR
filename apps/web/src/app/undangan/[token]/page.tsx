import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wadar/ui-web";
import Link from "next/link";
import { apiFetchServer } from "../../../lib/api-client-server";
import { createClient } from "../../../lib/supabase/server";
import { AcceptButton } from "./accept-button";

interface InvitationPreview {
  tenantName: string;
  roleName: string;
  acceptable: boolean;
}

export default async function UndanganPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let preview: InvitationPreview | undefined;
  try {
    preview = await apiFetchServer<InvitationPreview>(`/v1/invitations/${token}`, { skipTenant: true });
  } catch {
    preview = undefined;
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Undangan bergabung</CardTitle>
          {preview ? (
            <CardDescription>
              Kamu diundang bergabung ke <strong>{preview.tenantName}</strong> sebagai{" "}
              <strong>{preview.roleName}</strong>.
            </CardDescription>
          ) : (
            <CardDescription>Undangan tidak ditemukan atau sudah tidak berlaku.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {preview?.acceptable &&
            (session ? (
              <AcceptButton token={token} />
            ) : (
              <Link
                href={`/masuk?next=${encodeURIComponent(`/undangan/${token}`)}`}
                className="text-sm font-medium text-primary underline"
              >
                Masuk dulu untuk menerima undangan
              </Link>
            ))}
          {preview && !preview.acceptable && (
            <p className="text-sm text-muted-foreground">
              Undangan ini sudah kedaluwarsa atau sudah dipakai — minta yang mengundang untuk mengirim ulang.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
