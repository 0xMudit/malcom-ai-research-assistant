import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  getUserMessageAllowance,
  recordUserMessageUse,
  saveChatMessage,
  updateUserGfMemo,
} from "@/lib/database";
import {
  getResponseModeInstruction,
  MALCOM_LLM_BASE_URL,
  MALCOM_MODEL,
  MALCOM_REQUEST_TIMEOUT_MS,
  resolveNumPredict,
} from "@/lib/llm-config";
import {
  isResponseMode,
  type ResponseMode,
} from "@/lib/response-modes";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  analyzePromptPatterns,
  formatPromptPatternMemory,
} from "@/lib/user-patterns";
import {
  formatWebResearchContext,
  formatWebSourcesList,
  researchWebForPrompt,
  type WebResearchSource,
} from "@/lib/web-research";

const MAX_JSON_BODY_BYTES = 180_000;
const MAX_DOCUMENT_CONTEXT_CHARS = 16_000;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_TOTAL_MESSAGE_CHARS = 32_000;
const MAX_SESSION_ID_CHARS = 120;
const MAX_MESSAGE_ID_CHARS = 120;
const GUEST_CHAT_WINDOW_MS = 60 * 60 * 1000;
const GUEST_CHAT_LIMIT = 20;
const bodyEncoder = new TextEncoder();

export const runtime = "nodejs";

type IncomingMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function createId(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, MAX_MESSAGE_ID_CHARS)
    : crypto.randomUUID();
}

function cleanText(value: unknown, maxLength = MAX_MESSAGE_CHARS) {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").trim().slice(0, maxLength)
    : "";
}

async function readJsonBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);

  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    return { tooLarge: true, body: null as unknown };
  }

  const text = await request.text().catch(() => "");

  if (bodyEncoder.encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    return { tooLarge: true, body: null as unknown };
  }

  if (!text.trim()) {
    return { tooLarge: false, body: null as unknown };
  }

  try {
    return { tooLarge: false, body: JSON.parse(text) as unknown };
  } catch {
    return { tooLarge: false, body: null as unknown };
  }
}

function trimMessagesToBudget(messages: IncomingMessage[]) {
  const selected: IncomingMessage[] = [];
  let totalChars = 0;

  for (const message of [...messages].reverse()) {
    if (
      selected.length > 0 &&
      totalChars + message.content.length > MAX_TOTAL_MESSAGE_CHARS
    ) {
      continue;
    }

    selected.push(message);
    totalChars += message.content.length;

    if (totalChars >= MAX_TOTAL_MESSAGE_CHARS) {
      break;
    }
  }

  return selected.reverse();
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

function readDocumentContext(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "";
  }

  const documentContexts = (body as Record<string, unknown>).documentContexts;

  if (!Array.isArray(documentContexts)) {
    return "";
  }

  const context = documentContexts
    .slice(0, 5)
    .map((document, index) => {
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        return "";
      }

      const item = document as Record<string, unknown>;
      const name =
        cleanText(item.name, 180) || `Document ${index + 1}`;
      const content = cleanText(item.content, 5000);

      if (!content) {
        return "";
      }

      return `Document: ${name}\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n")
    .slice(0, MAX_DOCUMENT_CONTEXT_CHARS);

  return context;
}

function readResponseMode(body: unknown): ResponseMode {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "standard";
  }

  const value = (body as Record<string, unknown>).responseMode;

  return isResponseMode(value) ? value : "standard";
}

function readWantsStream(body: unknown) {
  return Boolean(
    body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>).stream === true,
  );
}

function readWebResearchMode(body: unknown) {
  return Boolean(
    body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>).webResearch === true,
  );
}

function readLatestUserContent(messages: IncomingMessage[]) {
  return (
    [...messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.content.toLowerCase() || ""
  );
}

function isChartRequest(messages: IncomingMessage[]) {
  const latestUserContent = readLatestUserContent(messages);

  return /\b(bar graph|bar chart|line graph|line chart|plot|chart)\b/.test(
    latestUserContent,
  );
}

function buildChartRequestInstruction(input: {
  messages: IncomingMessage[];
  documentContext: string;
  webResearchContext: string;
}) {
  if (!isChartRequest(input.messages)) {
    return "";
  }

  const hasSourceData = Boolean(
    input.documentContext.trim() || input.webResearchContext.trim(),
  );

  return [
    "The latest user request is a chart request, so prioritize valid chart output over general explanation.",
    "For a bar graph or bar chart, use Mermaid xychart-beta only. Do not use gantt.",
    "Use exactly one Mermaid chart block when chart data is available, and keep any explanation short.",
    hasSourceData
      ? "Use only the supplied document/web source context for chart values. Do not add unsupported values."
      : "No source dataset was supplied with this request. Do not invent real GDP values, do not cite World Bank/IMF/OECD or any source you did not actually receive, and do not present illustrative numbers as factual. Ask for the country list plus a GDP table/CSV/source, or provide only a clearly labeled xychart-beta template with placeholder labels and placeholder values.",
  ].join(" ");
}

function buildWebResearchInstruction(input: {
  enabled: boolean;
  context: string;
}) {
  if (!input.enabled) {
    return "";
  }

  if (!input.context.trim()) {
    return "Web Research Mode is on, but no web source context was available. Say that web research did not return usable sources before answering from general knowledge.";
  }

  if (input.context.startsWith("Web Research Mode was requested")) {
    return [
      "Web Research Mode is on, but no usable web sources were retrieved.",
      "Tell the user that web research did not return usable sources before answering from general knowledge.",
      `Web research details:\n${input.context}`,
    ].join(" ");
  }

  return [
    "Web Research Mode is on.",
    "Use the web source packet below for current facts, time-sensitive claims, names, prices, releases, policies, or anything that depends on recent information.",
    "Cite web-supported claims with numbered citations like [1] or [2], matching the source packet IDs.",
    "Do not cite links or sources that are not in the web source packet.",
    "If the web sources do not support part of the answer, say what could not be verified.",
    "End with a Sources section containing the cited source titles and URLs.",
    `Web source packet:\n${input.context}`,
  ].join(" ");
}

function buildChatPayload(input: {
  messages: IncomingMessage[];
  profileMemory: string;
  documentContext: string;
  webResearchEnabled: boolean;
  webResearchContext: string;
  responseMode: ResponseMode;
  stream: boolean;
}) {
  const chartRequestInstruction = buildChartRequestInstruction({
    messages: input.messages,
    documentContext: input.documentContext,
    webResearchContext: input.webResearchContext,
  });
  const webResearchInstruction = buildWebResearchInstruction({
    enabled: input.webResearchEnabled,
    context: input.webResearchContext,
  });

  return {
    model: MALCOM_MODEL,
    messages: [
      {
        role: "system",
        content:
          [
            "You are Malcom, a concise research assistant for scientists, engineers, intelligence analysts, field operators, and researchers. Be direct, practical, and clear.",
            "Help across research, writing, code, planning, math, documents, product thinking, and everyday problem solving while staying accurate and safe.",
            "When useful, include a short Approach section that summarizes method, assumptions, and evidence without exposing private hidden reasoning.",
            "Format structured answers in valid GitHub-Flavored Markdown.",
            "Format math with valid LaTeX: use $...$ for inline math, $$...$$ for display equations, and explicit subscripts such as x_{k|k-1}.",
            "Never write math symbols as separated plain text on multiple lines. Convert hypotheses, standard errors, means, and test statistics into inline or display LaTeX.",
            "Use blank lines before headings, lists, tables, and fenced code blocks.",
            "Use Markdown tables only when comparing structured data, and keep each table row complete.",
            "When returning code, use fenced code blocks with the correct language tag.",
            "When the user asks for a flowchart, diagram, architecture map, process map, timeline, sequence, pie chart, or simple chart, return a valid Mermaid diagram in a fenced ```mermaid code block, with a short explanation before or after it when useful. If a diagram, flowchart, or compact chart would materially clarify a complex answer, include one proactively.",
            "Do not duplicate Mermaid diagram source outside the fenced Mermaid block; the interface renders that block visually for the user.",
            "For Mermaid flowcharts, use explicit node IDs and quoted plain-text labels, for example master[\"Primary Node\\n(Master)\"] and decision{\"Choose replica\"}. Do not put HTML tags such as <b> or <br> inside Mermaid labels, and do not use anonymous nodes like {Master}.",
            "For bar charts, bar graphs, line charts, and simple numeric charts, use Mermaid xychart-beta, not gantt. Use this exact pattern: ```mermaid\nxychart-beta\n  title \"Mean GDP by Country, 2014-2023\"\n  x-axis \"Country\" [USA, China, Japan, Germany]\n  y-axis \"Mean GDP (USD trillions)\" 0 --> 25\n  bar [20.2, 13.8, 5.0, 4.0]\n``` Keep x-axis labels short, keep the number of labels equal to the number of values, and use numeric values only inside bar[...] or line[...].",
            "Use Mermaid gantt only for schedules, timelines with dated tasks, or project plans. Never use gantt for a bar graph or GDP comparison.",
            "For data charts, do not invent real-looking data. If the user provides data or document context, chart that data. If the user asks for public facts such as GDP and no source data is available, say the chart needs a source dataset or clearly label any sample chart as illustrative/approximate in the title and explanation.",
            chartRequestInstruction,
            webResearchInstruction,
            "Use personalization to improve relevance, clarity, and pacing; do not manipulate, pressure, or unnecessarily prolong the user's session.",
            "Do not claim that you have no restrictions. Explain boundaries plainly if a request cannot be helped safely.",
            "Do not provide instructions for violence, weapons, physical harm, or evading safety controls.",
            getResponseModeInstruction(input.responseMode),
            input.profileMemory
              ? `User profile memory and adaptive response profile: ${input.profileMemory}`
              : "",
            input.documentContext
              ? `Use the attached document context when it is relevant. Cite document names in the answer when making claims from them. Attached document context:\n${input.documentContext}`
              : "",
          ].join(" "),
      },
      ...input.messages.map(({ role, content }) => ({ role, content })),
    ],
    think: false,
    options: {
      temperature: chartRequestInstruction ? 0.2 : 0.7,
      num_predict: resolveNumPredict(input.responseMode),
    },
    stream: input.stream,
  };
}

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createLlmConnectionError(error: unknown) {
  const timedOut = error instanceof DOMException && error.name === "AbortError";

  return timedOut
    ? `The intelligence engine did not respond within ${MALCOM_REQUEST_TIMEOUT_MS / 1000} seconds.`
    : "Cannot connect to the intelligence engine. Please try again shortly.";
}

function appendWebSourcesIfMissing(message: string, sources: WebResearchSource[]) {
  if (sources.length === 0) {
    return message;
  }

  const sourceList = formatWebSourcesList(sources);

  if (!sourceList) {
    return message;
  }

  const normalizedMessage = message.toLowerCase();
  const alreadyHasSources =
    normalizedMessage.includes("## sources") ||
    normalizedMessage.includes("\nsources\n") ||
    sources.some((source) => message.includes(source.url));

  return alreadyHasSources ? message : `${message.trim()}\n\n${sourceList}`;
}

async function fetchChatEngine(payload: unknown, signal: AbortSignal) {
  return fetch(`${MALCOM_LLM_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify(payload),
  });
}

function streamChatEngine(input: {
  payload: unknown;
  sessionId: string;
  userId?: string;
  title: string;
  webSources: WebResearchSource[];
}) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    MALCOM_REQUEST_TIMEOUT_MS,
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let upstream: Response;

      try {
        upstream = await fetchChatEngine(input.payload, abortController.signal);
      } catch (error) {
        clearTimeout(timeout);
        controller.enqueue(
          encoder.encode(
            encodeSse("error", { error: createLlmConnectionError(error) }),
          ),
        );
        controller.close();
        return;
      }

      if (!upstream.ok) {
        clearTimeout(timeout);
        controller.enqueue(
          encoder.encode(
            encodeSse("error", {
              error: `The intelligence engine returned HTTP ${upstream.status}. Please try again shortly.`,
            }),
          ),
        );
        controller.close();
        return;
      }

      if (!upstream.body) {
        clearTimeout(timeout);
        controller.enqueue(
          encoder.encode(
            encodeSse("error", {
              error: "The intelligence engine returned an empty response.",
            }),
          ),
        );
        controller.close();
        return;
      }

      const reader = upstream.body.getReader();
      let buffer = "";
      let message = "";

      const handleLine = (line: string) => {
        if (!line.trim()) {
          return;
        }

        const event = JSON.parse(line) as {
          done?: boolean;
          message?: { content?: unknown };
        };
        const delta =
          typeof event.message?.content === "string"
            ? event.message.content
            : "";

        if (delta) {
          message += delta;
          controller.enqueue(encoder.encode(encodeSse("delta", { delta })));
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (value) {
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";

            for (const line of lines) {
              handleLine(line);
            }
          }

          if (done) {
            if (buffer.trim()) {
              handleLine(buffer);
            }
            break;
          }
        }

        if (!message.trim()) {
          controller.enqueue(
            encoder.encode(
              encodeSse("error", {
                error: "The intelligence engine returned an empty response.",
              }),
            ),
          );
          controller.close();
          return;
        }

        const finalMessage = appendWebSourcesIfMissing(message, input.webSources);
        const trimmedMessage = message.trim();
        const appendedSources =
          finalMessage !== message && finalMessage.startsWith(trimmedMessage)
            ? finalMessage.slice(trimmedMessage.length)
            : "";

        if (appendedSources) {
          controller.enqueue(
            encoder.encode(encodeSse("delta", { delta: appendedSources })),
          );
        }

        const responseId = crypto.randomUUID();
        await saveChatMessage({
          id: responseId,
          sessionId: input.sessionId,
          userId: input.userId,
          role: "assistant",
          content: finalMessage,
          title: input.title,
        });
        const usage = input.userId
          ? await recordUserMessageUse(input.userId)
          : null;

        controller.enqueue(
          encoder.encode(encodeSse("done", { id: responseId, usage })),
        );
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeSse("error", {
              error: createLlmConnectionError(error),
            }),
          ),
        );
        controller.close();
      } finally {
        clearTimeout(timeout);
      }
    },
    cancel() {
      clearTimeout(timeout);
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  try {
    const parsedBody = await readJsonBody(request);

    if (parsedBody.tooLarge) {
      return NextResponse.json(
        {
          error:
            "That request is too large. Shorten the prompt or attach fewer documents.",
        },
        { status: 413 },
      );
    }

    const body = parsedBody.body;
    const user = await getUserFromRequest(request);
    const messages = trimMessagesToBudget(readMessages(body).slice(-60));
    const profileMemory =
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      typeof (body as Record<string, unknown>).profileMemory === "string"
        ? cleanText((body as Record<string, unknown>).profileMemory).slice(0, 4000)
        : "";
    const documentContext = readDocumentContext(body);
    const responseMode = readResponseMode(body);
    const stream = readWantsStream(body);
    const webResearchEnabled = readWebResearchMode(body);

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
            .trim()
            .slice(0, MAX_SESSION_ID_CHARS)
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

    if (user) {
      const allowance = await getUserMessageAllowance(user.id);

      if (!allowance.allowed) {
        return NextResponse.json(
          {
            error:
              allowance.status.cooldownSecondsRemaining > 0
                ? "Your free message window is cooling down."
                : "Your free message limit has been reached.",
            usage: allowance.status,
          },
          { status: 429 },
        );
      }
    } else {
      const allowance = checkRateLimit(request, {
        namespace: "guest-chat",
        limit: GUEST_CHAT_LIMIT,
        windowMs: GUEST_CHAT_WINDOW_MS,
      });

      if (!allowance.allowed) {
        return NextResponse.json(
          {
            error:
              "Guest chat is temporarily rate-limited. Please try again shortly or sign in to continue.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(allowance.retryAfterSeconds),
            },
          },
        );
      }
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

    const adaptiveProfileMemory = user
      ? (await updateUserGfMemo(user.id)).summary
      : formatPromptPatternMemory(
          analyzePromptPatterns(
            messages
              .filter((message) => message.role === "user")
              .map((message) => ({ content: message.content })),
          ),
        );
    const mergedProfileMemory = [profileMemory, adaptiveProfileMemory]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 6000);
    const webResearch = webResearchEnabled
      ? await researchWebForPrompt(latestUserMessage.content)
      : null;
    const webResearchContext = webResearch
      ? formatWebResearchContext(webResearch)
      : "";
    const webSources = webResearch?.sources || [];

    const payload = buildChatPayload({
      messages,
      profileMemory: mergedProfileMemory,
      documentContext,
      webResearchEnabled,
      webResearchContext,
      responseMode,
      stream,
    });

    if (stream) {
      return streamChatEngine({
        payload,
        sessionId,
        userId: user?.id,
        title: latestUserMessage.content,
        webSources,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MALCOM_REQUEST_TIMEOUT_MS,
    );

    let response: Response;

    try {
      response = await fetchChatEngine(payload, controller.signal);
    } catch (error) {
      return NextResponse.json(
        { error: createLlmConnectionError(error) },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `The intelligence engine returned HTTP ${response.status}. Please try again shortly.`,
        },
        { status: response.status },
      );
    }

    const data = await response.json().catch(() => null);

    const message = data?.message?.content;

    if (typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "The intelligence engine returned an empty response." },
        { status: 502 },
      );
    }

    const finalMessage = appendWebSourcesIfMissing(message, webSources);
    const responseId = crypto.randomUUID();
    await saveChatMessage({
      id: responseId,
      sessionId,
      userId: user?.id,
      role: "assistant",
      content: finalMessage,
      title: latestUserMessage.content,
    });
    const usage = user ? await recordUserMessageUse(user.id) : null;

    return NextResponse.json({ id: responseId, message: finalMessage, usage });
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
