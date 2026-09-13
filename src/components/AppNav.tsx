"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/personas", label: "Personas", desc: "Builder" },
  { href: "/chat", label: "Chat", desc: "Sim" },
  { href: "/automation", label: "Automation", desc: "PPV" },
  { href: "/maintainer", label: "Maintainer", desc: "Ops" },
];

type Status = {
  connected: boolean;
  handle?: string;
  oauthConfigured?: boolean;
};

export function AppNav() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fanvue/status");
        const json = await res.json();
        if (!cancelled) setStatus(json);
      } catch {
        if (!cancelled) setStatus({ connected: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0d12]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-violet-500/30">
            F
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold tracking-tight text-white group-hover:text-violet-200">
              Fanvue AI Studio
            </div>
            <div className="text-[11px] text-[var(--muted)]">Creator ops · 21+</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 md:flex">
          {links.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-xl px-3 py-2 text-sm transition lg:px-4 ${
                  active
                    ? "bg-white/10 text-white shadow-inner"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                <span className="font-medium">{l.label}</span>
                <span className="ml-1.5 hidden text-[10px] uppercase tracking-wider opacity-60 lg:inline">
                  {l.desc}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div
            className={`badge max-w-[11rem] truncate border ${
              status?.connected
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 bg-white/5 text-[var(--muted)]"
            }`}
            title={
              status?.connected
                ? `Connected as @${status.handle}`
                : status?.oauthConfigured
                  ? "Fanvue OAuth ready — not connected"
                  : "Fanvue not connected"
            }
          >
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                status?.connected ? "bg-emerald-400" : "bg-white/30"
              }`}
            />
            {status?.connected
              ? `@${status.handle || "connected"}`
              : "Not connected"}
          </div>
          <button
            className="btn-secondary !px-2.5 !py-2 md:hidden"
            aria-label="Menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            ☰
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 px-4 py-3 md:hidden">
          <div className="grid grid-cols-2 gap-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-xl border px-3 py-2.5 text-sm ${
                  pathname.startsWith(l.href)
                    ? "border-violet-400/40 bg-violet-500/15 text-white"
                    : "border-white/10 bg-white/5 text-[var(--muted)]"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
