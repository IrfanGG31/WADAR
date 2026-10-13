import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { brand } from "@/brand";
import "./globals.css";

// Self-hosted by Next at build time; globals.css's --font-sans reads this variable.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.shortName}` },
  description: brand.tagline,
};

export const viewport: Viewport = {
  themeColor: brand.colors.primary,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
