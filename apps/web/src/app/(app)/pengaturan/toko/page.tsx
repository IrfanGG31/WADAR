import type { Permission } from "@wadar/contracts/identity";
import { formatDateIndonesian } from "@wadar/core/date";
import { apiFetchServer } from "../../../../lib/api-client-server";
import { AddOutletForm } from "./add-outlet-form";

interface Tenant {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
}

interface Outlet {
  id: string;
  name: string;
  address: string | null;
  createdAt: string;
}

interface MyMembership {
  permissions: Permission[];
}

const TIMEZONE_LABEL: Record<string, string> = {
  "Asia/Jakarta": "WIB — Jakarta",
  "Asia/Makassar": "WITA — Makassar",
  "Asia/Jayapura": "WIT — Jayapura",
};

export default async function PengaturanTokoPage() {
  const [tenant, outlets, membership] = await Promise.all([
    apiFetchServer<Tenant>("/v1/tenants/current"),
    apiFetchServer<Outlet[]>("/v1/outlets"),
    apiFetchServer<MyMembership>("/v1/memberships/me"),
  ]);
  const canManageSettings = membership.permissions.includes("settings:manage");

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Pengaturan Toko</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tenant.name} · {TIMEZONE_LABEL[tenant.timezone] ?? tenant.timezone} · sejak{" "}
          {formatDateIndonesian(new Date(tenant.createdAt), tenant.timezone)}
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground">Outlet</h2>
        <div className="mt-2 flex flex-col gap-2">
          {outlets.map((outlet) => (
            <div key={outlet.id} className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium">{outlet.name}</p>
              {outlet.address && <p className="text-xs text-muted-foreground">{outlet.address}</p>}
            </div>
          ))}
        </div>
      </div>

      {canManageSettings && <AddOutletForm />}
    </div>
  );
}
