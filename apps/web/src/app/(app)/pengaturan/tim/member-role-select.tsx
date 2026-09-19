"use client";

import { ChangeRoleBody, SystemRoleKey, type SystemRoleKey as SystemRoleKeyType } from "@wadar/contracts/identity";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "../../../../lib/api-client";

const ROLE_LABEL: Record<SystemRoleKeyType, string> = {
  owner: "Pemilik",
  manager: "Manajer",
  cashier: "Kasir",
  chat_admin: "Admin Chat",
  warehouse: "Gudang",
};

export function MemberRoleSelect({
  membershipId,
  roleKey,
}: {
  membershipId: string;
  roleKey: SystemRoleKeyType;
}) {
  const router = useRouter();
  const [value, setValue] = useState(roleKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleChange(newRoleKey: SystemRoleKeyType) {
    const previous = value;
    setValue(newRoleKey);
    setLoading(true);
    setError(undefined);

    const parsed = ChangeRoleBody.safeParse({ roleKey: newRoleKey });
    if (!parsed.success) {
      setValue(previous);
      setLoading(false);
      return;
    }

    try {
      await apiFetch(`/v1/memberships/${membershipId}/role`, { method: "PATCH", body: parsed.data });
      router.refresh();
    } catch (err) {
      setValue(previous);
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : "Gagal mengubah peran.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={value}
        disabled={loading}
        onChange={(e) => handleChange(e.target.value as SystemRoleKeyType)}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
      >
        {SystemRoleKey.options.map((key) => (
          <option key={key} value={key}>
            {ROLE_LABEL[key]}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
