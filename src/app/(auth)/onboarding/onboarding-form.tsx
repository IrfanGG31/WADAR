"use client";

import { useActionState, useState } from "react";
import { slugify } from "@/core/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BUSINESS_TYPES } from "@/lib/business-types";
import { createShop, type CreateShopState } from "./actions";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<CreateShopState, FormData>(createShop, {});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const shownSlug = slugTouched ? slug : slugify(name);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nama toko</Label>
        <Input id="name" name="name" placeholder="Glow by Sari" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Alamat toko</Label>
        <div className="flex items-center rounded-md border border-border focus-within:ring-2 focus-within:ring-primary">
          <span className="pl-3 text-sm text-muted-foreground">wadar/</span>
          <input
            id="slug"
            name="slug"
            value={shownSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className="h-11 min-w-0 flex-1 bg-transparent pr-3 text-base outline-none md:text-sm"
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">Dipakai di link toko dan chat pembeli. Huruf kecil, angka, dan tanda minus.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Jenis usaha</legend>
        <div className="grid grid-cols-2 gap-2">
          {BUSINESS_TYPES.map((type, i) => (
            <label
              key={type.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input type="radio" name="businessType" value={type.value} defaultChecked={i === 0} className="accent-primary" />
              {type.label}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending || name.trim().length < 2}>
        {pending ? "Membuat toko..." : "Buat toko"}
      </Button>
    </form>
  );
}
