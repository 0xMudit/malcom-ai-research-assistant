# Malcom

Malcom is a dark research command interface for scientists, engineers, intelligence analysts, field operators, and researchers.

## Engine

The app is configured for this model:

```txt
hf.co/HauhauCS/Qwen3.5-2B-Uncensored-HauhauCS-Aggressive:latest
```

By default Malcom calls the chat engine endpoint at:

```txt
http://127.0.0.1:11434/api/chat
```

The server route requests normal visible responses. The UI shows a concise "How Malcom is working" panel while an answer is being prepared.

## Configure

Available settings:

```txt
MALCOM_MODEL=hf.co/HauhauCS/Qwen3.5-2B-Uncensored-HauhauCS-Aggressive:latest
MALCOM_LLM_BASE_URL=http://127.0.0.1:11434
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Supabase

Supabase client helpers live in `src/lib/supabase/`.

- `createSupabaseBrowserClient()` returns a browser client when public keys are configured.
- `createSupabaseServerClient()` returns a server-side anon client.
- `createSupabaseAdminClient()` returns a server-only service-role client.

Run `supabase/schema.sql` in your Supabase SQL editor to create the tables used by Malcom. With all three Supabase env vars set, chat history, feedback, access requests, response feedback, stats, sexual health facts, user-owned saved chats, and starred responses use Supabase. Without Supabase config, Malcom falls back to local SQLite in `data/malcom.sqlite`.

For user accounts, enable Supabase Auth email/password sign-ins in your Supabase project. Signed-in users can reopen their saved chat sessions from the sidebar and star assistant responses for later review.

After adding Supabase keys to `.env.local`, restart the dev server and check:

```txt
http://65.0.71.41:3001/api/supabase/health
```

The admin dashboard is protected by Basic Auth and includes approve, reject, and reset actions for access requests.

## Run

Install dependencies if needed:

```bash
npm install
```

Start the chat engine, then run:

```bash
npm run dev
```

Open:

```txt
http://65.0.71.41:3001
```
