import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: { default: "Ayal — skills from your neighbours", template: "%s · Ayal" },
  description: "Find and offer everyday skills within your own locality. Tutoring, errands, home cooking, repairs and more, from people who live next door.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Ayal", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1f6f5c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <Header />
        <main className="mx-auto w-full max-w-3xl px-4 pt-5 pb-16">{children}</main>
        <footer className="mx-auto max-w-3xl px-4 pb-10 text-xs text-muted">
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-5">
            <span>Ayal connects neighbours. It doesn&apos;t employ or vouch for anyone.</span>
            <Link href="/safety" className="hover:text-brand">Safety</Link>
            <Link href="/terms" className="hover:text-brand">Terms</Link>
            <Link href="/privacy" className="hover:text-brand">Privacy</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
