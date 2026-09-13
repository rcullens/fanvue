"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/personas", label: "Personas", desc: "Builder" },
  { href: "/chat", label: "Chat", desc: "Simulation" },
  { href: "/maintainer", label: "Maintainer", desc: "Ops panel" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0d12]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-violet-500/30">
            F
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white group-hover:text-violet-200">
              Fanvue AI Profile Studio
            </div>
            <div className="text-[11px] text-[var(--muted)]">21+ adult creator tooling</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-xl px-3 py-2 text-sm transition sm:px-4 ${
                  active
                    ? "bg-white/10 text-white shadow-inner"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                <span className="font-medium">{l.label}</span>
                <span className="ml-1.5 hidden text-[10px] uppercase tracking-wider opacity-60 sm:inline">
                  {l.desc}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
