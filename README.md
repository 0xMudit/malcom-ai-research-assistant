# Malcom

**An all-round AI workspace for research, analysis, and long-form problem solving.**

Malcom combines streamed model responses, web research, document context, persistent workspaces, account management, operational health reporting, and subscription billing in a production-oriented Next.js application.

[Live application](https://malcom-lake.vercel.app) · [System status](https://malcom-lake.vercel.app/status) · [Portfolio](https://mudityaraghav.vercel.app)

## Product overview

- Streamed AI conversations with Brief, Standard, and Deep response modes
- Optional web research with source collection and citations
- Document upload and context-aware responses
- Markdown, tables, code, Mermaid diagrams, and KaTeX math rendering
- Guest mode plus Supabase email/password authentication
- Saved chats, folders, tags, pinned sessions, starred answers, and profile memory
- Local SQLite operation with an optional Supabase primary store and backup project
- Stripe Checkout, customer portal, webhook handling, and subscription synchronization
- Admin workflows for access requests, feedback, usage, and account operations
- Public health/status reporting, robots metadata, sitemap generation, and smoke tests

## Engineering highlights

Malcom is designed to keep useful development paths available when optional infrastructure is absent. SQLite provides the local fallback, DuckDuckGo supports keyless research, Redis caching is optional, and billing features stay isolated until Stripe is configured. The health API reports application, model, storage, and billing readiness independently.

| Area | Implementation |
| --- | --- |
| Web application | Next.js 16 App Router, React 19, TypeScript |
| AI runtime | Ollama-compatible streaming chat endpoint |
| Rich responses | React Markdown, GFM, KaTeX, Mermaid |
| Persistence | Supabase/Postgres with SQLite fallback |
| Authentication | Supabase Auth and server-side session handling |
| Billing | Stripe Checkout, webhooks, portal, subscription sync |
| Caching | Optional Redis/KV cache |
| Operations | Health endpoints, status UI, smoke checks, production deployment script |

## Quick start

### Prerequisites

- Node.js 20 or newer
- npm
- An Ollama-compatible chat server at `http://127.0.0.1:11434` or another configured URL

### Install and run

```bash
git clone https://github.com/0xMudit/malcom-ai-research-assistant.git
cd malcom-ai
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Ensure the model named by `MALCOM_MODEL` is available from the configured model server.

Supabase, Stripe, Brave Search, and Redis are optional for local development. Without Supabase, application data falls back to `data/malcom.sqlite`.

## Configuration

`.env.example` contains every supported setting with safe placeholder values. The main groups are:

- `MALCOM_*`: model, output limits, request timeout, web-research limits, and admin session settings
- `NEXT_PUBLIC_*`: canonical application URL and browser-safe Supabase/Stripe configuration
- `SUPABASE_*`: primary project, optional backup project, and schema connection URL
- `STRIPE_*`: secret key, webhook secret, prices, and currency
- `REDIS_URL` / `KV_URL`: optional cache connection
- `BRAVE_SEARCH_API_KEY`: production search provider; DuckDuckGo remains the fallback

Never commit `.env.local` or production credentials.

## Optional services

### Supabase

Run `supabase/schema.sql` in the Supabase SQL editor, then configure the public URL, anon key, and service-role key. To apply the schema with a direct connection string:

```bash
SUPABASE_DB_URL=postgresql://... npm run supabase:apply-schema
```

Enable email/password authentication in the Supabase project for account registration and saved user workspaces. Configuration and schema status are exposed through `/api/supabase/health` and the `/status` page.

### Web research

The composer’s Web mode searches for relevant pages, fetches a limited set of results, injects source excerpts into model context, and retains source links. Development works without a search key through DuckDuckGo Lite. Set `BRAVE_SEARCH_API_KEY` for Brave Search in production.

### Stripe

`STRIPE_PRICE_ID_PRO` and `STRIPE_PRICE_ID_ENTERPRISE` accept either recurring Stripe Price IDs (`price_...`) or numeric development amounts in cents (`999`, `2999`). Forward local webhooks with:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the resulting `whsec_...` value into `STRIPE_WEBHOOK_SECRET` and restart the app.

### Admin access

Set `MALCOM_ADMIN_USER`, `MALCOM_ADMIN_PASSWORD`, and a strong independent `MALCOM_ADMIN_SESSION_SECRET` in production. The `/admin` dashboard uses an HTTP-only signed session and protected API operations.

## Project structure

```text
src/
  app/                  App Router pages and API routes
  components/           Shared product and account UI
  lib/
    database.ts         Supabase/SQLite persistence layer
    llm-config.ts       Model runtime configuration
    web-research.ts     Search, fetch, and source normalization
    stripe.ts           Checkout and plan configuration
    health.ts           Component-level readiness checks
    supabase/            Browser, server, and admin clients
scripts/                Schema, smoke-test, asset, and deployment tools
supabase/schema.sql     Database schema
```

## Verification

```bash
npm run lint
npm run build
npm run smoke
```

`npm run smoke` checks the public pages, health endpoint, and expected chat API error handling. Run it against a started production instance.

## Production deployment

Build and start directly:

```bash
npm ci
npm run build
npm start
```

The repository also includes `npm run deploy:prod` for the current host deployment workflow. Review the script and environment configuration before using it on another server.

## API surface

The App Router exposes APIs for chat, documents, feedback, access requests, accounts, saved workspaces, usage, health, Supabase diagnostics, and Stripe lifecycle events. See `src/app/api/` for the route implementations.
