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
```

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
http://127.0.0.1:3000
```
