import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const MODEL =
  process.env.MALCOM_MODEL || "HuggingFaceTB/SmolLM2-135M-Instruct";
const BASE_URL = process.env.MALCOM_LLM_BASE_URL || "http://localhost:1234/v1";
const API_KEY = process.env.MALCOM_LLM_API_KEY || "not-needed";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    const messages = body.messages?.filter(
      (message) =>
        typeof message.content === "string" &&
        message.content.trim().length > 0 &&
        ["user", "assistant", "system"].includes(message.role),
    );

    if (!messages?.length) {
      return NextResponse.json(
        { error: "Send at least one message." },
        { status: 400 },
      );
    }

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are Malcom, a concise local AI assistant. Be direct, practical, and clear.",
          },
          ...messages,
        ],
        temperature: 0.7,
        max_tokens: 512,
        stream: false,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            `Local model server returned HTTP ${response.status}.`,
        },
        { status: response.status },
      );
    }

    const message = data?.choices?.[0]?.message?.content;

    if (typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "The local model returned an empty response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json(
      {
        error:
          "Cannot connect to the local model. Start an OpenAI-compatible server on http://localhost:1234/v1 or set MALCOM_LLM_BASE_URL.",
      },
      { status: 502 },
    );
  }
}
