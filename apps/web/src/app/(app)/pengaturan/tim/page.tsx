import type { SystemRoleKey } from "@wadar/contracts/identity";
import { formatRelativeTime } from "@wadar/core/date";
import { Badge } from "@wadar/ui-web";
import { apiFetchServer, ApiError } from "../../../../lib/api-client-server";
import { InviteMemberForm } from "./invite-member-form";
import { MemberRoleSelect } from "./member-role-select";

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
        <div className="p-4">
          <p className="text-sm text-muted-foreground">Kamu tidak punya akses ke halaman ini.</p>
        </div>
      );
    }
    throw err;
  }
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">Tim</h1>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground">Anggota ({members.length})</h2>
        <div className="mt-2 flex flex-col gap-2">
          {members.map((member) => (
            <div key={member.membershipId} className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium">{member.userId}</p>
                <Badge variant="muted" className="mt-1">
                  {member.roleName}
                </Badge>
              </div>
              {member.roleKey === "owner" ? null : (
                <MemberRoleSelect membershipId={member.membershipId} roleKey={member.roleKey} />
              )}
            </div>
          ))}
        </div>
      </div>

      {pendingInvitations.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Undangan tertunda</h2>
          <div className="mt-2 flex flex-col gap-2">
            {pendingInvitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                <p className="text-sm">{invitation.email ?? invitation.phone}</p>
                <p className="text-xs text-muted-foreground">
                  kedaluwarsa {formatRelativeTime(new Date(invitation.expiresAt))}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <InviteMemberForm />
    </div>
  );
}
