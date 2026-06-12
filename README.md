# Malcom

Malcom is a dark, clean Next.js chat UI for a local OpenAI-compatible model server.

## Local Model

The app is configured for a tiny local test model:

```txt
HuggingFaceTB/SmolLM2-135M-Instruct
```

By default Malcom calls:

```txt
http://localhost:1234/v1/chat/completions
```

Use LM Studio, vLLM, llama.cpp server, or another OpenAI-compatible runtime that can serve the model at that endpoint.

When you want the larger model again, set `MALCOM_MODEL` to:

```txt
HauhauCS/Gemma4-26B-A4B-Uncensored-HauhauCS-Balanced
```

## Configure

Copy the example environment file if you need different settings:

```bash
cp .env.local.example .env.local
```

Available settings:

```txt
MALCOM_MODEL=HuggingFaceTB/SmolLM2-135M-Instruct
MALCOM_LLM_BASE_URL=http://localhost:1234/v1
MALCOM_LLM_API_KEY=not-needed
```

## Run

Install dependencies if needed:

```bash
npm install
```

Start your local model server, then run:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```
