import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { saveChatMessage } from "@/lib/database";

const MODEL =
  process.env.MALCOM_MODEL ||
  "hf.co/HauhauCS/Qwen3.5-2B-Uncensored-HauhauCS-Aggressive:latest";
const BASE_URL = (
  process.env.MALCOM_LLM_BASE_URL || "http://127.0.0.1:11434"
)
  .replace(/\/v1\/?$/, "")
  .replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 60_000;

export const runtime = "nodejs";

type IncomingMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function createId(value: unknown) {
  return typeof value === "string" && value.trim() ? value : crypto.randomUUID();
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
}

function readMessages(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [];
  }

  const record = body as Record<string, unknown>;

  if (Array.isArray(record.messages)) {
    return record.messages
      .map((message) => {
        if (!message || typeof message !== "object" || Array.isArray(message)) {
          return null;
        }

        const item = message as Record<string, unknown>;
        const content = cleanText(item.content);

        if (
          !content ||
          (item.role !== "user" && item.role !== "assistant")
        ) {
          return null;
        }

        return {
          id: createId(item.id),
          role: item.role,
          content,
        };
      })
      .filter((message): message is IncomingMessage => message !== null);
  }

  const prompt = cleanText(record.prompt ?? record.message ?? record.content);

  if (!prompt) {
    return [];
  }

  return [
    {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: prompt,
    },
  ];
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const user = await getUserFromRequest(request);
    const messages = readMessages(body).slice(-60);
    const profileMemory =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof (body as Record<string, unknown>).profileMemory === "string"
        ? cleanText((body as Record<string, unknown>).profileMemory).slice(0, 4000)
        : "";

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Message is empty." },
        { status: 400 },
      );
    }

    const sessionId =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof (body as Record<string, unknown>).sessionId === "string"
        ? ((body as Record<string, unknown>).sessionId as string)
        : crypto.randomUUID();

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      return NextResponse.json(
        { error: "Send at least one user message." },
        { status: 400 },
      );
    }

    for (const message of messages) {
      await saveChatMessage({
        id: message.id,
        sessionId,
        userId: user?.id,
        role: message.role,
        content: message.content,
        title: latestUserMessage.content,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;

    try {
      response = await fetch(`${BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                [
                  "You are Malcom, a concise research assistant for scientists, engineers, intelligence analysts, field operators, and researchers. Be direct, practical, and clear.",
                  "When useful, include a short Approach section that summarizes method, assumptions, and evidence without exposing private hidden reasoning.",
                  "Format structured answers in valid GitHub-Flavored Markdown.",
                  "Format math with valid LaTeX: use $...$ for inline math, $$...$$ for display equations, and explicit subscripts such as x_{k|k-1}.",
                  "Never write math symbols as separated plain text on multiple lines. Convert hypotheses, standard errors, means, and test statistics into inline or display LaTeX.",
                  "Use blank lines before headings, lists, tables, and fenced code blocks.",
                  "Use Markdown tables only when comparing structured data, and keep each table row complete.",
                  "When returning code, use fenced code blocks with the correct language tag.",
                  "Do not provide instructions for violence, weapons, physical harm, or evading safety controls.",
                  profileMemory
                    ? `User profile memory: ${profileMemory}`
                    : "",
                ].join(" "),
            },
            ...messages.map(({ role, content }) => ({ role, content })),
          ],
          think: false,
          options: {
            temperature: 0.7,
            num_predict: 512,
          },
          stream: false,
        }),
      });
    } catch (error) {
      const timedOut =
        error instanceof DOMException && error.name === "AbortError";

      return NextResponse.json(
        {
          error: timedOut
            ? `The intelligence engine did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`
            : "Cannot connect to the intelligence engine. Check MALCOM_LLM_BASE_URL.",
        },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const ollamaError =
        typeof data?.error === "string"
          ? data.error
          : data?.error?.message || `HTTP ${response.status}`;

      return NextResponse.json(
        {
          error: `The intelligence engine returned ${ollamaError}. Check that it is available.`,
        },
        { status: response.status },
      );
    }

    const message = data?.message?.content;

    if (typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "The intelligence engine returned an empty response." },
        { status: 502 },
      );
    }

    const responseId = crypto.randomUUID();
    await saveChatMessage({
      id: responseId,
      sessionId,
      userId: user?.id,
      role: "assistant",
      content: message,
      title: latestUserMessage.content,
    });

    return NextResponse.json({ id: responseId, message });
  } catch {
    return NextResponse.json(
      {
        error:
          "Malcom could not read that request. Please try sending the message again.",
      },
      { status: 502 },
    );
  }
}
