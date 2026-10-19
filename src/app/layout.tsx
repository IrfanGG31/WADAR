import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { brand } from "@/brand";
import "./globals.css";

// Self-hosted by Next at build time; globals.css's --font-sans reads this variable.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.shortName}` },
  description: brand.tagline,
  // Served by src/app/manifest.ts; listed here so the link tag does not depend on file-convention detection.
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: brand.colors.primary,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
