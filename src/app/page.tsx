"use client";

import {
  AlertCircle,
  BookMarked,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Check,
  CircleUserRound,
  Copy,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  EllipsisVertical,
  FileText,
  FolderOpen,
  LogIn,
  LogOut,
  Mail,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  RefreshCcw,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Zap,
  X,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  type DragEvent,
  type FormEvent,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { readApiJson } from "@/lib/api-client";
import {
  responseModes,
  type ResponseMode,
} from "@/lib/response-modes";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./page.module.css";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
};

type StoredChat = {
  sessionId: string;
  messages: Message[];
};

type HomeProps = {
  initialSessionId?: string;
  forceNew?: boolean;
};

type SavedSession = {
  id: string;
  title: string;
  folder?: string | null;
  tags?: string | null;
  pinned?: number | boolean | null;
  created_at: string;
  updated_at: string;
  messages?: Message[];
};

type StarredResponse = {
  id: string;
  message_id: string;
  session_id: string;
  content: string;
  created_at: string;
};

type UserProfile = {
  display_name: string;
  memory: string;
};

type GfMemo = {
  promptCount: number;
  averageWords: number;
  lastActive: string;
  topTopics: string[];
  intentMix: Array<{ label: string; count: number }>;
  styleSignals: string[];
  responseProfile: string;
  samplePrompt: string;
  summary: string;
  updated_at: string;
};

type DocumentResource = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content: string;
  summary: string;
  createdAt: string;
};

type ResponseReaction = "like" | "dislike";
type SettingsTab = "general" | "profile" | "plan" | "data";

type ResponseState = {
  reaction?: ResponseReaction;
  copied?: boolean;
  commenting?: boolean;
  comment?: string;
  status?: string;
};

type AccountUsage = {
  plan: "free" | "pro" | "enterprise";
  messagesUsed: number;
  messagesLimit: number | null;
  responsesRemaining: number | null;
  cooldownUntil: string | null;
  cooldownSecondsRemaining: number;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  isLimited: boolean;
};

type AuthPayload = {
  user?: (User & { identities?: unknown[] }) | null;
  session?: Session | null;
};

type ChatStreamEvent = {
  delta?: string;
  id?: string;
  error?: string;
  usage?: AccountUsage | null;
};

type BillingAlert = {
  kind: "success" | "error" | "info";
  title: string;
  message: string;
};

const initialMessages: Message[] = [];
const chatStorageKey = "malcom.chat.v3";
const guestSessionsKey = "malcom.guest.sessions.v2";
const guestStarsKey = "malcom.guest.stars.v2";
const guestDocumentsKey = "malcom.guest.documents.v2";
const guestUsageKey = "malcom.guest.responses.v1";
const billingNoticeKey = "malcom.billing.notice.v1";
const guestResponseLimit = 10;
const maxUploadBytes = 2 * 1024 * 1024;
const maxSelectedDocuments = 5;

const upgradePlans = [
  {
    id: "pro" as const,
    eyebrow: "For frequent users",
    name: "Pro",
    price: "$9.99",
    cadence: "/mo",
    description: "Higher limits for longer solo work sessions.",
    features: [
      "Higher message limits",
      "Saved chats, files, memory, and starred answers",
      "Diagrams, tables, math, document analysis, and code help",
    ],
  },
  {
    id: "enterprise" as const,
    eyebrow: "For heavier work",
    name: "Enterprise",
    price: "$29.99",
    cadence: "/mo",
    description: "The strongest plan for larger workloads and fewer interruptions.",
    features: [
      "Highest configured limits",
      "Everything in Pro",
      "Built for teams, operators, and power users",
    ],
  },
];

const comparisonRows = [
  ["Messages", "100/window", "Higher", "Highest"],
  ["Saved workspace", "Yes", "Yes", "Yes"],
  ["gf_memo personalization", "Basic", "Enhanced", "Enhanced"],
  ["Documents and diagrams", "Included", "Included", "Included"],
  ["Best fit", "Trying Malcom", "Daily work", "Heavy usage"],
];

const settingsTabs: Array<{
  value: SettingsTab;
  label: string;
  icon: typeof Settings;
}> = [
  { value: "general", label: "General", icon: Settings },
  { value: "profile", label: "Profile", icon: CircleUserRound },
  { value: "plan", label: "Plan", icon: CreditCard },
  { value: "data", label: "Data", icon: ShieldCheck },
];

const supportedFileExtensions = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".sql",
  ".html",
  ".css",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
];

const waitingFlow = [
  {
    label: "Reading intent",
    detail: "I have your prompt. The first useful thread is being pulled out now.",
  },
  {
    label: "Mapping the answer",
    detail: "I am turning the rough shape into sections you can actually use.",
  },
  {
    label: "Checking details",
    detail: "I am looking for weak spots, missing context, and better framing.",
  },
  {
    label: "Writing cleanly",
    detail: "I am tightening the response so it lands without extra noise.",
  },
];

const webResearchWaitingFlow = [
  {
    label: "Searching web",
    detail: "I am finding current sources that match the request.",
  },
  {
    label: "Reading sources",
    detail: "I am pulling useful excerpts and checking what the links support.",
  },
  {
    label: "Mapping citations",
    detail: "I am tying claims back to the sources before writing.",
  },
  {
    label: "Writing cleanly",
    detail: "I am tightening the response and keeping source links visible.",
  },
];

const waitingNudges = [
  {
    label: "Add context",
    text: "Also consider this context: ",
  },
  {
    label: "Ask follow-up",
    text: "Next, help me go deeper on: ",
  },
  {
    label: "Make practical",
    text: "After this, turn it into practical steps.",
  },
];

const promptPlaceholders = [
  "Ask anything. I will make it clear.",
  "Drop the rough version.",
  "Paste context and ask what comes next.",
  "Start with what you need to understand.",
  "Ask Malcom for a clear answer.",
];

const promptStarters = [
  {
    label: "Explain",
    text: "Explain this clearly: ",
  },
  {
    label: "Compare",
    text: "Compare the best options for: ",
  },
  {
    label: "Plan",
    text: "Build a practical plan for: ",
  },
  {
    label: "Improve",
    text: "Improve this and explain what changed: ",
  },
];

const firstRunPrompts = [
  {
    label: "Untangle a decision",
    detail: "Compare options and leave with a next move.",
    text: "Help me decide between these options. Ask only the essential clarifying questions, then recommend the next move:\n",
  },
  {
    label: "Make a plan",
    detail: "Turn a rough goal into steps, risks, and priorities.",
    text: "Turn this goal into a practical plan with the first three actions, likely blockers, and what to do today:\n",
  },
  {
    label: "Improve my draft",
    detail: "Paste rough text and get a cleaner version.",
    text: "Improve this draft. Keep my intent, make it clearer, and explain the most important edits:\n",
  },
];

const welcomeMessages = [
  "Bring the thought you cannot quite organize yet.",
  "Ask the question that has been sitting in the back of your mind.",
  "Drop in a rough idea, a file, or a problem. We can make it clearer.",
  "Start with the messy version. Clarity can come next.",
  "What should we untangle today?",
  "Give me the spark. I will help shape it into something useful.",
  "Curiosity is enough of a starting point.",
  "Tell me what you want to understand, build, fix, or decide.",
];

function createMessageId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function parseSseMessage(block: string) {
  const lines = block.split(/\r?\n/);
  const event =
    lines
      .find((line) => line.startsWith("event:"))
      ?.replace(/^event:\s*/, "")
      .trim() || "message";
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("\n");

  if (!data) {
    return null;
  }

  return {
    event,
    data: JSON.parse(data) as ChatStreamEvent,
  };
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.ceil((safeSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${Math.max(1, minutes)}m`;
  }

  return `${hours}h ${minutes}m`;
}

function decodeEmailFromAccessToken(accessToken: string) {
  const [, payload] = accessToken.split(".");

  if (!payload) {
    return "";
  }

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const claims = JSON.parse(window.atob(padded)) as { email?: unknown };

    return typeof claims.email === "string" ? claims.email : "";
  } catch {
    return "";
  }
}

function getAuthRedirectFromUrl() {
  const [, rawHash = ""] = window.location.href.split("#");
  const hash = (window.location.hash || rawHash).replace(/^#/, "");

  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const type = params.get("type") || "";

  if (!type) {
    return null;
  }

  const accessToken = params.get("access_token");

  return {
    type,
    email: accessToken ? decodeEmailFromAccessToken(accessToken) : "",
  };
}

function getOAuthCallbackUrl() {
  return new URL("/auth/callback", window.location.origin).toString();
}

function getOAuthCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("code") || "";
}

function removeOAuthCodeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");

  window.history.replaceState(
    null,
    document.title,
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function normalizeMath(math: string) {
  return math
    .replace(/\\frac_\{([^}]+)\}\{([^}]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\frac_([A-Za-z0-9]+)\{([^}]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\text_\{([^}]+)\}/g, "\\text{$1}")
    .replace(/\\(hat|bar|tilde|vec)_\{([^}]+)\}/g, "\\$1{$2}")
    .replace(/\\bar_\{([^}]+)\}/g, "\\bar{$1}");
}

function normalizeMarkdown(content: string) {
  return content
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\r\n/g, "\n")
    .split(/(```[\s\S]*?```)/g)
    .map((segment) => {
      if (segment.startsWith("```")) {
        return segment;
      }

      return segment
        .replace(
          /\\\[([\s\S]*?)\\\]/g,
          (_, math: string) => `$$${normalizeMath(math)}$$`,
        )
        .replace(
          /\\\(([\s\S]*?)\\\)/g,
          (_, math: string) => `$${normalizeMath(math)}$`,
        )
        .replace(
          /\$\$([\s\S]*?)\$\$/g,
          (match, math: string) =>
            math.trim() ? `$$${normalizeMath(math)}$$` : match,
        )
        .replace(
          /(?<!\$)\$([^$\n]+)\$(?!\$)/g,
          (match, math: string) =>
            math.trim() ? `$${normalizeMath(math)}$` : match,
        )
        .replace(/([^\n])(\s*#{1,6}\s+)/g, "$1\n\n$2")
        .replace(/([^\n])(\s*\|[^\n]+\|\s*\n\s*\|[\s:|.-]+\|)/g, "$1\n\n$2")
        .replace(/\n{3,}/g, "\n\n");
    })
    .join("")
    .trim();
}

function isMermaidLanguage(language: string) {
  const normalizedLanguage = language.toLowerCase();

  return [
    "mermaid",
    "mmd",
    "flowchart",
    "sequence",
    "sequencediagram",
    "classdiagram",
    "statediagram",
    "statediagram-v2",
    "erdiagram",
    "journey",
    "gantt",
    "pie",
    "quadrantchart",
    "requirementdiagram",
    "gitgraph",
    "mindmap",
    "timeline",
    "xychart",
    "xychart-beta",
  ].includes(normalizedLanguage);
}

function looksLikeMermaidCode(code: string) {
  const firstContentLine = code
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"));

  return Boolean(
    firstContentLine?.match(
      /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|mindmap|timeline|xychart(?:-beta)?)\b/i,
    ),
  );
}

function mermaidNodeId(label: string) {
  const id = label
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return id || `Node_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanMermaidLabel(label: string) {
  return label
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, "$2")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(b|strong|i|em)>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMermaidLabel(label: string) {
  return cleanMermaidLabel(label).replace(/\\/g, "\\\\").replace(/"/g, "'");
}

function quoteMermaidLabel(label: string, left: string, right: string) {
  const cleanedLabel = formatMermaidLabel(label);

  if (!cleanedLabel) {
    return `${left}${right}`;
  }

  return `${left}"${cleanedLabel}"${right}`;
}

function cleanMermaidEdgeLabel(label: string) {
  return cleanMermaidLabel(label)
    .replace(/\|/g, "/")
    .replace(/^["']|["']$/g, "");
}

function repairMixedMermaidEdges(line: string) {
  return line
    .replace(
      /--\s*"([^"\n]+)"\s*-\.->/g,
      (_, label: string) => `-.->|${cleanMermaidEdgeLabel(label)}|`,
    )
    .replace(
      /--\s*"([^"\n]+)"\s*->/g,
      (_, label: string) => `-->|${cleanMermaidEdgeLabel(label)}|`,
    )
    .replace(
      /\|\s*([^|\n]+?)\s*\|/g,
      (_, label: string) => `|${cleanMermaidEdgeLabel(label)}|`,
    );
}

function cleanMermaidNodeDetail(detail: string) {
  return cleanMermaidLabel(
    detail
      .replace(/\b([A-Za-z][\w -]*)\(\s*["']?([^"')]+)["']?\s*\)/g, "$1 $2")
      .replace(/[()]/g, " ")
      .replace(/\s*:\s*/g, " "),
  );
}

function mergeTrailingMermaidNodeDetails(line: string) {
  if (/(?:-{1,3}|={1,3}|\.?-+\.?)>/.test(line)) {
    return line;
  }

  return line.replace(
    /^(\s*)([A-Za-z_][\w-]*)(\s*)([\[{(])([^\]})\n]+)([\]})])\s*:\s*(.+?)\s*$/,
    (
      _,
      indent: string,
      id: string,
      spacing: string,
      open: string,
      label: string,
      close: string,
      detail: string,
    ) => {
      const cleanedLabel = cleanMermaidLabel(label);
      const cleanedDetail = cleanMermaidNodeDetail(detail);
      const mergedLabel = [cleanedLabel, cleanedDetail]
        .filter(Boolean)
        .join(" - ");

      return `${indent}${id}${spacing}${open}"${formatMermaidLabel(mergedLabel)}"${close}`;
    },
  );
}

function normalizeMermaidSubgraph(line: string) {
  return line.replace(
    /^(\s*subgraph\s+)([A-Za-z_][\w-]*)\s*[{(]([^{}()\n]+)[})]\s*$/i,
    (_match, prefix: string, id: string, label: string) =>
      quoteMermaidLabel(label, `${prefix}${id}[`, "]"),
  );
}

function quoteMermaidNodeLabels(line: string) {
  return line
    .replace(
      /\b([A-Za-z_][\w-]*)\[([^\]\n]+)\]/g,
      (_, id: string, label: string) =>
        quoteMermaidLabel(label, `${id}[`, "]"),
    )
    .replace(
      /\b([A-Za-z_][\w-]*)\{([^{}\n]+)\}/g,
      (_, id: string, label: string) =>
        quoteMermaidLabel(label, `${id}{`, "}"),
    )
    .replace(
      /\b([A-Za-z_][\w-]*)\(([^()\n]+)\)/g,
      (_, id: string, label: string) =>
        quoteMermaidLabel(label, `${id}(`, ")"),
    );
}

function addIdsToStandaloneDiamonds(line: string) {
  return line.replace(
    /(^|[\s>|.-])\{([^{}\n]+)\}/g,
    (_, prefix: string, label: string) => {
      const cleanedLabel = cleanMermaidLabel(label);

      return `${prefix}${mermaidNodeId(cleanedLabel)}{"${cleanedLabel}"}`;
    },
  );
}

function normalizeMermaidCode(code: string) {
  return code
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter(
      (line) =>
        !/^\s*(linkStyle|style|classDef|class)\b/i.test(line.trim()),
    )
    .map((line) =>
      addIdsToStandaloneDiamonds(
        quoteMermaidNodeLabels(
          mergeTrailingMermaidNodeDetails(
            normalizeMermaidSubgraph(repairMixedMermaidEdges(line)),
          ),
        ).replace(/:::[A-Za-z_][\w-]*/g, ""),
      ),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type DiagramNode = {
  id: string;
  label: string;
};

type DiagramEdge = {
  from: string;
  to: string;
  label: string;
};

type DiagramPreview = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

function readableMermaidId(id: string) {
  return id.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || id;
}

function extractMermaidShapeLabel(shape: string) {
  return cleanMermaidLabel(shape.slice(1, -1));
}

function buildDiagramPreview(code: string): DiagramPreview {
  const nodes = new Map<string, string>();
  const edges: DiagramEdge[] = [];
  const nodeWithLabelPattern =
    /\b([A-Za-z_][\w-]*)\s*(\[[^\]\n]+\]|\{[^{}\n]+\}|\([^()\n]+\))/g;

  const addNode = (id: string, label?: string) => {
    const cleanedLabel = label ? cleanMermaidLabel(label) : "";

    if (!nodes.has(id)) {
      nodes.set(id, cleanedLabel || readableMermaidId(id));
      return;
    }

    if (cleanedLabel && nodes.get(id) === readableMermaidId(id)) {
      nodes.set(id, cleanedLabel);
    }
  };

  for (const rawLine of code.split("\n")) {
    const line = rawLine.trim();

    if (
      !line ||
      line.startsWith("%%") ||
      /^(graph|flowchart|direction|end)\b/i.test(line) ||
      /^subgraph\b/i.test(line)
    ) {
      continue;
    }

    for (const match of line.matchAll(nodeWithLabelPattern)) {
      addNode(match[1], extractMermaidShapeLabel(match[2]));
    }

    let edgeLabel = "";
    const lineWithoutLabels = line.replace(
      /\|([^|\n]+)\|/g,
      (_match, label: string) => {
        edgeLabel ||= cleanMermaidEdgeLabel(label);

        return " ";
      },
    );
    const structuralLine = lineWithoutLabels.replace(
      nodeWithLabelPattern,
      (_match, id: string) => id,
    );
    const edgeMatch = structuralLine.match(
      /^\s*([A-Za-z_][\w-]*)\s*(?:[-.=ox]+>|[-.]+)\s*([A-Za-z_][\w-]*)/,
    );

    if (edgeMatch) {
      addNode(edgeMatch[1]);
      addNode(edgeMatch[2]);
      edges.push({
        from: edgeMatch[1],
        to: edgeMatch[2],
        label: edgeLabel,
      });
      continue;
    }

    const nodeOnlyMatch = structuralLine.match(/^\s*([A-Za-z_][\w-]*)\s*$/);

    if (nodeOnlyMatch) {
      addNode(nodeOnlyMatch[1]);
    }
  }

  return {
    nodes: Array.from(nodes, ([id, label]) => ({ id, label })),
    edges: edges.slice(0, 12),
  };
}

function DiagramPreviewFallback({ code }: { code: string }) {
  const preview = useMemo(() => buildDiagramPreview(code), [code]);
  const nodeLabels = new Map(
    preview.nodes.map((node) => [node.id, node.label] as const),
  );

  if (!preview.nodes.length) {
    return (
      <div className={styles.diagramUnavailable}>
        Diagram preview unavailable.
      </div>
    );
  }

  if (!preview.edges.length) {
    return (
      <div className={styles.diagramFallback}>
        <div className={styles.diagramNodeGrid}>
          {preview.nodes.slice(0, 16).map((node) => (
            <span key={node.id}>{node.label}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.diagramFallback}>
      <div className={styles.diagramFallbackFlow}>
        {preview.edges.map((edge, index) => (
          <div
            className={styles.diagramFallbackEdge}
            key={`${edge.from}-${edge.to}-${index}`}
          >
            <span>{nodeLabels.get(edge.from) || readableMermaidId(edge.from)}</span>
            <span aria-hidden="true" className={styles.diagramFallbackArrow}>
              {edge.label || "connects"}
            </span>
            <span>{nodeLabels.get(edge.to) || readableMermaidId(edge.to)}</span>
          </div>
        ),
        )}
      </div>
    </div>
  );
}

function stripMermaidStyleLines(code: string) {
  return code
    .split("\n")
    .filter(
      (line) =>
        !/^\s*(linkStyle|style|classDef|class)\b/i.test(line.trim()),
    )
    .join("\n")
    .trim();
}

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [hasRenderError, setHasRenderError] = useState(false);
  const renderCode = useMemo(() => normalizeMermaidCode(code), [code]);
  const diagramId = useMemo(
    () =>
      `malcom-diagram-${createMessageId().replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setSvg("");
      setHasRenderError(false);

      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;

        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "#020a05",
            primaryColor: "#09150e",
            primaryTextColor: "#eef8f4",
            primaryBorderColor: "#00be6a",
            lineColor: "#39d990",
            secondaryColor: "#010704",
            tertiaryColor: "#13221b",
            textColor: "#eef8f4",
            mainBkg: "#09150e",
            nodeBorder: "#00be6a",
            clusterBkg: "#010704",
            clusterBorder: "#1e3028",
            edgeLabelBackground: "#020a05",
          },
          flowchart: {
            htmlLabels: true,
          },
        });

        let rendered;
        const renderValidDiagram = async (id: string, diagramCode: string) => {
          const parsed = await mermaid.parse(diagramCode, {
            suppressErrors: true,
          });

          if (!parsed) {
            throw new Error("Invalid Mermaid diagram");
          }

          return mermaid.render(id, diagramCode);
        };

        try {
          rendered = await renderValidDiagram(diagramId, renderCode);
        } catch (firstError) {
          const fallbackCode = stripMermaidStyleLines(renderCode);

          if (fallbackCode === renderCode) {
            throw firstError;
          }

          rendered = await renderValidDiagram(
            `${diagramId}-fallback`,
            fallbackCode,
          );
        }

        if (!cancelled) {
          setSvg(rendered.svg);
        }
      } catch {
        if (!cancelled) {
          setHasRenderError(true);
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [diagramId, renderCode]);

  return (
    <figure className={styles.diagramBlock}>
      <figcaption>
        <span>Diagram</span>
      </figcaption>
      {svg ? (
        <div
          className={styles.diagramCanvas}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : hasRenderError ? (
        <DiagramPreviewFallback code={renderCode} />
      ) : (
        <div className={styles.diagramLoading}>Rendering diagram...</div>
      )}
    </figure>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  if (isMermaidLanguage(language) || looksLikeMermaidCode(code)) {
    return <MermaidDiagram code={code} />;
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <figure className={styles.codeBlock}>
      <figcaption>
        <span>{language || "text"}</span>
        <button type="button" onClick={copyCode} aria-label="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

function safeLinkHref(href: string | undefined) {
  if (!href) {
    return "#";
  }

  const trimmed = href.trim();

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    /^tel:/i.test(trimmed)
  ) {
    return trimmed;
  }

  return "#";
}

const markdownComponents: Components = {
  a({ children, href }) {
    const safeHref = safeLinkHref(href);

    return (
      <a href={safeHref} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  code({ className, children }) {
    const rawCode = String(children).replace(/\n$/, "");
    const language = /language-([\w-]+)/.exec(className || "")?.[1] || "";

    if (language || rawCode.includes("\n")) {
      return <CodeBlock code={rawCode} language={language || "text"} />;
    }

    return <code>{children}</code>;
  },
  table({ children }) {
    return (
      <div className={styles.tableScroll}>
        <table>{children}</table>
      </div>
    );
  },
};

function MessageContent({ content }: { content: string }) {
  const markdown = useMemo(() => normalizeMarkdown(content), [content]);

  return (
    <div className={styles.messageContent}>
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkMath, remarkGfm]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function readJsonArray<T>(key: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];

    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Guest storage is best-effort. Chat still works without it.
  }
}

function readGuestUsage() {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    const value = Number(window.localStorage.getItem(guestUsageKey) || 0);

    return Number.isFinite(value) ? Math.max(0, value) : 0;
  } catch {
    return 0;
  }
}

function writeGuestUsage(value: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(guestUsageKey, String(Math.max(0, value)));
  } catch {
    // Keep in-memory usage if localStorage is unavailable.
  }
}

function readStoredBillingNotice(): BillingAlert | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(billingNoticeKey);

    if (!value) {
      return null;
    }

    window.localStorage.removeItem(billingNoticeKey);
    const parsed = JSON.parse(value) as Partial<BillingAlert>;

    if (
      (parsed.kind === "success" ||
        parsed.kind === "error" ||
        parsed.kind === "info") &&
      typeof parsed.title === "string" &&
      typeof parsed.message === "string"
    ) {
      return {
        kind: parsed.kind,
        title: parsed.title,
        message: parsed.message,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function readBillingAlertFromUrl(): BillingAlert | null {
  if (typeof window === "undefined") {
    return null;
  }

  const url = new URL(window.location.href);
  const status = url.searchParams.get("billing") || "";
  const plan = url.searchParams.get("plan") || "";
  const message = url.searchParams.get("billing_message") || "";

  if (!status) {
    return null;
  }

  if (status === "success") {
    const readableBillingPlan =
      plan === "enterprise" ? "Enterprise" : plan === "pro" ? "Pro" : "Plan";

    return {
      kind: "success",
      title: "Payment complete",
      message:
        message ||
        `${readableBillingPlan} is active. You can keep chatting now.`,
    };
  }

  if (status === "cancelled") {
    return {
      kind: "info",
      title: "Checkout cancelled",
      message: "No payment was completed and your current plan is unchanged.",
    };
  }

  return {
    kind: "error",
    title: "Payment needs attention",
    message: message || "Checkout finished, but the subscription could not be activated.",
  };
}

function clearBillingAlertParams() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  for (const key of ["billing", "plan", "billing_message"]) {
    url.searchParams.delete(key);
  }

  window.history.replaceState(
    null,
    document.title,
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function routeSessionIdFromPath(pathname: string) {
  const match = pathname.match(/^\/chat\/([^/]+)$/);

  if (!match?.[1]) {
    return "";
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function replaceBrowserPath(path: string) {
  if (typeof window === "undefined" || window.location.pathname === path) {
    return;
  }

  window.history.replaceState(null, document.title, path);
}

function chatPath(sessionId: string) {
  return `/chat/${encodeURIComponent(sessionId)}`;
}

function loadStoredChat(routeSessionId = "", forceNew = false): StoredChat {
  if (typeof window === "undefined") {
    return { sessionId: routeSessionId || createMessageId(), messages: initialMessages };
  }

  if (forceNew || window.location.pathname === "/new") {
    return { sessionId: createMessageId(), messages: initialMessages };
  }

  if (routeSessionId) {
    const guestSession = readJsonArray<SavedSession>(guestSessionsKey).find(
      (session) => session.id === routeSessionId,
    );

    return {
      sessionId: routeSessionId,
      messages: guestSession?.messages || initialMessages,
    };
  }

  try {
    const stored = window.localStorage.getItem(chatStorageKey);

    if (!stored) {
      return { sessionId: createMessageId(), messages: initialMessages };
    }

    const parsed = JSON.parse(stored) as Partial<StoredChat>;

    if (!Array.isArray(parsed.messages) || typeof parsed.sessionId !== "string") {
      return { sessionId: createMessageId(), messages: initialMessages };
    }

    return {
      sessionId: parsed.sessionId,
      messages: parsed.messages.filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.id === "string" &&
          typeof message.content === "string",
      ),
    };
  } catch {
    return { sessionId: createMessageId(), messages: initialMessages };
  }
}

function chatTitle(messages: Message[]) {
  const firstUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  return firstUser?.content.slice(0, 80).trim() || "Untitled";
}

function saveGuestSession(sessionId: string, messages: Message[]) {
  if (!messages.length) {
    return;
  }

  const sessions = readJsonArray<SavedSession>(guestSessionsKey);
  const existing = sessions.find((session) => session.id === sessionId);
  const now = new Date().toISOString();
  const previousAutoTitle = existing?.messages ? chatTitle(existing.messages) : "";
  const shouldUseAutoTitle =
    !existing?.title ||
    existing.title === "Untitled" ||
    existing.title === previousAutoTitle;
  const nextSession: SavedSession = {
    id: sessionId,
    title: shouldUseAutoTitle ? chatTitle(messages) : existing.title,
    folder: existing?.folder || "",
    tags: existing?.tags || "",
    pinned: existing?.pinned || false,
    created_at: existing?.created_at || now,
    updated_at: now,
    messages,
  };

  writeJsonArray(
    guestSessionsKey,
    [nextSession, ...sessions.filter((session) => session.id !== sessionId)]
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
      .slice(0, 50),
  );
}

function isSupportedFile(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  return (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/xml" ||
    supportedFileExtensions.some((extension) => name.endsWith(extension))
  );
}

function MalcomAvatar({
  active = false,
  showBeta = false,
}: {
  active?: boolean;
  showBeta?: boolean;
}) {
  return (
    <div
      className={`${styles.malcomAvatar} ${active ? styles.avatarActive : ""}`}
      aria-hidden="true"
    >
      <BrainCircuit size={18} />
      {showBeta ? <span className={styles.avatarBeta}>Beta</span> : null}
    </div>
  );
}

function UserAvatar() {
  return (
    <div className={styles.userAvatar} aria-hidden="true">
      <CircleUserRound size={18} />
    </div>
  );
}

function PlanBadge({
  authUser,
  usage,
  guestUsed,
}: {
  authUser: User | null;
  usage: AccountUsage | null;
  guestUsed: number;
}) {
  if (!authUser) {
    return (
      <span className={styles.planBadge}>
        Guest · {guestUsed}/{guestResponseLimit}
      </span>
    );
  }

  if (usage?.plan === "enterprise") {
    return <span className={styles.planBadge}>Enterprise</span>;
  }

  if (usage?.plan === "pro") {
    return <span className={styles.planBadge}>Pro</span>;
  }

  return (
    <span className={styles.planBadge}>
      Free · {usage?.messagesUsed ?? 0}/{usage?.messagesLimit ?? 100}
    </span>
  );
}

function readablePlan(usage: AccountUsage | null) {
  if (usage?.plan === "enterprise") {
    return "Enterprise";
  }

  if (usage?.plan === "pro") {
    return "Pro";
  }

  return "Free";
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function isThreadNearBottom(thread: HTMLDivElement) {
  return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 96;
}

const MessageItem = memo(function MessageItem({
  message,
  responseState,
  streaming,
  onCopy,
  onEditPrompt,
  onReaction,
  onRegenerate,
  onToggleStar,
  onToggleComment,
  onCommentChange,
  onSubmitComment,
  starred,
}: {
  message: Message;
  responseState?: ResponseState;
  streaming?: boolean;
  onCopy(id: string, content: string): void;
  onEditPrompt(id: string, content: string): void;
  onReaction(id: string, reaction: ResponseReaction): void;
  onRegenerate(id: string): void;
  onToggleStar(id: string, content: string): void;
  onToggleComment(id: string): void;
  onCommentChange(id: string, comment: string): void;
  onSubmitComment(id: string): void;
  starred: boolean;
}) {
  return (
    <article
      className={`${styles.message} ${styles[message.role]} ${
        message.role === "assistant" ? styles.messageEntered : ""
      } ${streaming ? styles.streamingMessage : ""}`}
    >
      {message.role === "assistant" ? <MalcomAvatar /> : <UserAvatar />}
      <div className={styles.messageBody}>
        <span>{message.role === "assistant" ? "Malcom" : "You"}</span>
        <MessageContent content={message.content} />
        {streaming ? (
          <p className={styles.streamingStatus}>
            <span aria-hidden="true" />
            Writing live
          </p>
        ) : null}
        {message.role === "user" ? (
          <div className={styles.promptTools}>
            <div className={styles.promptActions} aria-label="Prompt actions">
              <button
                type="button"
                onClick={() => onCopy(message.id, message.content)}
                aria-label="Copy prompt"
                title="Copy prompt"
              >
                {responseState?.copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button
                type="button"
                onClick={() => onEditPrompt(message.id, message.content)}
                aria-label="Edit prompt"
                title="Edit prompt"
              >
                <PencilLine size={15} />
              </button>
            </div>

            {responseState?.status ? (
              <p className={styles.promptStatus}>{responseState.status}</p>
            ) : null}
          </div>
        ) : null}
        {message.role === "assistant" && !streaming ? (
          <div className={styles.responseTools}>
            <div className={styles.responseActions} aria-label="Response actions">
              <button
                type="button"
                onClick={() => onCopy(message.id, message.content)}
                aria-label="Copy response"
                title="Copy"
              >
                {responseState?.copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button
                type="button"
                className={
                  responseState?.reaction === "like" ? styles.actionActive : ""
                }
                onClick={() => onReaction(message.id, "like")}
                aria-label="Like response"
                title="Like"
              >
                <ThumbsUp size={15} />
              </button>
              <button
                type="button"
                className={
                  responseState?.reaction === "dislike" ? styles.actionActive : ""
                }
                onClick={() => onReaction(message.id, "dislike")}
                aria-label="Dislike response"
                title="Dislike"
              >
                <ThumbsDown size={15} />
              </button>
              <button
                type="button"
                className={starred ? styles.actionActive : ""}
                onClick={() => onToggleStar(message.id, message.content)}
                aria-label={starred ? "Unstar response" : "Star response"}
                title={starred ? "Unstar" : "Star"}
              >
                <Star size={15} />
              </button>
              <button
                type="button"
                onClick={() => onRegenerate(message.id)}
                aria-label="Regenerate response"
                title="Regenerate"
              >
                <RefreshCcw size={15} />
              </button>
              <button
                type="button"
                className={responseState?.commenting ? styles.actionActive : ""}
                onClick={() => onToggleComment(message.id)}
                aria-label="Comment on response"
                title="Comment"
              >
                <MessageSquareText size={15} />
              </button>
            </div>

            {responseState?.commenting ? (
              <div className={styles.responseComment}>
                <textarea
                  value={responseState.comment || ""}
                  onChange={(event) =>
                    onCommentChange(message.id, event.target.value)
                  }
                  placeholder="Add a note to this response..."
                  rows={3}
                />
                <button type="button" onClick={() => onSubmitComment(message.id)}>
                  Save note
                </button>
              </div>
            ) : null}

            {responseState?.status ? (
              <p className={styles.responseStatus}>{responseState.status}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
});

export default function Home({ initialSessionId = "", forceNew = false }: HomeProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [sessionId, setSessionId] = useState(
    () => initialSessionId || createMessageId(),
  );
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [responseMode, setResponseMode] =
    useState<ResponseMode>("standard");
  const [webResearchEnabled, setWebResearchEnabled] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasLoadedStoredChat, setHasLoadedStoredChat] = useState(false);
  const [responseStates, setResponseStates] = useState<
    Record<string, ResponseState>
  >({});
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);
  const [guestUsed, setGuestUsed] = useState(0);
  const [limitOpen, setLimitOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [checkoutStatus, setCheckoutStatus] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState<"pro" | "enterprise" | "">("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [authStatus, setAuthStatus] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState("");
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [guestSessions, setGuestSessions] = useState<SavedSession[]>([]);
  const [starredResponses, setStarredResponses] = useState<StarredResponse[]>(
    [],
  );
  const [profile, setProfile] = useState<UserProfile>({
    display_name: "",
    memory: "",
  });
  const [gfMemo, setGfMemo] = useState<GfMemo | null>(null);
  const [billingAlert, setBillingAlert] = useState<BillingAlert | null>(null);
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [openSessionMenuId, setOpenSessionMenuId] = useState("");
  const [openDocumentMenuId, setOpenDocumentMenuId] = useState("");
  const [openLibraryPanel, setOpenLibraryPanel] = useState<
    "documents" | "starred" | "pinned" | ""
  >("");
  const [editingSessionId, setEditingSessionId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState("");
  const [editingDocumentName, setEditingDocumentName] = useState("");
  const [documents, setDocuments] = useState<DocumentResource[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [documentStatus, setDocumentStatus] = useState("");
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [loadingNoteIndex, setLoadingNoteIndex] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [welcomeMessageIndex, setWelcomeMessageIndex] = useState(0);
  const [promptHintIndex, setPromptHintIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestTokenRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);
  const messageCountRef = useRef(0);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const authConfirmationHandledRef = useRef(false);
  const initialRouteSessionIdRef = useRef(initialSessionId);
  const forceNewRouteRef = useRef(forceNew);

  const activeSessions = authUser ? savedSessions : guestSessions;
  const selectedDocuments = useMemo(
    () =>
      selectedDocumentIds
        .map((id) => documents.find((document) => document.id === id))
        .filter((document): document is DocumentResource => Boolean(document)),
    [documents, selectedDocumentIds],
  );
  const starredMessageIds = useMemo(
    () => new Set(starredResponses.map((response) => response.message_id)),
    [starredResponses],
  );
  const filteredSessions = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();

    return activeSessions.filter((session) => {
      if (!query) {
        return true;
      }

      return [session.title, session.folder || "", session.tags || ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [activeSessions, historyQuery]);
  const pinnedSessions = filteredSessions.filter((session) =>
    Boolean(session.pinned),
  );
  const recentSessions = filteredSessions.filter(
    (session) => !Boolean(session.pinned),
  );
  const guestRemaining = Math.max(0, guestResponseLimit - guestUsed);
  const isGuestLimited = !authUser && guestRemaining <= 0;
  const isFreeLimited = Boolean(authUser && accountUsage?.isLimited);
  const isComposerDisabled = isGuestLimited || isFreeLimited;
  const isWaitingForAssistant =
    isSending && messages[messages.length - 1]?.role === "user";
  const activeWaitingFlow = webResearchEnabled
    ? webResearchWaitingFlow
    : waitingFlow;
  const visiblePrompt = messages.length === 0 && input.trim().length === 0;
  const promptWordCount = input.trim()
    ? input.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const promptEnergy = Math.min(100, Math.max(10, promptWordCount * 9));
  const promptStatus = isSending
    ? "Keep the next thought here"
    : promptWordCount === 0
      ? "Name the outcome"
      : promptWordCount < 5
        ? "Add context"
        : promptWordCount < 12
          ? "Good shape"
          : "Ready";
  const promptTone = promptWordCount >= 12 ? "strong" : promptWordCount >= 5 ? "good" : "quiet";

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const syncSidebar = () => setSidebarCollapsed(mediaQuery.matches);

    syncSidebar();
    mediaQuery.addEventListener("change", syncSidebar);

    const loadTimer = window.setTimeout(() => {
      const routeSessionId =
        initialRouteSessionIdRef.current || routeSessionIdFromPath(window.location.pathname);
      const stored = loadStoredChat(routeSessionId, forceNewRouteRef.current);
      setSessionId(stored.sessionId);
      setMessages(stored.messages);
      setGuestSessions(readJsonArray<SavedSession>(guestSessionsKey));
      setStarredResponses(readJsonArray<StarredResponse>(guestStarsKey));
      setDocuments(readJsonArray<DocumentResource>(guestDocumentsKey));
      setGuestUsed(readGuestUsage());
      setBillingAlert(readStoredBillingNotice() || readBillingAlertFromUrl());
      clearBillingAlertParams();
      if (window.location.pathname === "/" && stored.messages.length === 0) {
        replaceBrowserPath("/new");
      }
      setHasLoadedStoredChat(true);
    }, 0);

    return () => {
      mediaQuery.removeEventListener("change", syncSidebar);
      window.clearTimeout(loadTimer);
    };
  }, []);

  useEffect(() => {
    const authRedirect = getAuthRedirectFromUrl();
    const oauthCode = getOAuthCodeFromUrl();
    const supabase = createSupabaseBrowserClient();
    supabaseRef.current = supabase;

    if (!supabase) {
      return;
    }

    if (
      authRedirect?.type === "signup" &&
      authRedirect.email &&
      !authConfirmationHandledRef.current
    ) {
      authConfirmationHandledRef.current = true;
      setAuthMode("sign-in");
      setAuthEmail(authRedirect.email);
      setAuthStatus(
        "Account confirmed. Enter your password to finish signing in.",
      );
      setAuthOpen(true);
      window.history.replaceState(
        null,
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );
      void supabase.auth.signOut({ scope: "local" });
    }

    if (
      (authRedirect?.type === "recovery" || authRedirect?.type === "invite") &&
      !authConfirmationHandledRef.current
    ) {
      authConfirmationHandledRef.current = true;
      setAuthMode("sign-in");
      setAuthStatus("Your email was verified. Sign in to continue.");
      setAuthOpen(true);
      window.history.replaceState(
        null,
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );
    }

    void supabase.auth.getSession().then(async ({ data }) => {
      if (authRedirect?.type === "signup" || oauthCode) {
        return;
      }

      const session = data.session;
      setAccessToken(session?.access_token || "");

      if (!session) {
        setAuthUser(null);
        return;
      }

      if (session.user) {
        setAuthUser(session.user);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      setAuthUser(userData.user || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token || "");

      if (session?.user) {
        setAuthUser(session.user);
      } else if (session) {
        void supabase.auth
          .getUser()
          .then(({ data }) => setAuthUser(data.user || null));
      } else {
        setAuthUser(null);
      }

      if (!session) {
        setSavedSessions([]);
        setAccountUsage(null);
        setGfMemo(null);
        setStarredResponses(readJsonArray<StarredResponse>(guestStarsKey));
        setDocuments(readJsonArray<DocumentResource>(guestDocumentsKey));
      }
    });

    if (oauthCode && !authConfirmationHandledRef.current) {
      authConfirmationHandledRef.current = true;
      setAuthStatus("Finishing Google sign-in...");

      void supabase.auth
        .exchangeCodeForSession(oauthCode)
        .then(({ data, error: oauthError }) => {
          removeOAuthCodeFromUrl();

          if (oauthError) {
            setAuthMode("sign-in");
            setAuthStatus(oauthError.message);
            setAuthOpen(true);
            return;
          }

          setAuthUser(data.session?.user || null);
          setAccessToken(data.session?.access_token || "");
          setAuthStatus("");
          setAuthOpen(false);
        })
        .catch((caughtError) => {
          removeOAuthCodeFromUrl();
          setAuthMode("sign-in");
          setAuthStatus(
            caughtError instanceof Error
              ? caughtError.message
              : "Google sign-in failed.",
          );
          setAuthOpen(true);
        });
    }

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!billingAlert) {
      return;
    }

    const timer = window.setTimeout(() => setBillingAlert(null), 7200);

    return () => window.clearTimeout(timer);
  }, [billingAlert]);

  useEffect(() => {
    if (!authUser || !accessToken) {
      return;
    }

    void refreshUserWorkspace(accessToken);
    void refreshDocuments(accessToken);
    void refreshUsage(accessToken);
    void syncGuestStars(accessToken);
    // These functions intentionally read the latest render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, accessToken]);

  useEffect(() => {
    if (!hasLoadedStoredChat || !accessToken) {
      return;
    }

    const routeSessionId =
      initialRouteSessionIdRef.current ||
      routeSessionIdFromPath(window.location.pathname);

    if (!routeSessionId) {
      return;
    }

    void openSavedChat(routeSessionId);
    // openSavedChat intentionally reads the latest auth state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, hasLoadedStoredChat]);

  useEffect(() => {
    if (!hasLoadedStoredChat || authUser) {
      return;
    }

    writeJsonArray(guestDocumentsKey, documents.slice(0, 20));
  }, [authUser, documents, hasLoadedStoredChat]);

  useEffect(() => {
    if (!hasLoadedStoredChat) {
      return;
    }

    try {
      window.localStorage.setItem(
        chatStorageKey,
        JSON.stringify({ sessionId, messages }),
      );
    } catch {
      // Local storage is optional for guest mode.
    }

    if (!authUser) {
      saveGuestSession(sessionId, messages);
      window.setTimeout(() => {
        setGuestSessions(readJsonArray<SavedSession>(guestSessionsKey));
      }, 0);
    }
  }, [authUser, hasLoadedStoredChat, messages, sessionId]);

  useEffect(() => {
    const thread = threadRef.current;

    if (!thread) {
      return;
    }

    const handleScroll = () => {
      shouldAutoScrollRef.current = isThreadNearBottom(thread);
    };

    handleScroll();
    thread.addEventListener("scroll", handleScroll, { passive: true });

    return () => thread.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const thread = threadRef.current;

    if (!thread || messages.length === 0) {
      return;
    }

    const messageCountChanged = messageCountRef.current !== messages.length;
    messageCountRef.current = messages.length;

    if (
      !messageCountChanged &&
      !shouldAutoScrollRef.current &&
      !isThreadNearBottom(thread)
    ) {
      return;
    }

    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: "smooth",
    });
    shouldAutoScrollRef.current = true;
  }, [error, isWaitingForAssistant, messages]);

  useEffect(() => {
    if (!isWaitingForAssistant) {
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingNoteIndex((current) => (current + 1) % activeWaitingFlow.length);
    }, 2400);

    return () => window.clearInterval(timer);
  }, [activeWaitingFlow.length, isWaitingForAssistant]);

  useEffect(() => {
    if (!isWaitingForAssistant) {
      return;
    }

    const timer = window.setInterval(() => {
      setWaitSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isWaitingForAssistant]);

  useEffect(() => {
    if (!visiblePrompt) {
      return;
    }

    const timer = window.setInterval(() => {
      setWelcomeMessageIndex(
        (current) => (current + 1) % welcomeMessages.length,
      );
    }, 3600);

    return () => window.clearInterval(timer);
  }, [visiblePrompt]);

  useEffect(() => {
    if (input.trim() || isSending) {
      return;
    }

    const timer = window.setInterval(() => {
      setPromptHintIndex((current) => (current + 1) % promptPlaceholders.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [input, isSending]);

  function authHeaders(token = accessToken): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function refreshUsage(token = accessToken) {
    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/user/usage", {
        cache: "no-store",
        headers: authHeaders(token),
      });
      const data = await readApiJson<{
        usage?: AccountUsage;
      }>(response, "Could not load usage.");

      if (response.ok && data.usage) {
        setAccountUsage(data.usage);
      }
    } catch {
      // Usage is displayed defensively; server-side chat limits still apply.
    }
  }

  async function refreshUserWorkspace(token = accessToken) {
    if (!token) {
      return;
    }

    setHistoryStatus("");

    try {
      const [sessionsResponse, starredResponse, profileResponse] =
        await Promise.all([
          fetch("/api/user/chats", {
            cache: "no-store",
            headers: authHeaders(token),
          }),
          fetch("/api/user/starred-responses", {
            cache: "no-store",
            headers: authHeaders(token),
          }),
          fetch("/api/user/profile", {
            cache: "no-store",
            headers: authHeaders(token),
          }),
        ]);

      if (!sessionsResponse.ok || !starredResponse.ok || !profileResponse.ok) {
        throw new Error("Could not load account history.");
      }

      const sessionsData = await readApiJson<{
        sessions?: SavedSession[];
      }>(sessionsResponse, "Could not load account history.");
      const starredData = await readApiJson<{
        starred?: StarredResponse[];
      }>(starredResponse, "Could not load starred responses.");
      const profileData = await readApiJson<{
        profile?: UserProfile;
        gfMemo?: GfMemo | null;
      }>(profileResponse, "Could not load profile.");

      setSavedSessions(sessionsData.sessions || []);
      setStarredResponses(starredData.starred || []);
      setProfile(profileData.profile || { display_name: "", memory: "" });
      setGfMemo(profileData.gfMemo || null);
    } catch (caughtError) {
      setHistoryStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load account history.",
      );
    }
  }

  async function refreshDocuments(token = accessToken) {
    if (!token) {
      setDocuments(readJsonArray<DocumentResource>(guestDocumentsKey));
      return;
    }

    try {
      const response = await fetch("/api/documents", {
        cache: "no-store",
        headers: authHeaders(token),
      });
      const data = await readApiJson<{
        documents?: DocumentResource[];
      }>(response, "Could not load documents.");

      if (response.ok) {
        setDocuments(data.documents || []);
      }
    } catch {
      setDocumentStatus("Could not load documents.");
    }
  }

  async function uploadDocument(file: File) {
    if (file.size > maxUploadBytes) {
      setDocumentStatus(`${file.name} is too large. Max size is 2 MB.`);
      return;
    }

    if (!isSupportedFile(file)) {
      setDocumentStatus(
        `${file.name} is not supported. Use text, Markdown, CSV, JSON, code, or logs.`,
      );
      return;
    }

    setDocumentStatus("");
    setIsUploadingDocument(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents", {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      const data = await readApiJson<{
        document?: DocumentResource;
      }>(response, "Document was not uploaded.");

      if (!response.ok || !data.document) {
        throw new Error(data.error || "Document was not uploaded.");
      }

      setDocuments((current) => [
        data.document as DocumentResource,
        ...current.filter((document) => document.id !== data.document?.id),
      ]);
      setSelectedDocumentIds((current) =>
        [
          data.document!.id,
          ...current.filter((id) => id !== data.document!.id),
        ].slice(0, maxSelectedDocuments),
      );
      setDocumentStatus("File attached.");
    } catch (caughtError) {
      setDocumentStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Document was not uploaded.",
      );
    } finally {
      setIsUploadingDocument(false);

      if (documentInputRef.current) {
        documentInputRef.current.value = "";
      }
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const nextFiles = Array.from(files).slice(0, maxSelectedDocuments);

    if (!nextFiles.length) {
      return;
    }

    for (const file of nextFiles) {
      await uploadDocument(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDragActive(false);
    void handleFiles(event.dataTransfer.files);
  }

  function toggleSelectedDocument(id: string) {
    setOpenDocumentMenuId("");
    setSelectedDocumentIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [id, ...current].slice(0, maxSelectedDocuments),
    );
  }

  async function deleteDocument(id: string) {
    setOpenDocumentMenuId("");
    setDocuments((current) => current.filter((document) => document.id !== id));
    setSelectedDocumentIds((current) => current.filter((item) => item !== id));

    if (!accessToken) {
      return;
    }

    try {
      await fetch(`/api/documents?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch {
      setDocumentStatus("Document was removed locally, but server delete failed.");
    }
  }

  function beginEditDocument(document: DocumentResource) {
    setOpenDocumentMenuId("");
    setEditingDocumentId(document.id);
    setEditingDocumentName(document.name);
  }

  async function saveDocumentEdits() {
    if (!editingDocumentId) {
      return;
    }

    const nextName =
      editingDocumentName.slice(0, 180).trim() || "Untitled document";

    setDocuments((current) =>
      current.map((document) =>
        document.id === editingDocumentId
          ? { ...document, name: nextName }
          : document,
      ),
    );

    if (!accessToken) {
      setEditingDocumentId("");
      setEditingDocumentName("");
      return;
    }

    try {
      const response = await fetch("/api/documents", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          id: editingDocumentId,
          name: nextName,
        }),
      });
      const data = await readApiJson(response, "Document was not renamed.");

      if (!response.ok) {
        throw new Error(data.error || "Document was not renamed.");
      }

      setDocumentStatus("Document renamed.");
    } catch (caughtError) {
      setDocumentStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Document was not renamed.",
      );
      await refreshDocuments();
    } finally {
      setEditingDocumentId("");
      setEditingDocumentName("");
    }
  }

  async function openSavedChat(nextSessionId: string) {
    setOpenSessionMenuId("");

    if (!accessToken) {
      const session = guestSessions.find((item) => item.id === nextSessionId);

      if (!session) {
        return;
      }

      setSessionId(session.id);
      setMessages(session.messages || []);
      setResponseStates({});
      setError("");
      replaceBrowserPath(chatPath(session.id));
      return;
    }

    setHistoryStatus("Loading chat...");

    try {
      const response = await fetch(
        `/api/user/chats?sessionId=${encodeURIComponent(nextSessionId)}`,
        {
          cache: "no-store",
          headers: authHeaders(),
        },
      );
      const data = await readApiJson<{
        messages?: Message[];
      }>(response, "Could not load saved chat.");

      if (!response.ok) {
        throw new Error(data.error || "Could not load saved chat.");
      }

      setSessionId(nextSessionId);
      setMessages(
        (data.messages || []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })),
      );
      setResponseStates({});
      setError("");
      setHistoryStatus("");
      replaceBrowserPath(chatPath(nextSessionId));
    } catch (caughtError) {
      setHistoryStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load saved chat.",
      );
    }
  }

  async function syncGuestStars(token = accessToken) {
    const guestStars = readJsonArray<StarredResponse>(guestStarsKey);

    if (!token || guestStars.length === 0) {
      return;
    }

    await Promise.allSettled(
      guestStars.map((star) =>
        fetch("/api/user/starred-responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(token),
          },
          body: JSON.stringify({
            messageId: star.message_id,
            sessionId: star.session_id,
            content: star.content,
            starred: true,
          }),
        }),
      ),
    );

    window.localStorage.removeItem(guestStarsKey);
    await refreshUserWorkspace(token);
  }

  function beginEditSession(session: SavedSession) {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
    setOpenSessionMenuId("");
  }

  function updateGuestSession(
    nextSessionId: string,
    patch: Partial<SavedSession>,
  ) {
    const sessions = readJsonArray<SavedSession>(guestSessionsKey).map((session) =>
      session.id === nextSessionId
        ? { ...session, ...patch, updated_at: new Date().toISOString() }
        : session,
    );

    writeJsonArray(guestSessionsKey, sessions);
    setGuestSessions(sessions);
  }

  async function saveSessionEdits() {
    if (!editingSessionId) {
      return;
    }

    const nextTitle = editingTitle.slice(0, 80).trim() || "Untitled";

    if (!accessToken) {
      updateGuestSession(editingSessionId, { title: nextTitle });
      setEditingSessionId("");
      return;
    }

    await fetch("/api/user/chats", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        sessionId: editingSessionId,
        title: nextTitle,
      }),
    });
    setEditingSessionId("");
    await refreshUserWorkspace();
  }

  async function togglePinnedSession(session: SavedSession) {
    const nextPinned = !Boolean(session.pinned);
    setOpenSessionMenuId("");

    if (!accessToken) {
      updateGuestSession(session.id, { pinned: nextPinned });
      return;
    }

    await fetch("/api/user/chats", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ sessionId: session.id, pinned: nextPinned }),
    });
    await refreshUserWorkspace();
  }

  async function confirmDeleteSession(nextSessionId: string) {
    if (!accessToken) {
      const sessions = readJsonArray<SavedSession>(guestSessionsKey).filter(
        (session) => session.id !== nextSessionId,
      );
      writeJsonArray(guestSessionsKey, sessions);
      setGuestSessions(sessions);

      if (sessionId === nextSessionId) {
        startNewChat();
      }

      return;
    }

    await fetch(`/api/user/chats?sessionId=${encodeURIComponent(nextSessionId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    await refreshUserWorkspace();

    if (sessionId === nextSessionId) {
      startNewChat();
    }
  }

  function deleteSession(nextSessionId: string) {
    setOpenSessionMenuId("");
    setDeleteSessionId(nextSessionId);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const supabase = supabaseRef.current;

    if (!supabase) {
      setAuthStatus("Supabase is not configured.");
      return;
    }

    setIsSubmittingAuth(true);
    setAuthStatus("");

    try {
      let data: { user: User | null; session: Session | null };

      if (authMode === "sign-up") {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: authEmail.trim(),
            password: authPassword,
          }),
        });
        const payload = await readApiJson<AuthPayload>(
          response,
          "Account could not be created.",
        );

        if (!response.ok) {
          const errorMessage = payload.error || "Account could not be created.";

          if (/already|registered|exists/i.test(errorMessage)) {
            setAuthMode("sign-in");
            setAuthPassword("");
            setAuthStatus(
              "You are already registered. Enter your password to log in.",
            );
            return;
          }

          throw new Error(errorMessage);
        }

        data = {
          user: payload.user || null,
          session: payload.session || null,
        };

        const identities = Array.isArray(payload.user?.identities)
          ? payload.user.identities
          : null;

        if (!data.session && identities && identities.length === 0) {
          setAuthMode("sign-in");
          setAuthPassword("");
          setAuthStatus(
            "You are already registered. Enter your password to log in.",
          );
          return;
        }
      } else {
        const { data: authData, error: authError } =
          await supabase.auth.signInWithPassword({
            email: authEmail.trim(),
            password: authPassword,
          });

        if (authError) {
          throw authError;
        }

        data = authData;
      }

      setAuthUser(data.user || data.session?.user || null);
      setAccessToken(data.session?.access_token || "");
      setAuthPassword("");
      setAuthStatus(
        data.session
          ? "Signed in."
          : "Check your email to confirm the account, then sign in.",
      );

      if (data.session) {
        setAuthOpen(false);
      }
    } catch (caughtError) {
      setAuthStatus(
        caughtError instanceof Error ? caughtError.message : "Sign in failed.",
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function continueAuthWithGoogle() {
    const supabase = supabaseRef.current;

    if (!supabase) {
      setAuthStatus("Supabase is not configured.");
      return;
    }

    setIsSubmittingAuth(true);
    setAuthStatus("Redirecting to Google...");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getOAuthCallbackUrl(),
        },
      });

      if (error) {
        throw error;
      }
    } catch (caughtError) {
      setAuthStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Google sign-in failed.",
      );
      setIsSubmittingAuth(false);
    }
  }

  async function signOut() {
    await supabaseRef.current?.auth.signOut();
    setAuthUser(null);
    setAccessToken("");
    setSavedSessions([]);
    setAccountUsage(null);
    setStarredResponses(readJsonArray<StarredResponse>(guestStarsKey));
    setDocuments(readJsonArray<DocumentResource>(guestDocumentsKey));
    setSelectedDocumentIds([]);
    setProfile({ display_name: "", memory: "" });
    setGfMemo(null);
  }

  function openSettings(tab: SettingsTab = "general") {
    setSettingsTab(tab);
    setSettingsStatus("");
    setSettingsOpen(true);
  }

  function openUpgrade() {
    setCheckoutStatus("");
    setUpgradeOpen(true);
  }

  async function saveProfileSettings() {
    if (!authUser || !accessToken) {
      setSettingsStatus("Sign in to save profile settings.");
      return;
    }

    setIsSavingSettings(true);
    setSettingsStatus("");

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          displayName: profile.display_name,
          memory: profile.memory,
        }),
      });
      const data = await readApiJson(response, "Profile was not saved.");

      if (!response.ok) {
        throw new Error(data.error || "Profile was not saved.");
      }

      setSettingsStatus("Settings saved.");
    } catch (caughtError) {
      setSettingsStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Profile was not saved.",
      );
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function startCheckout(plan: "pro" | "enterprise") {
    if (!authUser || !accessToken) {
      setCheckoutStatus("Create an account to upgrade and keep your workspace.");
      setAuthMode("sign-up");
      setSettingsOpen(false);
      setUpgradeOpen(false);
      setAuthOpen(true);
      return;
    }

    setIsSavingSettings(true);
    setSettingsStatus("");
    setCheckoutStatus("");
    setCheckoutPlan(plan);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ plan }),
      });
      const data = await readApiJson<{ url?: string }>(
        response,
        "Checkout could not be started.",
      );

      if (!response.ok || !data.url) {
        throw new Error(data.error || "Checkout could not be started.");
      }

      window.location.href = data.url;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Checkout could not be started.";
      setSettingsStatus(message);
      setCheckoutStatus(message);
      setIsSavingSettings(false);
      setCheckoutPlan("");
    }
  }

  async function sendMessage(nextInput = input, baseMessages = messages) {
    const prompt = nextInput.trim();

    if (!prompt || isSending) {
      return;
    }

    if (isGuestLimited || isFreeLimited) {
      setLimitOpen(true);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestToken = requestTokenRef.current + 1;
    requestTokenRef.current = requestToken;

    const userMessage: Message = {
      id: createMessageId(),
      role: "user",
      content: prompt,
    };

    const pendingMessages = [...baseMessages, userMessage];
    setMessages(pendingMessages);
    replaceBrowserPath(chatPath(sessionId));
    setInput("");
    setError("");
    setLimitOpen(false);
    setIsSending(true);
    setLoadingNoteIndex(0);
    setWaitSeconds(0);

    let assistantContent = "";
    let assistantResponseId = createMessageId();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          profileMemory: authUser ? profile.memory : "",
          documentContexts: selectedDocuments.map((document) => ({
            name: document.name,
            content: document.content,
          })),
          responseMode,
          webResearch: webResearchEnabled,
          stream: true,
          messages: pendingMessages.map(({ id, role, content }) => ({
            id,
            role,
            content,
          })),
        }),
      });

      const contentType = response.headers.get("content-type") || "";

      if (
        !response.ok ||
        !response.body ||
        !contentType.includes("text/event-stream")
      ) {
        const data = await readApiJson<{
          id?: string;
          message?: string;
          usage?: AccountUsage;
        }>(response, "Malcom returned an invalid response.");
        setMessages(baseMessages);
        setInput(prompt);

        if (data.usage) {
          setAccountUsage(data.usage);
          setLimitOpen(response.status === 429);
        }

        throw new Error(
          data.error || "Malcom could not reach the intelligence engine.",
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedUsage: AccountUsage | null | undefined;
      let buffer = "";

      const handleStreamEvent = (block: string) => {
        const parsed = parseSseMessage(block);

        if (!parsed) {
          return;
        }

        if (parsed.event === "error") {
          throw new Error(
            parsed.data.error || "Malcom could not complete the response.",
          );
        }

        if (parsed.event === "delta" && parsed.data.delta) {
          assistantContent += parsed.data.delta;

          if (
            requestToken === requestTokenRef.current &&
            !controller.signal.aborted
          ) {
            setMessages([
              ...pendingMessages,
              {
                id: assistantResponseId,
                role: "assistant",
                content: assistantContent,
              },
            ]);
          }
        }

        if (parsed.event === "done") {
          streamedUsage = parsed.data.usage;
          if (parsed.data.id) {
            assistantResponseId = parsed.data.id;
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const blocks = buffer.split(/\n\n/);
          buffer = blocks.pop() || "";

          for (const block of blocks) {
            handleStreamEvent(block);
          }
        }

        if (done) {
          if (buffer.trim()) {
            handleStreamEvent(buffer);
          }
          break;
        }
      }

      if (requestToken !== requestTokenRef.current || controller.signal.aborted) {
        return;
      }

      if (!assistantContent.trim()) {
        throw new Error("No response was returned by the model.");
      }

      setMessages([
        ...pendingMessages,
        {
          id: assistantResponseId,
          role: "assistant",
          content: assistantContent,
        },
      ]);

      if (authUser) {
        if (streamedUsage) {
          setAccountUsage(streamedUsage);
        } else {
          void refreshUsage();
        }
        void refreshUserWorkspace();
      } else {
        const nextGuestUsed = Math.min(guestResponseLimit, guestUsed + 1);
        setGuestUsed(nextGuestUsed);
        writeGuestUsage(nextGuestUsed);
      }
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
      ) {
        return;
      }

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unexpected intelligence engine error.";

      if (requestToken === requestTokenRef.current) {
        setMessages(baseMessages);
        setInput((current) => (current.trim() ? current : prompt));
        setError(message);
      }
    } finally {
      if (requestToken === requestTokenRef.current) {
        setIsSending(false);
        abortRef.current = null;
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function stopStreamingResponse() {
    if (!isSending) {
      return;
    }

    requestTokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSending(false);
    setError("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function startNewChat() {
    setOpenSessionMenuId("");
    abortRef.current?.abort();
    abortRef.current = null;
    requestTokenRef.current += 1;
    setIsSending(false);
    const nextSessionId = createMessageId();
    setSessionId(nextSessionId);
    setMessages(initialMessages);
    setResponseStates({});
    setInput("");
    setError("");
    setDocumentStatus("");
    setSelectedDocumentIds([]);
    window.localStorage.removeItem(chatStorageKey);
    replaceBrowserPath("/new");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function patchResponseState(id: string, patch: ResponseState) {
    setResponseStates((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  }

  function copyWithFallback(content: string) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(content);
    }

    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);

    return Promise.resolve();
  }

  async function copyResponse(id: string, content: string) {
    try {
      await copyWithFallback(content);
      patchResponseState(id, { copied: true, status: "Copied" });
      window.setTimeout(
        () => patchResponseState(id, { copied: false, status: "" }),
        1300,
      );
    } catch {
      patchResponseState(id, { status: "Copy failed" });
    }
  }

  function editPrompt(id: string, content: string) {
    setInput(content);
    setError("");
    patchResponseState(id, { status: "Loaded for editing" });
    window.setTimeout(() => patchResponseState(id, { status: "" }), 1300);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function saveResponseAction(
    messageId: string,
    reaction: ResponseReaction | "comment",
    comment = "",
  ) {
    const response = await fetch("/api/response-feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageId, reaction, comment }),
    });

    if (!response.ok) {
      throw new Error("Response action was not saved.");
    }
  }

  async function reactToResponse(id: string, reaction: ResponseReaction) {
    patchResponseState(id, { reaction, status: "Saved" });

    try {
      await saveResponseAction(id, reaction);
    } catch {
      patchResponseState(id, { status: "Could not save" });
      return;
    }

    window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
  }

  async function toggleStarredResponse(id: string, content: string) {
    const nextStarred = !starredMessageIds.has(id);
    patchResponseState(id, { status: nextStarred ? "Starred" : "Unstarred" });

    const nextStar = {
      id,
      message_id: id,
      session_id: sessionId,
      content,
      created_at: new Date().toISOString(),
    };

    if (!accessToken) {
      const nextStars = nextStarred
        ? [
            nextStar,
            ...starredResponses.filter((response) => response.message_id !== id),
          ]
        : starredResponses.filter((response) => response.message_id !== id);

      setStarredResponses(nextStars);
      writeJsonArray(guestStarsKey, nextStars);
      window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
      return;
    }

    try {
      const response = await fetch("/api/user/starred-responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          messageId: id,
          sessionId,
          content,
          starred: nextStarred,
        }),
      });

      if (!response.ok) {
        throw new Error("Star was not saved.");
      }

      await refreshUserWorkspace();
      window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
    } catch {
      patchResponseState(id, { status: "Could not save star" });
    }
  }

  function toggleResponseComment(id: string) {
    setResponseStates((current) => ({
      ...current,
      [id]: {
        ...current[id],
        commenting: !current[id]?.commenting,
        status: "",
      },
    }));
  }

  function changeResponseComment(id: string, comment: string) {
    patchResponseState(id, { comment });
  }

  async function submitResponseComment(id: string) {
    const comment = responseStates[id]?.comment?.trim() || "";

    if (!comment) {
      patchResponseState(id, { status: "Write a note first" });
      return;
    }

    patchResponseState(id, { status: "Saving..." });

    try {
      await saveResponseAction(id, "comment", comment);
      patchResponseState(id, {
        comment: "",
        commenting: false,
        status: "Note saved",
      });
      window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
    } catch {
      patchResponseState(id, { status: "Could not save note" });
    }
  }

  function regenerateResponse(id: string) {
    const responseIndex = messages.findIndex((message) => message.id === id);

    if (responseIndex < 1 || isSending || isComposerDisabled) {
      return;
    }

    const priorMessages = messages.slice(0, responseIndex);
    const previousUser = [...priorMessages]
      .reverse()
      .find((message) => message.role === "user");

    if (!previousUser) {
      return;
    }

    setMessages(priorMessages);
    void sendMessage(previousUser.content, priorMessages.slice(0, -1));
  }

  function openAuth(mode: "sign-in" | "sign-up") {
    setAuthMode(mode);
    setAuthStatus("");
    setAuthOpen(true);
  }

  function renderSessionRow(session: SavedSession, metaText?: string) {
    const isMenuOpen = openSessionMenuId === session.id;
    const isPinned = Boolean(session.pinned);
    const sessionMeta =
      metaText || new Date(session.updated_at).toLocaleDateString();

    return (
      <article
        key={session.id}
        className={`${styles.sessionRow} ${
          session.id === sessionId ? styles.sessionActive : ""
        }`}
      >
        <button
          className={styles.sessionOpenButton}
          type="button"
          aria-current={session.id === sessionId ? "page" : undefined}
          onClick={() => void openSavedChat(session.id)}
        >
          <span>{session.title}</span>
          <time>{sessionMeta}</time>
        </button>
        <div className={styles.sessionActions}>
          <button
            type="button"
            onClick={() => {
              setOpenDocumentMenuId("");
              setOpenSessionMenuId((current) =>
                current === session.id ? "" : session.id,
              );
            }}
            aria-label={`Open actions for ${session.title}`}
            aria-expanded={isMenuOpen}
            title="Chat actions"
          >
            <EllipsisVertical size={15} />
          </button>
          {isMenuOpen ? (
            <div className={styles.sessionMenu}>
              <button type="button" onClick={() => void togglePinnedSession(session)}>
                {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                <span>{isPinned ? "Unpin" : "Pin"}</span>
              </button>
              <button type="button" onClick={() => beginEditSession(session)}>
                <FileText size={14} />
                <span>Rename</span>
              </button>
              <button type="button" onClick={() => void deleteSession(session.id)}>
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  function addWaitingNudge(text: string) {
    setInput((current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function addPromptStarter(text: string) {
    setInput((current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  const isPaidPlan =
    accountUsage?.plan === "pro" || accountUsage?.plan === "enterprise";
  const usageUsed = authUser ? accountUsage?.messagesUsed ?? 0 : guestUsed;
  const usageLimit = authUser
    ? accountUsage?.messagesLimit
    : guestResponseLimit;
  const usageProgress =
    usageLimit === null
      ? 100
      : Math.min(100, Math.round((usageUsed / Math.max(1, usageLimit || 1)) * 100));
  const messagesRemaining =
    usageLimit === null ? null : Math.max(0, (usageLimit ?? guestResponseLimit) - usageUsed);
  const upgradeLabel = isPaidPlan ? "Plan" : "Upgrade";
  const momentumMetric =
    usageLimit === null ? `${usageUsed} messages` : `${usageUsed}/${usageLimit ?? 100} used`;
  const momentumDetail = authUser
    ? `${activeSessions.length} chats / ${documents.length} docs / ${starredResponses.length} starred`
    : "Sign up to keep chats, files, and starred answers.";
  const emptyValueLead = !authUser
    ? `${messagesRemaining ?? guestRemaining} guest responses available`
    : isPaidPlan
      ? "Higher limits active"
      : `${messagesRemaining ?? accountUsage?.responsesRemaining ?? 0} free messages left`;
  const emptyValueTitle = !authUser
    ? "Keep this workspace"
    : isPaidPlan
      ? "Workspace synced"
      : "Ready for deeper work";
  const emptyValueDetail = !authUser
    ? "Save chats, files, and starred answers across devices."
    : isPaidPlan
      ? "Chats, files, and memory stay available when you return."
      : "Upgrade for longer sessions, fewer interruptions, and higher limits.";
  const settingsInsightText = !authUser
    ? "Create an account to keep chats, documents, and memory together."
    : isPaidPlan
      ? `${activeSessions.length} chats, ${documents.length} docs, and ${starredResponses.length} starred answers are synced.`
      : `${activeSessions.length} chats saved. Upgrade when you want longer sessions with fewer limits.`;
  const planValueText = !authUser
    ? "Create a free account to keep this work and continue from any device."
    : isPaidPlan
      ? "Your workspace is set up for longer, uninterrupted work."
      : "Pro is built for longer sessions, fewer interruptions, and higher message limits.";
  const waitStepIndex = loadingNoteIndex % activeWaitingFlow.length;
  const currentWaitStep = activeWaitingFlow[waitStepIndex];

  return (
    <main
      className={`${styles.shell} ${
        sidebarCollapsed ? styles.shellCollapsed : ""
      }`}
    >
      <aside className={styles.sidebar} aria-label="Malcom navigation">
        <div className={styles.sidebarHeader}>
          <button
            className={styles.brand}
            type="button"
            onClick={startNewChat}
            aria-label="Start a new Malcom chat"
          >
            <MalcomAvatar active showBeta />
            <span>
              <strong>Malcom</strong>
              <small>All-round AI workspace</small>
              <small className={styles.brandDeveloper}>Developer: Muditya Raghav</small>
            </span>
          </button>

          <button
            className={styles.iconButton}
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        <div className={styles.sidebarActions}>
          <button className={styles.primaryButton} type="button" onClick={startNewChat}>
            <Plus size={16} />
            <span>New Chat</span>
          </button>

          <button
            className={styles.upgradeButton}
            type="button"
            onClick={openUpgrade}
            title="Upgrade plan"
          >
            <Zap size={16} />
            <span>{upgradeLabel}</span>
          </button>

          {!authUser ? (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => openAuth("sign-up")}
            >
              <LogIn size={16} />
              <span>Sign up free</span>
            </button>
          ) : null}
        </div>

        <div className={styles.sidebarScroll}>
          <section className={styles.momentumPanel} aria-label="Workspace momentum">
            <div>
              <span>{isPaidPlan ? "Plan active" : "Workspace momentum"}</span>
              <strong>{isPaidPlan ? readablePlan(accountUsage) : momentumMetric}</strong>
            </div>
            <div className={styles.momentumTrack} aria-hidden="true">
              <span style={{ width: `${usageProgress}%` }} />
            </div>
            <p>{momentumDetail}</p>
          </section>

          <label className={styles.historySearch}>
            <Search size={14} aria-hidden="true" />
            <input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search chats"
            />
          </label>

          {historyStatus ? <p className={styles.sidebarStatus}>{historyStatus}</p> : null}

          <section className={styles.navSection}>
            <div className={styles.navSectionHeader}>
              <FolderOpen size={14} aria-hidden="true" />
              <h2>Library</h2>
            </div>

            <div className={styles.libraryGrid}>
              <button
                type="button"
                onClick={() =>
                  setOpenLibraryPanel((current) =>
                    current === "documents" ? "" : "documents",
                  )
                }
                aria-expanded={openLibraryPanel === "documents"}
              >
                <FileText size={14} />
                <span>Documents</span>
                {documents.length ? <strong>{documents.length}</strong> : null}
                <ChevronDown
                  className={
                    openLibraryPanel === "documents" ? styles.libraryIconOpen : ""
                  }
                  size={14}
                />
              </button>
              <button
                type="button"
                onClick={() =>
                  setOpenLibraryPanel((current) =>
                    current === "starred" ? "" : "starred",
                  )
                }
                aria-expanded={openLibraryPanel === "starred"}
              >
                <BookMarked size={14} />
                <span>Starred</span>
                {starredResponses.length ? (
                  <strong>{starredResponses.length}</strong>
                ) : null}
                <ChevronDown
                  className={
                    openLibraryPanel === "starred" ? styles.libraryIconOpen : ""
                  }
                  size={14}
                />
              </button>
              <button
                type="button"
                onClick={() =>
                  setOpenLibraryPanel((current) =>
                    current === "pinned" ? "" : "pinned",
                  )
                }
                aria-expanded={openLibraryPanel === "pinned"}
              >
                <Pin size={14} />
                <span>Pinned</span>
                {pinnedSessions.length ? <strong>{pinnedSessions.length}</strong> : null}
                <ChevronDown
                  className={
                    openLibraryPanel === "pinned" ? styles.libraryIconOpen : ""
                  }
                  size={14}
                />
              </button>
            </div>

            {openLibraryPanel === "documents" ? (
              <div className={styles.libraryPanel}>
                {documents.length ? (
                  <div className={styles.documentList}>
                    {documents.slice(0, 5).map((document) => {
                      const selected = selectedDocumentIds.includes(document.id);
                      const isDocumentMenuOpen =
                        openDocumentMenuId === document.id;

                      return (
                        <article
                          key={document.id}
                          className={`${styles.documentRow} ${
                            selected ? styles.documentSelected : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSelectedDocument(document.id)}
                            aria-pressed={selected}
                          >
                            <span>{document.name}</span>
                            <time>{formatBytes(document.size)}</time>
                          </button>
                          <div className={styles.documentActions}>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenSessionMenuId("");
                                setOpenDocumentMenuId((current) =>
                                  current === document.id ? "" : document.id,
                                );
                              }}
                              aria-label={`Open actions for ${document.name}`}
                              aria-expanded={isDocumentMenuOpen}
                              title="Document actions"
                            >
                              <EllipsisVertical size={15} />
                            </button>
                            {isDocumentMenuOpen ? (
                              <div className={styles.sessionMenu}>
                                <button
                                  type="button"
                                  onClick={() => toggleSelectedDocument(document.id)}
                                >
                                  <Paperclip size={14} />
                                  <span>
                                    {selected ? "Remove context" : "Use in chat"}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => beginEditDocument(document)}
                                >
                                  <FileText size={14} />
                                  <span>Rename</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteDocument(document.id)}
                                >
                                  <Trash2 size={14} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.sidebarStatus}>No documents yet.</p>
                )}
              </div>
            ) : null}

            {openLibraryPanel === "starred" ? (
              <div className={styles.libraryPanel}>
                {starredResponses.length ? (
                  <div className={styles.starredList}>
                    {starredResponses.slice(0, 5).map((response) => (
                      <button
                        key={response.id}
                        type="button"
                        onClick={() => void copyResponse(response.message_id, response.content)}
                        title="Copy starred response"
                      >
                        <BookMarked size={13} />
                        <span>{response.content.slice(0, 90)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.sidebarStatus}>No starred responses yet.</p>
                )}
              </div>
            ) : null}

            {openLibraryPanel === "pinned" ? (
              <div className={styles.libraryPanel}>
                {pinnedSessions.length ? (
                  <div className={styles.historyList}>
                    {pinnedSessions
                      .slice(0, 4)
                      .map((session) => renderSessionRow(session, "Pinned"))}
                  </div>
                ) : (
                  <p className={styles.sidebarStatus}>No pinned chats yet.</p>
                )}
              </div>
            ) : null}
          </section>

          <section className={styles.navSection}>
            <div className={styles.navSectionHeader}>
              <MessageSquareText size={14} aria-hidden="true" />
              <h2>Chats</h2>
            </div>

            <div className={styles.historyList}>
              {recentSessions
                .slice(0, 10)
                .map((session) => renderSessionRow(session))}
            </div>
          </section>

          {editingSessionId ? (
            <section className={styles.sessionEditor}>
              <h2>Rename chat</h2>
              <input
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                placeholder="Chat title"
              />
              <div>
                <button type="button" onClick={() => void saveSessionEdits()}>
                  Save
                </button>
                <button type="button" onClick={() => setEditingSessionId("")}>
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          {editingDocumentId ? (
            <section className={styles.sessionEditor}>
              <h2>Rename document</h2>
              <input
                value={editingDocumentName}
                onChange={(event) => setEditingDocumentName(event.target.value)}
                placeholder="Document name"
              />
              <div>
                <button type="button" onClick={() => void saveDocumentEdits()}>
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDocumentId("");
                    setEditingDocumentName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.workspacePanel}>
            <div>
              <PlanBadge authUser={authUser} usage={accountUsage} guestUsed={guestUsed} />
              <p>
                {authUser
                  ? profile.display_name || authUser.email || "Synced account"
                  : "Guest chats stay on this device."}
              </p>
            </div>
            {!authUser ? (
              <button type="button" onClick={() => openAuth("sign-in")}>
                Log in
              </button>
            ) : (
              <button type="button" onClick={() => void signOut()}>
                <LogOut size={14} />
              </button>
            )}
          </div>

          <button
            className={styles.settingsButton}
            type="button"
            onClick={() => openSettings("general")}
          >
            <Settings size={15} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      <section className={styles.chat}>
        {billingAlert ? (
          <div
            className={`${styles.billingAlert} ${
              billingAlert.kind === "success"
                ? styles.billingAlertSuccess
                : billingAlert.kind === "error"
                  ? styles.billingAlertError
                  : styles.billingAlertInfo
            }`}
            role="status"
            aria-live="polite"
          >
            <div>
              {billingAlert.kind === "success" ? (
                <Check size={16} />
              ) : billingAlert.kind === "error" ? (
                <AlertCircle size={16} />
              ) : (
                <CreditCard size={16} />
              )}
            </div>
            <span>
              <strong>{billingAlert.title}</strong>
              <p>{billingAlert.message}</p>
            </span>
            <button
              type="button"
              onClick={() => setBillingAlert(null)}
              aria-label="Dismiss billing notice"
              title="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        ) : null}

        <div className={styles.thread} ref={threadRef} aria-live="polite">
          {visiblePrompt ? (
            <section className={styles.emptyState}>
              <h1>Ask Malcom for the next clear move.</h1>
              <p key={welcomeMessageIndex} className={styles.welcomeLine}>
                {welcomeMessages[welcomeMessageIndex]}
              </p>
              <div className={styles.emptyValueRail}>
                <div>
                  <span>{emptyValueLead}</span>
                  <strong>{emptyValueTitle}</strong>
                  <p>{emptyValueDetail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!authUser) {
                      openAuth("sign-up");
                      return;
                    }

                    if (isPaidPlan) {
                      openSettings("general");
                      return;
                    }

                    openUpgrade();
                  }}
                >
                  {!authUser ? (
                    <LogIn size={14} />
                  ) : isPaidPlan ? (
                    <Settings size={14} />
                  ) : (
                    <Zap size={14} />
                  )}
                  <span>
                    {!authUser
                      ? "Save workspace"
                      : isPaidPlan
                        ? "Tune settings"
                        : "Upgrade"}
                  </span>
                </button>
              </div>
              <div className={styles.suggestions} aria-label="First prompt ideas">
                {firstRunPrompts.map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    onClick={() => addPromptStarter(starter.text)}
                    disabled={isComposerDisabled}
                  >
                    <span>{starter.label}</span>
                    <p>{starter.detail}</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              responseState={responseStates[message.id]}
              streaming={
                isSending &&
                index === messages.length - 1 &&
                message.role === "assistant"
              }
              onCopy={copyResponse}
              onEditPrompt={editPrompt}
              onReaction={reactToResponse}
              onRegenerate={regenerateResponse}
              onToggleStar={toggleStarredResponse}
              onToggleComment={toggleResponseComment}
              onCommentChange={changeResponseComment}
              onSubmitComment={submitResponseComment}
              starred={starredMessageIds.has(message.id)}
            />
          ))}

          {isWaitingForAssistant ? (
            <article className={`${styles.message} ${styles.assistant}`}>
              <MalcomAvatar active />
              <div className={styles.messageBody}>
                <span>Malcom</span>
                <div className={styles.thinking} aria-label="Malcom is working">
                  <div className={styles.thinkingHeader}>
                    <strong>{currentWaitStep.label}</strong>
                    <span>{waitSeconds}s</span>
                  </div>
                  <div className={styles.thinkingRail} aria-hidden="true">
                    <span />
                  </div>
                  <div className={styles.thinkingSteps} aria-hidden="true">
                    {activeWaitingFlow.map((step, index) => (
                      <span
                        key={step.label}
                        data-active={index === waitStepIndex}
                      >
                        {step.label}
                      </span>
                    ))}
                  </div>
                  <p>{currentWaitStep.detail}</p>
                  <div
                    className={styles.thinkingActions}
                    aria-label="Capture a follow-up while Malcom works"
                  >
                    {waitingNudges.map((nudge) => (
                      <button
                        key={nudge.label}
                        type="button"
                        onClick={() => addWaitingNudge(nudge.text)}
                      >
                        {nudge.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ) : null}
        </div>

        <div className={styles.composerWrap}>
          {limitOpen || isGuestLimited || isFreeLimited ? (
            <div className={styles.limitCard}>
              <AlertCircle size={16} />
              <div>
                <strong>
                  {isGuestLimited
                    ? "You have used your 10 guest responses."
                    : "Your free message window is cooling down."}
                </strong>
                <p>
                  {isGuestLimited
                    ? "Create a free account to continue and save chats across devices."
                    : `Cooldown ends in ${formatDuration(
                        accountUsage?.cooldownSecondsRemaining || 0,
                      )}. Upgrade to Pro for higher limits.`}
                </p>
              </div>
              <div>
                {!authUser ? (
                  <>
                    <button type="button" onClick={() => openAuth("sign-in")}>
                      Login
                    </button>
                    <button type="button" onClick={() => openAuth("sign-up")}>
                      Register
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={openUpgrade}>
                    Upgrade
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className={styles.error}>
              <AlertCircle size={16} />
              {error}
            </p>
          ) : null}

          <form
            className={`${styles.composer} ${
              isDragActive ? styles.composerDragging : ""
            } ${isSending ? styles.composerThinking : ""}`}
            onSubmit={handleSubmit}
            onDrop={handleDrop}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
          >
            <input
              ref={documentInputRef}
              className={styles.fileInput}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.sql,.html,.css,.xml,.yaml,.yml,.log,text/*,application/json"
              onChange={(event) => {
                if (event.target.files) {
                  void handleFiles(event.target.files);
                }
              }}
            />
            <div className={styles.composerTop}>
              {visiblePrompt && !isSending ? (
                <div className={styles.promptStarterRow} aria-label="Prompt starters">
                  {promptStarters.map((starter) => (
                    <button
                      key={starter.label}
                      type="button"
                      onClick={() => addPromptStarter(starter.text)}
                      disabled={isComposerDisabled}
                    >
                      {starter.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <textarea
                ref={textareaRef}
                aria-label="Ask Malcom"
                placeholder={
                  isSending
                    ? "Capture your next thought while the answer streams..."
                    : promptPlaceholders[promptHintIndex]
                }
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !isSending) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                disabled={isComposerDisabled}
                rows={1}
              />
              {selectedDocuments.length ? (
                <div className={styles.attachmentStrip} aria-label="Attached documents">
                  {selectedDocuments.map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => toggleSelectedDocument(document.id)}
                      title={`${document.name} - ${formatBytes(document.size)}. Click to remove.`}
                    >
                      <FileText size={12} />
                      <span>{document.name}</span>
                      <small>{formatBytes(document.size)}</small>
                      <X size={11} />
                    </button>
                  ))}
                </div>
              ) : null}
              {documentStatus ? (
                <p className={styles.documentStatus}>{documentStatus}</p>
              ) : null}
              <div className={styles.promptSignal} data-tone={promptTone}>
                <span>{promptStatus}</span>
                <div aria-hidden="true">
                  <span style={{ width: `${promptEnergy}%` }} />
                </div>
                <strong>{promptWordCount} words</strong>
              </div>
            </div>
            <div className={styles.composerBottom}>
              <div className={styles.composerTools}>
                <button
                  className={styles.attachButton}
                  type="button"
                  onClick={() => documentInputRef.current?.click()}
                  disabled={isUploadingDocument || isSending || isComposerDisabled}
                  title="Attach documents"
                >
                  <Paperclip size={15} />
                  <span>{isUploadingDocument ? "Uploading" : "Attach"}</span>
                </button>
                <button
                  className={styles.webResearchButton}
                  type="button"
                  aria-pressed={webResearchEnabled}
                  onClick={() => setWebResearchEnabled((current) => !current)}
                  disabled={isSending || isComposerDisabled}
                  title="Search the web and cite sources"
                >
                  <Search size={15} />
                  <span>Web</span>
                </button>
              </div>
              <div className={styles.modeControl} aria-label="Response depth">
                {responseModes.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    aria-pressed={responseMode === mode.value}
                    title={mode.detail}
                    onClick={() => setResponseMode(mode.value)}
                    disabled={isSending}
                  >
                    {mode.value === "brief" ? (
                      <Zap size={14} />
                    ) : mode.value === "deep" ? (
                      <BookOpen size={14} />
                    ) : (
                      <MessageSquareText size={14} />
                    )}
                    <span>{mode.label}</span>
                  </button>
                ))}
              </div>
              {isSending ? (
                <button
                  className={`${styles.sendButton} ${styles.stopButton}`}
                  type="button"
                  onClick={stopStreamingResponse}
                  aria-label="Stop response"
                  title="Stop response"
                >
                  <X size={17} />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  className={styles.sendButton}
                  type="submit"
                  disabled={isComposerDisabled || !input.trim()}
                  aria-label="Send message"
                  title="Send message"
                >
                  <SendHorizontal size={17} />
                  <span>Send</span>
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      {settingsOpen ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSettingsOpen(false);
            }
          }}
        >
          <section
            className={`${styles.dialog} ${styles.settingsDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className={styles.settingsHeader}>
              <div className={styles.settingsTitle}>
                <MalcomAvatar active />
                <div>
                  <h2 id="settings-title">Settings</h2>
                  <p>Personalize Malcom for this workspace.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <X size={17} />
              </button>
            </div>

            <div className={styles.settingsShell}>
              <nav className={styles.settingsNav} aria-label="Settings sections">
                {settingsTabs.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    className={settingsTab === value ? styles.settingsNavActive : ""}
                    aria-current={settingsTab === value ? "page" : undefined}
                    onClick={() => {
                      setSettingsTab(value);
                      setSettingsStatus("");
                    }}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>

              <div className={styles.settingsPanel}>
                <div className={styles.settingsInsightPanel}>
                  <div>
                    <span>Workspace signal</span>
                    <strong>{readablePlan(accountUsage)} workspace</strong>
                    <p>{settingsInsightText}</p>
                  </div>
                  <div className={styles.settingsInsightGrid}>
                    <span data-active={settingsTab === "general"}>Depth</span>
                    <span data-active={settingsTab === "profile"}>Memory</span>
                    <span data-active={settingsTab === "plan"}>Limits</span>
                    <span data-active={settingsTab === "data"}>Data</span>
                  </div>
                </div>

                {settingsTab === "general" ? (
                  <section className={styles.settingsSection}>
                    <div>
                      <h3>General</h3>
                      <p>Default workspace behavior for this chat surface.</p>
                    </div>

                    <div className={styles.settingsField}>
                      <span>Response depth</span>
                      <div className={styles.settingsSegment}>
                        {responseModes.map((mode) => (
                          <button
                            key={mode.value}
                            type="button"
                            aria-pressed={responseMode === mode.value}
                            onClick={() => setResponseMode(mode.value)}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.settingsField}>
                      <span>Account</span>
                      <strong>{authUser?.email || "Guest"}</strong>
                    </div>
                  </section>
                ) : null}

                {settingsTab === "profile" ? (
                  <section className={styles.settingsSection}>
                    <div>
                      <h3>Profile</h3>
                      <p>Details Malcom can use when responding.</p>
                    </div>

                    <label className={styles.settingsFormField}>
                      <span>Display name</span>
                      <input
                        value={profile.display_name}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            display_name: event.target.value,
                          }))
                        }
                        placeholder="Name Malcom should use"
                      />
                    </label>

                    <label className={styles.settingsFormField}>
                      <span>Profile memory</span>
                      <textarea
                        value={profile.memory}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            memory: event.target.value,
                          }))
                        }
                        placeholder="Preferences, recurring context, response style, or work focus"
                        rows={7}
                      />
                    </label>

                    <div className={styles.gfMemoPanel}>
                      <div>
                        <span>gf_memo</span>
                        <strong>
                          {gfMemo
                            ? `${gfMemo.promptCount} prompts learned`
                            : "Learning after registered prompts"}
                        </strong>
                        <p>
                          {gfMemo?.responseProfile ||
                            "Malcom updates this adaptive response profile after each signed-in prompt."}
                        </p>
                      </div>
                      {gfMemo?.topTopics.length ? (
                        <div className={styles.gfMemoChips} aria-label="gf_memo topics">
                          {gfMemo.topTopics.slice(0, 6).map((topic) => (
                            <span key={topic}>{topic}</span>
                          ))}
                        </div>
                      ) : null}
                      {gfMemo?.styleSignals.length ? (
                        <ul>
                          {gfMemo.styleSignals.slice(0, 3).map((signal) => (
                            <li key={signal}>{signal}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div className={styles.settingsActions}>
                      <button
                        type="button"
                        onClick={() => void saveProfileSettings()}
                        disabled={isSavingSettings || !authUser}
                      >
                        Save profile
                      </button>
                      {!authUser ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsOpen(false);
                            openAuth("sign-in");
                          }}
                        >
                          Log in to save
                        </button>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {settingsTab === "plan" ? (
                  <section className={styles.settingsSection}>
                    <div>
                      <h3>Plan</h3>
                      <p>Usage, limits, and upgrades.</p>
                    </div>

                    <div className={styles.settingsPlanCard}>
                      <span>Current plan</span>
                      <strong>{readablePlan(accountUsage)}</strong>
                      <p>
                        {authUser
                          ? accountUsage?.messagesLimit === null
                            ? `${accountUsage.messagesUsed} messages used.`
                            : `${accountUsage?.messagesUsed ?? 0}/${
                                accountUsage?.messagesLimit ?? 100
                              } free messages used.`
                          : `${guestUsed}/${guestResponseLimit} guest responses used.`}
                      </p>
                      <p>{planValueText}</p>
                    </div>

                    <div className={styles.settingsGrid}>
                      <div>
                        <span>Chats</span>
                        <strong>{activeSessions.length}</strong>
                      </div>
                      <div>
                        <span>Documents</span>
                        <strong>{documents.length}</strong>
                      </div>
                      <div>
                        <span>Starred</span>
                        <strong>{starredResponses.length}</strong>
                      </div>
                      <div>
                        <span>Period end</span>
                        <strong>{formatDate(accountUsage?.currentPeriodEnd || null)}</strong>
                      </div>
                    </div>

                    <div className={styles.settingsActions}>
                      <button
                        type="button"
                        onClick={() => void startCheckout("pro")}
                        disabled={
                          isSavingSettings ||
                          accountUsage?.plan === "pro" ||
                          accountUsage?.plan === "enterprise"
                        }
                      >
                        Upgrade to Pro
                      </button>
                      <button
                        type="button"
                        onClick={() => void startCheckout("enterprise")}
                        disabled={
                          isSavingSettings || accountUsage?.plan === "enterprise"
                        }
                      >
                        Upgrade to Enterprise
                      </button>
                    </div>
                  </section>
                ) : null}

                {settingsTab === "data" ? (
                  <section className={styles.settingsSection}>
                    <div>
                      <h3>Data controls</h3>
                      <p>Local chat data, uploads, and account privacy.</p>
                    </div>

                    <div className={styles.settingsNotice}>
                      <Database size={17} />
                      <div>
                        <strong>
                          {authUser
                            ? "Signed-in data syncs with your account."
                            : "Guest chats stay on this device."}
                        </strong>
                        <p>
                          Uploaded documents are used as conversation context.
                          Selected files can be removed from the document library.
                        </p>
                      </div>
                    </div>

                    <div className={styles.settingsActions}>
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsOpen(false);
                          startNewChat();
                        }}
                      >
                        New chat
                      </button>
                      <button
                        type="button"
                        className={styles.settingsDangerButton}
                        onClick={() => {
                          setSettingsOpen(false);
                          void signOut();
                        }}
                        disabled={!authUser}
                      >
                        Log out
                      </button>
                    </div>
                  </section>
                ) : null}

                {settingsStatus ? (
                  <p className={styles.settingsStatus}>{settingsStatus}</p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {upgradeOpen ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setUpgradeOpen(false);
            }
          }}
        >
          <section
            className={`${styles.dialog} ${styles.upgradeDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
          >
            <div className={styles.upgradeHero}>
              <div className={styles.upgradeIcon} aria-hidden="true">
                <Zap size={20} />
              </div>
              <div>
                <p>{authUser ? emptyValueLead : "Keep the work you start"}</p>
                <h2 id="upgrade-title">Malcom for everything you ask next</h2>
                <span>
                  One calm workspace for research, writing, code, math,
                  documents, planning, and decisions with clear safety boundaries.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setUpgradeOpen(false)}
                aria-label="Close upgrade"
              >
                <X size={17} />
              </button>
            </div>

            <div className={styles.upgradeBody}>
              <div className={styles.upgradePlanGrid}>
                {upgradePlans.map((plan) => {
                  const isPlanActive =
                    accountUsage?.plan === plan.id ||
                    (plan.id === "pro" && accountUsage?.plan === "enterprise");
                  const isCurrentCheckout = checkoutPlan === plan.id;

                  return (
                    <div
                      key={plan.id}
                      className={`${styles.upgradePlan} ${
                        plan.id === "pro" ? styles.upgradePlanPrimary : ""
                      }`}
                    >
                      <div className={styles.upgradePlanHeader}>
                        <span>{plan.eyebrow}</span>
                        <div className={styles.upgradePriceRow}>
                          <strong>{plan.name}</strong>
                          <p>
                            <b>{plan.price}</b>
                            {plan.cadence}
                          </p>
                        </div>
                        <p>{plan.description}</p>
                      </div>
                      <ul>
                        {plan.features.map((feature) => (
                          <li key={feature}>
                            <Check size={15} />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <button
                        className={
                          plan.id === "pro"
                            ? styles.upgradePrimaryCta
                            : styles.upgradeSecondaryCta
                        }
                        type="button"
                        onClick={() => void startCheckout(plan.id)}
                        disabled={
                          isSavingSettings ||
                          accountUsage?.plan === "enterprise" ||
                          isPlanActive
                        }
                      >
                        {plan.id === "pro" ? (
                          <Zap size={16} />
                        ) : (
                          <CreditCard size={15} />
                        )}
                        <span>
                          {isPlanActive
                            ? `${plan.name} active`
                            : isCurrentCheckout
                              ? "Opening checkout"
                              : authUser
                                ? `Upgrade to ${plan.name}`
                                : "Create account to upgrade"}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className={styles.upgradeComparison}>
                <div className={styles.upgradeMetric}>
                  <span>Current workspace</span>
                  <strong>{readablePlan(accountUsage)}</strong>
                  <p>{planValueText}</p>
                </div>

                <div className={styles.comparisonTable} role="table" aria-label="Plan comparison">
                  <div role="row" className={styles.comparisonHeader}>
                    <span role="columnheader">Feature</span>
                    <span role="columnheader">Free</span>
                    <span role="columnheader">Pro</span>
                    <span role="columnheader">Enterprise</span>
                  </div>
                  {comparisonRows.map(([feature, free, pro, enterprise]) => (
                    <div role="row" key={feature}>
                      <span role="cell">{feature}</span>
                      <span role="cell">{free}</span>
                      <span role="cell">{pro}</span>
                      <span role="cell">{enterprise}</span>
                    </div>
                  ))}
                </div>

                {!authUser ? (
                  <button
                    className={styles.upgradeTextButton}
                    type="button"
                    onClick={() => {
                      setUpgradeOpen(false);
                      openAuth("sign-in");
                    }}
                  >
                    Already have an account
                  </button>
                ) : null}
              </div>
            </div>

            {checkoutStatus ? (
              <p className={styles.upgradeStatus}>{checkoutStatus}</p>
            ) : null}
          </section>
        </div>
      ) : null}

      {authOpen ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setAuthOpen(false);
            }
          }}
        >
          <section
            className={`${styles.dialog} ${styles.authDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <p>{authMode === "sign-up" ? "Start synced workspace" : "Return to workspace"}</p>
                <h2 id="auth-title">
                  {authMode === "sign-up" ? "Keep this work moving" : "Welcome back"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                aria-label="Close account dialog"
              >
                <X size={17} />
              </button>
            </div>

            <form className={styles.dialogForm} onSubmit={submitAuth}>
              <div className={styles.authMomentumPanel}>
                <div>
                  <span>{authMode === "sign-up" ? "Saved momentum" : "Workspace restore"}</span>
                  <strong>
                    {authMode === "sign-up"
                      ? `${messages.length} messages ready to keep`
                      : "Chats, files, and memory come back"}
                  </strong>
                </div>
                <div className={styles.authStepRail} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <ul>
                  <li>Saved chats across devices</li>
                  <li>Profile memory for better answers</li>
                  <li>Starred responses and documents</li>
                </ul>
              </div>

              <div className={styles.authToolButtons}>
                <button
                  type="button"
                  onClick={continueAuthWithGoogle}
                  disabled={isSubmittingAuth}
                >
                  <Mail size={16} />
                  <span>
                    {authMode === "sign-up"
                      ? "Sign up with Google"
                      : "Log in with Google"}
                  </span>
                </button>
              </div>

              <div className={styles.authDivider} aria-hidden="true">
                <span>or</span>
              </div>

              <label>
                <span>Email</span>
                <input
                  required
                  type="email"
                  maxLength={180}
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                <span>Password</span>
                <div className={styles.passwordField}>
                  <input
                    required
                    type={authPasswordVisible ? "text" : "password"}
                    minLength={6}
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setAuthPasswordVisible((current) => !current)}
                    aria-label={
                      authPasswordVisible ? "Hide password" : "Show password"
                    }
                    title={authPasswordVisible ? "Hide password" : "Show password"}
                  >
                    {authPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              {authStatus ? <p className={styles.dialogStatus}>{authStatus}</p> : null}

              <button type="submit" disabled={isSubmittingAuth}>
                {isSubmittingAuth
                  ? "Working..."
                  : authMode === "sign-up"
                    ? "Create account"
                    : "Log in"}
              </button>

              <div className={styles.authSwitch}>
                <button
                  type="button"
                  onClick={() =>
                    setAuthMode((current) =>
                      current === "sign-in" ? "sign-up" : "sign-in",
                    )
                  }
                >
                  {authMode === "sign-in"
                    ? "Create an account"
                    : "I already have an account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {deleteSessionId ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDeleteSessionId("");
            }
          }}
        >
          <section
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <p>Chat</p>
                <h2 id="delete-chat-title">Delete this chat?</h2>
              </div>
              <button
                type="button"
                onClick={() => setDeleteSessionId("")}
                aria-label="Close delete confirmation"
              >
                <X size={17} />
              </button>
            </div>
            <div className={styles.dialogForm}>
              <p className={styles.dialogStatus}>
                This removes the chat from your history.
              </p>
              <div className={styles.authSwitch}>
                <button type="button" onClick={() => setDeleteSessionId("")}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.dangerAction}
                  onClick={() => {
                    const nextSessionId = deleteSessionId;
                    setDeleteSessionId("");
                    void confirmDeleteSession(nextSessionId);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

    </main>
  );
}
