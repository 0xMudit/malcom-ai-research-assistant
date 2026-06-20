import "server-only";

const DEFAULT_SEARCH_RESULTS = 6;
const DEFAULT_FETCH_RESULTS = 4;
const SEARCH_TIMEOUT_MS = 8_000;
const PAGE_TIMEOUT_MS = 8_000;
const MAX_QUERY_CHARS = 280;
const MAX_PAGE_BYTES = 360_000;
const MAX_EXCERPT_CHARS = 2_600;
const MAX_CONTEXT_CHARS = 14_000;

export type WebResearchSource = {
  id: number;
  title: string;
  url: string;
  snippet: string;
  excerpt: string;
};

export type WebResearchResult = {
  query: string;
  generatedAt: string;
  sources: WebResearchSource[];
  errors: string[];
};

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();

    if (lower.startsWith("#x")) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }

    if (lower.startsWith("#")) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }

    return named[lower] || match;
  });
}

function cleanText(value: string) {
  return decodeHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuery(value: string) {
  return cleanText(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .slice(0, 2_000),
  ).slice(0, MAX_QUERY_CHARS);
}

function decodeDuckDuckGoUrl(value: string) {
  const href = decodeHtml(value);

  try {
    const url = href.startsWith("//")
      ? new URL(`https:${href}`)
      : new URL(href);
    const forwardedUrl = url.searchParams.get("uddg");

    return forwardedUrl ? decodeURIComponent(forwardedUrl) : url.toString();
  } catch {
    return href;
  }
}

function isPrivateIPv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isAllowedPublicUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      hostname !== "localhost" &&
      hostname !== "0.0.0.0" &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal") &&
      !hostname.endsWith(".localhost") &&
      !hostname.includes("..") &&
      !hostname.startsWith("[") &&
      !isPrivateIPv4(hostname)
    );
  } catch {
    return false;
  }
}

function uniqueResults(results: SearchResult[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = result.url.replace(/#.*$/, "").replace(/\/$/, "");

    if (!isAllowedPublicUrl(result.url) || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readTextLimit(response: Response, maxBytes: number) {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    bytes += value.byteLength;
    chunks.push(value);

    if (bytes >= maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function parseDuckDuckGoResults(html: string) {
  const results: SearchResult[] = [];
  const resultPattern =
    /<a\b(?=[^>]*class=['"][^'"]*\bresult-link\b[^'"]*['"])([^>]*)>([\s\S]*?)<\/a>([\s\S]*?)(?=<a\b(?=[^>]*class=['"][^'"]*\bresult-link\b[^'"]*['"])|<\/html>|$)/gi;

  for (const match of html.matchAll(resultPattern)) {
    const href = (match[1] || "").match(/\bhref=(["'])(.*?)\1/i)?.[2] || "";
    const url = decodeDuckDuckGoUrl(href);
    const title = cleanText(match[2] || "");
    const snippet = cleanText(
      (match[3] || "").match(
        /<td[^>]+class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i,
      )?.[1] || "",
    );

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return uniqueResults(results);
}

async function searchDuckDuckGo(query: string, count: number) {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, SEARCH_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
  }

  return parseDuckDuckGoResults(
    await withTimeout(response.text(), SEARCH_TIMEOUT_MS, "DuckDuckGo search"),
  ).slice(0, count);
}

async function searchBrave(query: string, count: number) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();

  if (!apiKey) {
    return [];
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("safesearch", "moderate");
  url.searchParams.set("text_decorations", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Brave Search returned HTTP ${response.status}`);
    }

    const data = (await response.json().catch(() => null)) as
      | {
          web?: {
            results?: Array<{
              title?: unknown;
              url?: unknown;
              description?: unknown;
            }>;
          };
        }
      | null;

    return uniqueResults(
      (data?.web?.results || [])
        .map((item) => ({
          title: cleanText(String(item.title || "")),
          url: String(item.url || ""),
          snippet: cleanText(String(item.description || "")),
        }))
        .filter((item) => item.title && item.url),
    ).slice(0, count);
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWeb(query: string, count: number, errors: string[]) {
  try {
    const braveResults = await searchBrave(query, count);

    if (braveResults.length > 0) {
      return braveResults;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Brave Search failed.");
  }

  try {
    return await searchDuckDuckGo(query, count);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "DuckDuckGo search failed.");
    return [];
  }
}

function extractTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";

  return cleanText(title).slice(0, 180);
}

function extractReadableText(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<form[\s\S]*?<\/form>/gi, " "),
  );
}

function trimExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= MAX_EXCERPT_CHARS) {
    return normalized;
  }

  const cutAt = normalized.lastIndexOf(".", MAX_EXCERPT_CHARS);
  const end = cutAt > 900 ? cutAt + 1 : MAX_EXCERPT_CHARS;

  return `${normalized.slice(0, end).trim()}...`;
}

async function enrichSearchResult(result: SearchResult) {
  try {
    const response = await fetchWithTimeout(result.url, PAGE_TIMEOUT_MS);
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      return {
        ...result,
        excerpt: result.snippet,
      };
    }

    const html = await withTimeout(
      readTextLimit(response, MAX_PAGE_BYTES),
      PAGE_TIMEOUT_MS,
      "Source fetch",
    );
    const title = extractTitle(html) || result.title;
    const excerpt = trimExcerpt(extractReadableText(html));

    return {
      title,
      url: response.url && isAllowedPublicUrl(response.url) ? response.url : result.url,
      snippet: result.snippet,
      excerpt: excerpt || result.snippet,
    };
  } catch {
    return {
      ...result,
      excerpt: result.snippet,
    };
  }
}

export async function researchWebForPrompt(prompt: string): Promise<WebResearchResult> {
  const query = normalizeQuery(prompt);
  const searchCount = readPositiveInteger(
    process.env.MALCOM_WEB_RESEARCH_SEARCH_RESULTS,
    DEFAULT_SEARCH_RESULTS,
  );
  const fetchCount = readPositiveInteger(
    process.env.MALCOM_WEB_RESEARCH_FETCH_RESULTS,
    DEFAULT_FETCH_RESULTS,
  );
  const errors: string[] = [];

  if (!query) {
    return {
      query,
      generatedAt: new Date().toISOString(),
      sources: [],
      errors: ["The prompt did not contain enough searchable text."],
    };
  }

  const searchResults = await searchWeb(query, searchCount, errors);
  const enriched = await Promise.all(searchResults.slice(0, fetchCount).map(enrichSearchResult));

  return {
    query,
    generatedAt: new Date().toISOString(),
    sources: enriched
      .filter((source) => source.title && source.url && (source.excerpt || source.snippet))
      .map((source, index) => ({
        id: index + 1,
        title: source.title.slice(0, 180),
        url: source.url,
        snippet: source.snippet.slice(0, 500),
        excerpt: source.excerpt.slice(0, MAX_EXCERPT_CHARS),
      })),
    errors,
  };
}

export function formatWebResearchContext(result: WebResearchResult) {
  if (result.sources.length === 0) {
    return [
      "Web Research Mode was requested, but no usable web sources were retrieved.",
      `Search query: ${result.query || "(empty)"}`,
      result.errors.length ? `Errors: ${result.errors.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Web Research Mode source packet generated at ${result.generatedAt}.`,
    `Search query: ${result.query}`,
    ...result.sources.map((source) =>
      [
        `[${source.id}] ${source.title}`,
        `URL: ${source.url}`,
        source.snippet ? `Search snippet: ${source.snippet}` : "",
        `Fetched excerpt: ${source.excerpt}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ]
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);
}

export function formatWebSourcesList(sources: WebResearchSource[]) {
  if (sources.length === 0) {
    return "";
  }

  return [
    "## Sources",
    ...sources.map((source) => `${source.id}. [${source.title}](${source.url})`),
  ].join("\n");
}
