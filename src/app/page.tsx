import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="card-glow overflow-hidden p-8 sm:p-10">
        <div className="max-w-2xl">
          <p className="badge mb-4 bg-fuchsia-500/20 text-fuchsia-200">
            Fanvue creator ops console · 21+
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Premium AI creator studio — personas, chat, automation, live OAuth
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[var(--muted)]">
            Build persona packs, simulate hyperrealistic chat ($0 local mock),
            draft auto-replies with optional PPV pitches, and connect real
            Fanvue OAuth when you&apos;re ready. No fine-tunes. No paid SaaS
            required.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/personas" className="btn-primary">
              Open Personas
            </Link>
            <Link href="/automation" className="btn-secondary">
              Automation
            </Link>
            <Link href="/maintainer" className="btn-secondary">
              Maintainer
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Personas",
            body: "21+ packs with tone meter, traits, and PPV catalog hooks.",
            href: "/personas",
          },
          {
            title: "Chat sim",
            body: "Local mock engine free forever; optional Groq/Ollama/Gemini.",
            href: "/chat",
          },
          {
            title: "Automation",
            body: "Policy-gated PPV pitches, approval queue, webhook stub.",
            href: "/automation",
          },
          {
            title: "Maintainer",
            body: "Mock/checklist/live adapters · real sub-price PATCH when connected.",
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

      <section className="card p-5 text-sm text-[var(--muted)]">
        <strong className="text-white">$0 path:</strong>{" "}
        <code className="text-violet-200">npm run dev</code> with no keys uses
        the local mock engine. Optional free endpoints: Ollama{" "}
        <code className="text-violet-200">localhost:11434/v1</code>, Groq free
        tier, Gemini OpenAI-compat, OpenRouter free models. Fanvue OAuth is free
        API access with your own Builder app — HTTPS redirect required.
      </section>
    </div>
  );
}
