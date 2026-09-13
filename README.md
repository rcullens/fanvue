# Fanvue AI Profile Studio

Polished local studio for creating and managing **AI creator bots** aimed at Fanvue’s AI bots / creator workflow. Adults **21+** only.

## Features

1. **Personas** — Build profiles (name, age ≥ 21, ethnicity, location, education, occupation, bio, traits, hobbies, languages, appearance, voice/tone, sub price, tags). Save many; edit/delete; set active.
2. **Chat simulation** — Hyperrealistic in-character replies (typos, filler, emoji, uneven length). Configurable mistake rate. Works **offline** via local mock engine; optional OpenAI-compatible API.
3. **Content tone slider** — Friendly SFW ↔ NSFW XXX; persisted per persona.
4. **Maintainer (ops panel)** — Mock metrics that drift, dynamic pricing heuristics, action log, checklist export. Pluggable `FanvueClient` — **no fake live Fanvue writes**.

## Persistence

JSON file store at `data/store.json` (created automatically). No database server required.

## Setup

```bash
cd fanvue-ai-studio
npm install
cp .env.local.example .env.local   # optional
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build && npm start   # production
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | No | If set, chat uses OpenAI-compatible completions; otherwise mock engine |
| `OPENAI_BASE_URL` | No | Default `https://api.openai.com/v1` |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini` |

## Routes

| Path | Purpose |
|------|---------|
| `/` | Home / feature overview |
| `/personas` | Persona builder & library |
| `/chat` | Hyperrealistic chat simulation |
| `/maintainer` | Fanvue ops panel (mock + checklist) |
| `/api/personas` | CRUD personas |
| `/api/chat` | Chat history + reply |
| `/api/maintainer` | Metrics, pricing, checklist |
| `/api/settings` | App settings snapshot |

## Adult / 21+ policy

- Minimum age is **21** in UI validation and server validation.
- NSFW content is for **fictional 21+ adult personas** only.
- Under-21 / CSAM content is refused.
- This is legitimate adult creator tooling aligned with Fanvue’s AI bots section.

## Extending the Fanvue adapter

See `src/lib/adapters/fanvue-client.ts` for the `FanvueClient` interface.

Shipped adapters:

- **`mock`** (`mock-adapter.ts`) — simulated metrics drift; “apply” updates local state only and states clearly that no remote write occurred.
- **`checklist`** (`checklist-export.ts`) — generates copyable manual Fanvue UI steps.

To add a real backend later, implement `FanvueClient` and register it in `getAdapter()` without claiming success unless the remote API actually succeeds.

## Tech stack

- Next.js 14 App Router · TypeScript · Tailwind CSS
- No auth in v1

## License

Private / use as you wish for your own creator tooling.
