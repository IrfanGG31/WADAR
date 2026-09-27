import type { SystemRoleKey } from "@wadar/contracts/identity";
import { formatRelativeTime } from "@wadar/core/date";
import { Badge, Card, CardContent, CardHeader, CardTitle, CardDescription } from "@wadar/ui-web";
import { apiFetchServer, ApiError } from "../../../../lib/api-client-server";
import { InviteMemberForm } from "./invite-member-form";
import { MemberRoleSelect } from "./member-role-select";
import { Users, Shield, Clock } from "lucide-react";

interface Member {
  membershipId: string;
  userId: string;
  roleKey: SystemRoleKey;
  roleName: string;
}

interface Invitation {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  expiresAt: string;
}

export default async function PengaturanTimPage() {
  let members: Member[];
  let invitations: Invitation[];
  try {
    [members, invitations] = await Promise.all([
      apiFetchServer<Member[]>("/v1/memberships"),
      apiFetchServer<Invitation[]>("/v1/invitations"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.problem.status === 403) {
      return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-4xl mx-auto w-full">
          <Card className="border-destructive/30 bg-destructive/5 shadow-sm">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-3">
              <Shield className="h-10 w-10 text-destructive opacity-80" />
              <div>
                <h3 className="font-semibold text-lg text-foreground">Akses Ditolak</h3>
                <p className="text-sm text-muted-foreground mt-1">Hanya "Pemilik" dan "Manajer" yang dapat mengelola tim.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    throw err;
  }
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manajemen Tim</h1>
        <p className="text-sm text-muted-foreground mt-1">Kelola anggota tim, akses kasir, dan admin chat toko Anda.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" /> Anggota Aktif
                  </CardTitle>
                  <CardDescription className="mt-1">Ada {members.length} anggota di tim ini.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {members.map((member) => (
                  <div key={member.membershipId} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm border border-primary/20">
                        {member.userId.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{member.userId}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          Bergabung baru-baru ini
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {member.roleKey === "owner" ? (
                        <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20 border-0">
                          {member.roleName}
                        </Badge>
                      ) : (
                        <MemberRoleSelect membershipId={member.membershipId} roleKey={member.roleKey} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {pendingInvitations.length > 0 && (
            <Card className="shadow-sm border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-3 border-b border-amber-100">
                <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Undangan Menunggu Respons ({pendingInvitations.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-amber-100">
                  {pendingInvitations.map((invitation) => (
                    <div key={invitation.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200">
                          <Clock className="h-3 w-3" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{invitation.email ?? invitation.phone}</p>
                          <p className="text-xs text-amber-600/80 mt-0.5">
                            Kedaluwarsa {formatRelativeTime(new Date(invitation.expiresAt))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="md:col-span-1">
          <InviteMemberForm />
        </div>
      </div>
    </div>
  );
}
