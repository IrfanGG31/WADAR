"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { brand } from "@/brand";
import { cn } from "@/lib/utils";

/**
 * Marketing primitives adapted from the 21st.dev "SaaS template": sticky nav, pill, centered hero,
 * product preview with a soft brand aura behind it. Light theme, logo blues, no remote assets, no
 * global font override. Props stay simple so pages can keep their copy near their routes.
 */

export interface NavLink {
  href: string;
  label: string;
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", className)}>
      <Image src={brand.mark.src} alt="" width={brand.mark.width} height={brand.mark.height} className="h-7 w-auto" priority />
      <span className="font-display text-lg font-extrabold tracking-tight text-navy">{brand.name}</span>
    </Link>
  );
}

export function SiteHeader({ links, actions }: { links: NavLink[]; actions: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <nav className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6" aria-label="Utama">
        <BrandLockup />
        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">{actions}</div>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Tutup menu" : "Buka menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open && (
        <div className="border-t border-border bg-background px-4 pb-4 md:hidden">
          <div className="flex flex-col">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="py-3 text-base text-foreground" onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
          </div>
          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">{actions}</div>
        </div>
      )}
    </header>
  );
}

export function AnnouncementPill({ children, href, linkLabel }: { children: ReactNode; href?: string; linkLabel?: string }) {
  return (
    <p className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-sky" />
      </span>
      <span>{children}</span>
      {href && linkLabel && (
        <a href={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          {linkLabel}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </a>
      )}
    </p>
  );
}

export interface HeroProps {
  pill?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions: ReactNode;
  footnote?: ReactNode;
  preview: ReactNode;
}

/** Centered hero (text, actions), then the product with a soft brand aura behind it — a light-theme take on the original template. */
export function Hero({ pill, title, description, actions, footnote, preview }: HeroProps) {
  return (
    <section className="relative overflow-hidden">
      <AuraBackdrop />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-8 px-4 pb-10 pt-16 text-center md:px-6 md:pb-16 md:pt-24">
        {pill}
        <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-navy sm:text-5xl md:text-[3.5rem] lg:text-6xl">
          {title}
        </h1>
        <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">{description}</p>
        <div className="flex w-full max-w-md flex-col items-center gap-3">{actions}</div>
        {footnote && <div className="text-sm text-muted-foreground">{footnote}</div>}
      </div>
      <div className="relative mx-auto -mt-2 w-full max-w-6xl px-4 pb-20 md:px-6 md:pb-28">{preview}</div>
    </section>
  );
}

/** The soft blue "aura" behind the hero, cheap enough to render on phones (two radial fills, no SVG filter). */
function AuraBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] overflow-hidden">
      <div
        className="absolute left-1/2 top-[-18rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full opacity-70 blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(55,147,242,0.45), rgba(55,147,242,0))" }}
      />
      <div
        className="absolute left-[12%] top-[6rem] h-[28rem] w-[28rem] rounded-full opacity-60 blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(31,95,191,0.35), rgba(31,95,191,0))" }}
      />
      <div
        className="absolute right-[8%] top-[12rem] h-[22rem] w-[22rem] rounded-full opacity-50 blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(8,42,92,0.25), rgba(8,42,92,0))" }}
      />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

/** A plain browser frame around a real screenshot. The glow lives in `AuraBackdrop`, so this stays crisp. */
export function ProductFrame({ src, alt, width, height, address }: { src: string; alt: string; width: number; height: number; address: string }) {
  return (
    <figure className="relative mx-auto overflow-hidden rounded-2xl border border-border bg-background shadow-[0_32px_64px_-32px_rgb(8_42_92/0.35),0_8px_24px_-8px_rgb(8_42_92/0.15)]">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </span>
        <span className="mx-auto truncate rounded-md bg-background px-3 py-0.5 text-xs text-muted-foreground">{address}</span>
      </div>
      <Image src={src} alt={alt} width={width} height={height} className="h-auto w-full" sizes="(min-width: 1024px) 1024px, 100vw" priority />
    </figure>
  );
}
