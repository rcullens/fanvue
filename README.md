# Fanvue AI Profile Studio

Premium local **creator ops console** for 21+ AI personas aimed at Fanvue: persona packs, chat simulation, sales-policy automation with PPV drafts, and optional **real Fanvue OAuth** (pricing + chat).

## $0 path (start here)

No paid SaaS required. No fine-tunes. No vector DB.

1. `npm install && npm run dev` — uses the **local mock reply engine** (offline, free).
2. Optional free/cheap OpenAI-compatible providers (same env knobs, no code changes):
   - **Ollama** (local): `OPENAI_BASE_URL=http://localhost:11434/v1`, `OPENAI_MODEL=llama3.2`, any/dummy `OPENAI_API_KEY`
   - **Groq free tier**: `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_MODEL=llama-3.1-8b-instant`
   - Gemini OpenAI-compat / OpenRouter free models — set `OPENAI_BASE_URL` + key + model
3. Set `FORCE_MOCK_ENGINE=1` to always stay on mock even if a key is present.
4. Self-host with `npm run build && npm start` — no Vercel Pro needed.

Automation **fully works in mock** without Fanvue credentials (Simulate fan message → approval queue).

## Features

| Area | What you get |
|------|----------------|
| **Personas** | 21+ packs, tone SFW↔XXX, mistake rate, tags |
| **Chat** | Hyperrealistic sim; mock by default |
| **Automation** | Shared engine + many packs; sales policy; PPV catalog; approval queue; webhook stub |
| **Maintainer** | Mock / Checklist / **Live Fanvue** adapters; honest remote writes only |
| **OAuth** | PKCE mandatory; encrypted token file; refresh rotation |

## Fanvue OAuth setup

1. In Fanvue: **Creator Tools → Build** create **your own** OAuth app (KYC required). Do **not** paste client secrets into chat.
2. App type: off-platform. Redirect URI must be **HTTPS** (even locally — use [mkcert](https://github.com/FiloSottile/mkcert), `local-ssl-proxy`, or a tunnel).
3. Scopes (must match Builder settings), recommended:
   `openid offline_access offline read:self read:creator write:creator read:insights read:chat write:chat read:fan`
4. Copy `.env.local.example` → `.env.local` and fill:
   - `FANVUE_CLIENT_ID` / `FANVUE_CLIENT_SECRET` (or `OAUTH_CLIENT_*`)
   - `FANVUE_REDIRECT_URI` (e.g. `https://localhost:3000/api/fanvue/oauth/callback`)
   - `FANVUE_SCOPES`, `SESSION_SECRET`, API/auth base URLs
5. Run the app over HTTPS → Maintainer → **Connect Fanvue**.

### OAuth routes

- `GET /api/fanvue/oauth/start` — PKCE + state cookies → Fanvue authorize
- `GET /api/fanvue/oauth/callback` — code exchange (`client_secret_basic`) → encrypted `data/fanvue-tokens.json`
- `POST /api/fanvue/oauth/logout` — clear tokens
- `GET /api/fanvue/status` — connected?, handle, sub price, subscribers (no secrets)

Every API call sends `Authorization: Bearer …` and `X-Fanvue-API-Version: 2025-06-26`.

### Live pricing

- Seeds heuristics from `GET /users/account` (sub price in **cents**, subscribers).
- Insights degrade gracefully if unavailable (`live-partial` label).
- **Apply** calls real `PATCH /users/me/subscription-price` with `{ subscriptionPrice }` (399–10000¢).
- **Warning:** price **increases** move existing subscribers to **re-opt-in**. UI confirms before apply. Never claims success on failure.

### Chat automation

- Prefer **webhooks** (`POST /api/automation/webhook`) over polling (cheaper).
- Signature verification is **TODO** (Standard Webhooks + `FANVUE_WEBHOOK_SECRET`).
- Manual: Automation → **Pull unread & draft** (`GET /chats?filter=unread` … draft → approve → `POST /chats/{userUuid}/message`).
- PPV: message body may include `price` (≥300¢) + optional `mediaUuids`.
- Default **`allowAutoSend: false`** — no silent spam.

## Automation worker

`src/lib/automation/`:

- `persona-pack.ts` — system prompt from persona + tone + policy + catalog
- `sales-policy.ts` — reply-only vs reply+PPV
- `draft-reply.ts` — mock ($0) or OpenAI-compatible; `{ text, ppvItemId? }`
- `worker.ts` — process inbound → queue or send

Store fields: `automationQueue`, `automationLog`, `fanSales`, persona `ppvCatalog` + `salesPolicy`.

## Setup

```bash
cd fanvue-ai-studio
npm install
cp .env.local.example .env.local   # optional
npm run dev
```

```bash
npm run build && npm start
```

## Environment variables

See `.env.local.example` for the full list (OpenAI-compatible, Fanvue OAuth, webhook secret, `SESSION_SECRET`).

## Adult / 21+ policy

- Minimum age **21** in UI + server validation.
- NSFW for **fictional 21+ adult personas** only.
- Under-21 / CSAM refused.

## Tech

Next.js 14 App Router · TypeScript · Tailwind · JSON file store · no paid deps.

## License

Private / use for your own creator tooling.
