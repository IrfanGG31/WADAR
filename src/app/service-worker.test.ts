import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import { isPublicPath } from "@/proxy";
import { OFFLINE_PATH, serviceWorkerUrl } from "@/lib/service-worker";

/**
 * D8 / TECH-SPEC §14 (instead of Serwist, see BACKLOG): public/sw.js precaches the app shell
 * (offline page, manifest, icons), serves hashed /_next/static assets cache-first, and falls
 * back to the offline page when a page can't load. Pages and API answers are never cached.
 */
const SOURCE = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://wadar.test";

type Handler = (event: Record<string, unknown>) => void;

function loadWorker(network: (url: string) => Promise<Response>) {
  const listeners = new Map<string, Handler>();
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (urls: string[]) => {
        for (const u of urls) store.set(new URL(u, ORIGIN).href, new Response(`cached ${u}`));
      },
      put: async (req: Request | string, res: Response) => void store.set(typeof req === "string" ? new URL(req, ORIGIN).href : req.url, res),
      match: async (req: Request | string) => store.get(typeof req === "string" ? new URL(req, ORIGIN).href : req.url)?.clone(),
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (req: Request | string) => {
      for (const name of stores.keys()) {
        const hit = await (await open(name)).match(req);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const self = {
    location: new URL(`${ORIGIN}${serviceWorkerUrl("kopi-dimas")}`),
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    registration: { showNotification: async () => undefined },
  };
  runInNewContext(SOURCE, {
    self,
    caches,
    URL,
    Response,
    Request,
    Promise,
    fetch: (req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      fetched.push(url);
      return network(url);
    },
  });

  const install = async () => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get("install")!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  const activate = async () => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get("activate")!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  /** undefined = the worker let the browser handle it. */
  const request = async (path: string, init: { mode?: string; method?: string } = {}) => {
    const req = new Request(`${ORIGIN}${path}`, { method: init.method ?? "GET" });
    Object.defineProperty(req, "mode", { value: init.mode ?? "cors" });
    let answer: Promise<Response> | undefined;
    listeners.get("fetch")!({ request: req, respondWith: (p: Promise<Response>) => (answer = p) });
    return answer ? await answer : undefined;
  };
  return { listeners, stores, fetched, install, activate, request };
}

const online = async (url: string) => new Response(`network ${new URL(url).pathname}`);
const offline = async () => Promise.reject(new TypeError("Failed to fetch"));

describe("service worker: app shell + offline", () => {
  let sw: ReturnType<typeof loadWorker>;
  beforeEach(() => {
    sw = loadWorker(offline);
  });

  it("keeps the push notification handlers (GAP #7)", () => {
    expect(sw.listeners.has("push")).toBe(true);
    expect(sw.listeners.has("notificationclick")).toBe(true);
  });

  it("precaches the offline page, manifest and icons on install", async () => {
    await sw.install();
    const cached = [...sw.stores.values()].flatMap((s) => [...s.keys()]);
    expect(cached).toEqual(expect.arrayContaining([`${ORIGIN}${OFFLINE_PATH}`, `${ORIGIN}/manifest.webmanifest`, `${ORIGIN}/icon-192.png`]));
  });

  it("activate drops shell caches of older versions only", async () => {
    sw.stores.set("wadar-shell-v0", new Map());
    sw.stores.set("other-app", new Map());
    await sw.install();
    await sw.activate();
    expect([...sw.stores.keys()].some((k) => k === "wadar-shell-v0")).toBe(false);
    expect(sw.stores.has("other-app")).toBe(true);
  });

  it("a page that can't load (offline) shows the offline page", async () => {
    await sw.install();
    const res = await sw.request("/kopi-dimas/beranda", { mode: "navigate" });
    expect(await res!.text()).toBe(`cached ${OFFLINE_PATH}`);
  });

  it("pages online come from the network and are not stored", async () => {
    sw = loadWorker(online);
    await sw.install();
    const before = [...sw.stores.values()].reduce((n, s) => n + s.size, 0);
    const res = await sw.request("/kopi-dimas/keuangan", { mode: "navigate" });
    expect(await res!.text()).toBe("network /kopi-dimas/keuangan");
    expect([...sw.stores.values()].reduce((n, s) => n + s.size, 0)).toBe(before);
  });

  it("hashed static assets are cache-first: fetched once, then served offline", async () => {
    sw = loadWorker(online);
    await sw.install();
    const path = "/_next/static/chunks/app-abc123.js";
    expect(await (await sw.request(path))!.text()).toBe(`network ${path}`);
    const count = sw.fetched.length;
    expect(await (await sw.request(path))!.text()).toBe(`network ${path}`);
    expect(sw.fetched.length).toBe(count);
  });

  it("API calls, server actions (POST) and other origins are left alone", async () => {
    await sw.install();
    expect(await sw.request("/api/widget/kopi-dimas/chat")).toBeUndefined();
    expect(await sw.request("/kopi-dimas/kasir", { mode: "navigate", method: "POST" })).toBeUndefined();
  });
});

describe("offline page and registration", () => {
  it("has a public /offline page (the worker caches it without a session)", () => {
    expect(existsSync(new URL("./offline/page.tsx", import.meta.url))).toBe(true);
    expect(isPublicPath(OFFLINE_PATH)).toBe(true);
    expect(isPublicPath("/sw.js")).toBe(true);
  });

  it("registers the same worker URL as push notifications, per shop", () => {
    expect(serviceWorkerUrl("kopi dimas")).toBe("/sw.js?slug=kopi%20dimas");
  });
});
