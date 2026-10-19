"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { brand } from "@/brand";
import { cn } from "@/lib/utils";

/**
 * Marketing layout adapted from the 21st.dev "SaaS template" (nav + announcement pill + hero +
 * product preview), restyled for the brand: light theme, logo blues, Plus Jakarta Sans headings
 * from the root layout. Unlike the original it sets no global font, loads no remote images,
 * and takes its words and actions as props so pages stay server-rendered around it.
 */

export interface NavLink {
  href: string;
  label: string;
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", className)}>
      <Image src={brand.mark.src} alt="" width={brand.mark.width} height={brand.mark.height} className="h-6 w-auto" priority />
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
    <p className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky" aria-hidden />
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

/** Text left, product right on wide screens; stacked on phones. */
export function Hero({ pill, title, description, actions, footnote, preview }: HeroProps) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 md:px-6 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12 lg:pb-24">
      <div className="flex flex-col items-start gap-6">
        {pill}
        <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-navy sm:text-5xl lg:text-[3.25rem]">{title}</h1>
        <p className="max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">{description}</p>
        <div className="w-full max-w-md">{actions}</div>
        {footnote && <div className="text-sm text-muted-foreground">{footnote}</div>}
      </div>
      <div className="relative">{preview}</div>
    </section>
  );
}

/** A plain browser frame around a real screenshot — no glow, no tilt. */
export function ProductFrame({ src, alt, width, height, address }: { src: string; alt: string; width: number; height: number; address: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_48px_-24px_rgb(8_42_92/0.35)]">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </span>
        <span className="mx-auto truncate rounded-md bg-background px-3 py-0.5 text-xs text-muted-foreground">{address}</span>
      </div>
      <Image src={src} alt={alt} width={width} height={height} className="h-auto w-full" sizes="(min-width: 1024px) 640px, 100vw" priority />
    </figure>
  );
}

/** Default export kept for the template's original demo import (`@/components/ui/saa-s-template`). */
export default function SaasTemplate(props: HeroProps & { links: NavLink[]; headerActions: ReactNode }) {
  const { links, headerActions, ...hero } = props;
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeader links={links} actions={headerActions} />
      <Hero {...hero} />
    </div>
  );
}
