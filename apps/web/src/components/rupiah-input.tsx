"use client";

import { Input } from "@wadar/ui-web";
import type { ComponentProps } from "react";

const formatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** Whole-rupiah input: shows "89.000", reports 89000 (or undefined when empty). */
export function RupiahInput({
  value,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
      <Input
        {...props}
        inputMode="numeric"
        autoComplete="off"
        className={`pl-9 ${props.className ?? ""}`}
        value={value === undefined ? "" : formatter.format(value)}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 15);
          onValueChange(digits === "" ? undefined : Number(digits));
        }}
      />
    </div>
  );
}
