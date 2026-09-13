import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="card overflow-hidden p-8 sm:p-10">
        <div className="max-w-2xl">
          <p className="badge mb-4 bg-fuchsia-500/20 text-fuchsia-200">
            Fanvue AI bots · creator tooling
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Build hyperrealistic AI creator profiles
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[var(--muted)]">
            Persona builder, in-character chat simulation with human-like quirks,
            content tone from friendly SFW to NSFW XXX, and a Fanvue ops panel
            with mock metrics and honest adapters. Adults 21+ only.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/personas" className="btn-primary">
              Open Personas
            </Link>
            <Link href="/chat" className="btn-secondary">
              Chat simulation
            </Link>
            <Link href="/maintainer" className="btn-secondary">
              Maintainer
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Persona builder",
            body: "Name, age (21+ enforced), bio, traits, pricing, tags. Save many; pick an active profile.",
            href: "/personas",
          },
          {
            title: "Chat simulation",
            body: "Local mock replies with typos & filler — optional OpenAI-compatible API via .env.local.",
            href: "/chat",
          },
          {
            title: "Account maintainer",
            body: "Dashboard, dynamic pricing heuristics, action log, mock adapter + checklist export.",
            href: "/maintainer",
          },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card block p-5 transition hover:border-violet-400/40"
          >
            <h2 className="font-semibold text-white">{c.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{c.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
