import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { brand } from "@wadar/brand";
import "./globals.css";

// Self-hosted by Next at build time (no runtime request to Google Fonts) —
// theme.css's `--font-sans` reads this CSS variable. Without this, the
// `Inter` name in theme.css never resolved to an actual font file, so every
// page silently fell back to the browser's plain system-ui font.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: brand.name,
  description: brand.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
