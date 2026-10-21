"use client";

import { ArrowRight, Compass, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { JudgeEntry, type JudgeShop } from "@/components/demo/judge-entry";
import { cn } from "@/lib/utils";
import { SceneVisual } from "./scene-visual";
import {
  EXAMPLES,
  fillShop,
  GREETING,
  isTourSegment,
  OUTRO,
  SCENES,
  type TourSegment,
} from "./tour-script";

interface Msg {
  id: number;
  from: "bot" | "me";
  text: string;
}

type Step = "pick" | number | "done";

const TYPING_MS = 650;

/**
 * The overlay is portalled to <body>: /juri animates its column with a transform, and a fixed
 * element inside a transformed ancestor is positioned against that ancestor, not the viewport.
 *
 * /juri guided tour: a rule-based guide bot (no LLM) and an app-like mockup per scene. Ends on the
 * real "try your own demo shop" cards. Opens from the launcher; Esc / × closes it any time.
 */
export function JuriTour({ shops }: { shops: JudgeShop[] }) {
  const segments = shops.filter(
    (s): s is JudgeShop & { profile: TourSegment } => isTourSegment(s.profile),
  );
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [segment, setSegment] = useState<TourSegment>("warkop");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const timers = useRef<number[]>([]);
  const nextId = useRef(0);
  const chatEnd = useRef<HTMLDivElement>(null);

  const shopName =
    segments.find((s) => s.profile === segment)?.name ?? "toko contoh";

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const push = (from: Msg["from"], text: string) => {
    nextId.current += 1;
    const id = nextId.current;
    setMessages((m) => [...m, { id, from, text }]);
  };

  const say = (lines: string[]) => {
    clearTimers();
    setTyping(true);
    lines.forEach((line, i) => {
      timers.current.push(
        window.setTimeout(
          () => {
            push("bot", line);
            if (i === lines.length - 1) setTyping(false);
          },
          TYPING_MS * (i + 1),
        ),
      );
    });
  };

  const start = () => {
    clearTimers();
    setMessages([]);
    setStep("pick");
    setOpen(true);
    say(GREETING);
  };

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  const close = () => {
    clearTimers();
    setTyping(false);
    setOpen(false);
  };

  const goScene = (index: number, name: string) => {
    setStep(index);
    say(SCENES[index].lines.map((l) => fillShop(l, name)));
  };

  const pick = (s: JudgeShop & { profile: TourSegment }) => {
    setSegment(s.profile);
    push("me", `${s.emoji} ${s.name}`);
    goScene(0, s.name);
  };

  const finish = () => {
    setStep("done");
    say(OUTRO);
  };

  const next = () => {
    if (typeof step !== "number") return;
    push("me", "Lanjut");
    if (step + 1 < SCENES.length) goScene(step + 1, shopName);
    else finish();
  };

  const why = () => {
    if (typeof step !== "number") return;
    push("me", "Kenapa ini penting?");
    say([SCENES[step].why]);
  };

  const skipToTry = () => {
    push("me", "Langsung coba saja");
    finish();
  };

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing]);

  // The key listener reads the latest handlers through a ref, so it is attached once per opening.
  const keys = useRef({ close, next, typing });
  useEffect(() => {
    keys.current = { close, next, typing };
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") keys.current.close();
      else if (e.key === "ArrowRight" && !keys.current.typing)
        keys.current.next();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  // /juri?tur=1 (from the landing page) opens the tour right away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tur") !== "1") return;
    const raf = requestAnimationFrame(() => startRef.current());
    return () => cancelAnimationFrame(raf);
  }, []);

  const sceneIndex =
    typeof step === "number" ? step : step === "done" ? SCENES.length : -1;
  const ex = EXAMPLES[segment];

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="group flex w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-navy to-primary p-5 text-left text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Compass className="h-6 w-6" aria-hidden />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="text-lg font-semibold">
            Mulai tur interaktif (±2 menit)
          </span>
          <span className="text-sm text-white/80">
            Asisten tur menemani: Beranda, kasir, stok, chat pembeli, keuangan,
            dan konsultasi.
          </span>
        </span>
        <ArrowRight
          className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1"
          aria-hidden
        />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/70 p-2 backdrop-blur-sm sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Tur interaktif WADAR"
          >
            <div className="page-in flex h-[min(94dvh,760px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-surface shadow-2xl">
              <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3">
                <div
                  className="flex flex-1 items-center gap-1.5"
                  aria-label={`Bagian ${Math.max(0, sceneIndex)} dari ${SCENES.length}`}
                >
                  {SCENES.map((s, i) => (
                    <span
                      key={s.id}
                      title={s.title}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors",
                        i < sceneIndex || (i === sceneIndex && step !== "done")
                          ? "bg-primary"
                          : "bg-muted",
                      )}
                    />
                  ))}
                </div>
                <span className="hidden text-xs font-medium text-muted-foreground sm:block">
                  {typeof step === "number"
                    ? `${step + 1}/${SCENES.length} · ${SCENES[step].title}`
                    : step === "done"
                      ? "Selesai"
                      : "Mulai"}
                </span>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                  aria-label="Tutup tur"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:grid-rows-1">
                <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
                  {typeof step === "number" ? (
                    <SceneVisual
                      key={`${segment}-${step}`}
                      scene={SCENES[step].id}
                      ex={ex}
                      shopName={shopName}
                    />
                  ) : step === "done" ? (
                    <div className="page-in flex flex-col gap-3">
                      <p className="font-semibold text-navy">
                        Pilih toko contoh untuk dicoba
                      </p>
                      <JudgeEntry shops={shops} compact />
                    </div>
                  ) : (
                    <div className="flex min-h-full flex-col justify-center gap-3">
                      <p className="flex items-center gap-2 font-semibold text-navy">
                        <Sparkles
                          className="h-5 w-5 text-primary"
                          aria-hidden
                        />{" "}
                        Pilih contoh usaha
                      </p>
                      {segments.map((s) => (
                        <button
                          key={s.profile}
                          type="button"
                          disabled={typing}
                          onClick={() => pick(s)}
                          className="lift flex items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left hover:border-primary disabled:opacity-60"
                        >
                          <span
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-2xl"
                            aria-hidden
                          >
                            {s.emoji}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                              {s.segment}
                            </span>
                            <span className="font-semibold text-navy">
                              {s.name}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {s.tagline}
                            </span>
                          </span>
                          <ArrowRight
                            className="h-5 w-5 shrink-0 text-primary"
                            aria-hidden
                          />
                        </button>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        Semua tampilan di tur ini contoh; setelahnya kamu bisa
                        coba toko sungguhan.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 flex-col border-t border-border bg-background md:border-l md:border-t-0">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-sky text-white">
                      <Sparkles className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="leading-tight">
                      <p className="text-sm font-semibold text-navy">
                        Asisten Tur
                      </p>
                      <p className="text-[11px] text-success">
                        {typing ? "sedang mengetik…" : "online"}
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3"
                    aria-live="polite"
                  >
                    {messages.map((m) => (
                      <p
                        key={m.id}
                        className={cn(
                          "tour-pop max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                          m.from === "bot"
                            ? "self-start rounded-tl-sm bg-surface text-foreground"
                            : "self-end rounded-tr-sm bg-primary text-primary-foreground",
                        )}
                      >
                        {m.text}
                      </p>
                    ))}
                    {typing && (
                      <span
                        className="flex w-14 items-center justify-center gap-1 self-start rounded-2xl rounded-tl-sm bg-surface px-3 py-3"
                        aria-label="Asisten sedang mengetik"
                      >
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="tour-dot h-1.5 w-1.5 rounded-full bg-muted-foreground"
                            style={{ animationDelay: `${i * 150}ms` }}
                          />
                        ))}
                      </span>
                    )}
                    <div ref={chatEnd} />
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-border p-3">
                    {!typing &&
                      step === "pick" &&
                      messages.length > 0 &&
                      segments.map((s) => (
                        <Reply key={s.profile} onClick={() => pick(s)}>
                          {s.emoji} {s.name}
                        </Reply>
                      ))}
                    {!typing && typeof step === "number" && (
                      <>
                        <Reply primary onClick={next}>
                          {step + 1 < SCENES.length ? "Lanjut →" : "Selesai →"}
                        </Reply>
                        <Reply onClick={why}>Kenapa penting?</Reply>
                        <Reply onClick={skipToTry}>Langsung coba</Reply>
                      </>
                    )}
                    {!typing && step === "done" && (
                      <>
                        <Reply onClick={start}>Ulangi tur</Reply>
                        <Reply onClick={close}>Tutup</Reply>
                      </>
                    )}
                    {typing && (
                      <span className="py-2 text-xs text-muted-foreground">
                        Tunggu sebentar…
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Reply({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-full px-4 text-sm font-medium transition-colors",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary-hover"
          : "bg-surface text-navy ring-1 ring-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
