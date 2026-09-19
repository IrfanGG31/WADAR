import { defineConfig, devices } from "@playwright/test";

/**
 * Needs the full local stack up (`pnpm dev:up` + `supabase start`) — same
 * Docker/Supabase caveat as the Testcontainers integration tests elsewhere
 * in this repo. `baseURL`/`INBUCKET_URL` point at the default local ports;
 * override via env vars for CI.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Pixel 7"] }, // mobile-first per PRD §8.1 — bottom-tab nav
    },
  ],
});
