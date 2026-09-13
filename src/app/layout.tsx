import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppNav } from "@/components/AppNav";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Fanvue AI Profile Studio",
  description:
    "Create and manage 21+ AI creator bots for Fanvue — personas, chat sim, and ops panel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <AppNav />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 text-center text-[11px] text-[var(--muted)] sm:px-6">
          Fanvue AI Profile Studio · fictional 21+ adult personas only · no CSAM ·
          v1 uses mock Fanvue adapters (no live API writes)
        </footer>
      </body>
    </html>
  );
}
