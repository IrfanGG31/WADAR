import { expect, test, type Page } from "@playwright/test";

/**
 * Core M1 DoD flow (docs/BUILD-PLAN.md): daftar (email OTP) → buat toko +
 * outlet → undang kasir → kasir menerima undangan & masuk → kasir cuma
 * lihat menu sesuai perannya.
 *
 * Needs the full local stack: `pnpm dev:up` (web+api+worker+Postgres+Redis)
 * AND `supabase start` (local Supabase Auth + Inbucket for email OTP) —
 * same Docker/Supabase caveat as this repo's Testcontainers integration
 * tests. Not executable in the sandbox that authored this; run it in CI or
 * on a dev machine with both up before trusting it.
 */

const INBUCKET_URL = process.env.INBUCKET_URL ?? "http://localhost:54324";

interface InbucketMessage {
  id: string;
}

async function getLatestOtpForEmail(email: string): Promise<string> {
  const mailbox = email.split("@")[0]!;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`);
        const messages = (await res.json()) as InbucketMessage[];
        return messages.length;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  const listRes = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`);
  const messages = (await listRes.json()) as InbucketMessage[];
  const latest = messages[messages.length - 1]!;
  const msgRes = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${latest.id}`);
  const message = (await msgRes.json()) as { body: { text: string } };
  const match = /(\d{6})/.exec(message.body.text);
  if (!match) throw new Error(`OTP code not found in email body for ${email}`);
  return match[1]!;
}

async function signInWithEmailOtp(page: Page, email: string): Promise<void> {
  await page.goto("/masuk");
  await page.getByLabel("Alamat email").fill(email);
  await page.getByRole("button", { name: "Kirim kode OTP" }).click();
  const code = await getLatestOtpForEmail(email);
  await page.getByLabel("Kode OTP (6 digit)").fill(code);
  await page.getByRole("button", { name: "Verifikasi & Masuk" }).click();
}

test("owner signs up, creates a store, invites a kasir, and the kasir only sees permission-appropriate menus", async ({
  page,
  browser,
}) => {
  const runId = Date.now();
  const ownerEmail = `owner-e2e-${runId}@example.com`;
  const kasirEmail = `kasir-e2e-${runId}@example.com`;

  // 1. Owner signs up via email OTP.
  await signInWithEmailOtp(page, ownerEmail);
  await expect(page).toHaveURL(/\/onboarding/);

  // 2. Creates a store + first outlet.
  await page.getByLabel("Nama toko / usaha").fill(`Warung E2E ${runId}`);
  await page.getByLabel("Nama outlet pertama").fill("Outlet Utama");
  await page.getByRole("button", { name: "Buat toko" }).click();
  await expect(page).toHaveURL(/\/beranda/);

  // 3. Invites a kasir and grabs the invite link off the page (no
  // email/WA delivery yet — the owner copies it manually, M1 scope).
  await page.goto("/pengaturan/tim");
  await page.getByPlaceholder("nama@usaha.com").fill(kasirEmail);
  await page.getByRole("button", { name: "Kirim undangan" }).click();
  await expect(page.getByText("Undangan dibuat")).toBeVisible();
  const inviteLink = await page.locator('input[readonly]').inputValue();
  expect(inviteLink).toContain("/undangan/");

  // 4. Kasir accepts the invite in a separate browser context (own
  // session), signing in via email OTP first.
  const kasirContext = await browser.newContext();
  const kasirPage = await kasirContext.newPage();
  await signInWithEmailOtp(kasirPage, kasirEmail);

  const inviteUrl = new URL(inviteLink);
  await kasirPage.goto(inviteUrl.pathname);
  await expect(kasirPage.getByText("Kamu diundang bergabung")).toBeVisible();
  await kasirPage.getByRole("button", { name: "Terima undangan" }).click();
  await expect(kasirPage).toHaveURL(/\/beranda/);

  // 5. Kasir's bottom nav shows the tabs their role has permission for
  // (Kasir has cashier:operate, orders:manage, assistant:use — so all 5
  // top-level tabs — but "Lainnya" has no items, since Kasir lacks both
  // settings:manage and team:manage).
  const nav = kasirPage.getByRole("navigation", { name: "Navigasi utama" }).first();
  await expect(nav.getByRole("link", { name: "Kasir" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Pesanan" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Asisten" })).toBeVisible();

  await kasirPage.goto("/lainnya");
  await expect(kasirPage.getByText("Pengaturan Toko")).not.toBeVisible();
  await expect(kasirPage.getByText("Tim")).not.toBeVisible();
  await expect(kasirPage.getByText("Belum ada menu tambahan untuk peranmu saat ini.")).toBeVisible();

  await kasirContext.close();
});
