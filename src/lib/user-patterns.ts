export type PromptPatternInput = {
  content: string;
  created_at?: string;
};

export type PromptIntent = {
  label: string;
  count: number;
};

export type PromptPatternProfile = {
  promptCount: number;
  averageWords: number;
  lastActive: string;
  topTopics: string[];
  intentMix: PromptIntent[];
  styleSignals: string[];
  responseProfile: string;
  samplePrompt: string;
};

const stopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "because",
  "before",
  "build",
  "can",
  "could",
  "everything",
  "fix",
  "for",
  "from",
  "have",
  "into",
  "like",
  "make",
  "more",
  "need",
  "not",
  "now",
  "platform",
  "please",
  "proper",
  "properly",
  "should",
  "that",
  "the",
  "then",
  "this",
  "update",
  "user",
  "want",
  "when",
  "with",
  "work",
  "working",
  "you",
]);

const intentRules: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "Product and UX",
    pattern: /\b(ui|ux|navbar|prompt|textbox|settings|signup|signin|upgrade|register|modal|page|admin|hook|conversion|user)\b/i,
  },
  {
    label: "Code and debugging",
    pattern: /\b(code|bug|fix|api|route|next|react|typescript|python|sql|css|build|lint|deploy|file|attach)\b/i,
  },
  {
    label: "Planning",
    pattern: /\b(plan|roadmap|strategy|steps|end to end|architecture|workflow|cycle)\b/i,
  },
  {
    label: "Learning",
    pattern: /\b(explain|understand|why|how|teach|learn|concept|psycholog)\b/i,
  },
  {
    label: "Analysis",
    pattern: /\b(analyze|compare|review|summary|summarize|evaluate|pattern|profile|personality)\b/i,
  },
];

function wordsFor(content: string) {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9_+\-.#/ ]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stopWords.has(word));
}

function countMatches(prompts: PromptPatternInput[]) {
  return intentRules
    .map((rule) => ({
      label: rule.label,
      count: prompts.filter((prompt) => rule.pattern.test(prompt.content)).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

function getTopTopics(prompts: PromptPatternInput[]) {
  const counts = new Map<string, number>();

  for (const prompt of prompts) {
    for (const word of wordsFor(prompt.content)) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([word]) => word);
}

function getStyleSignals(prompts: PromptPatternInput[], averageWords: number) {
  const text = prompts.map((prompt) => prompt.content).join("\n").toLowerCase();
  const signals: string[] = [];

  if (/\b(fix|do|update|make|start working|end to end)\b/.test(text)) {
    signals.push("Prefers action-first answers with concrete implementation steps.");
  }

  if (/\b(proper|clean|beautiful|easy|visible|aligned)\b/.test(text)) {
    signals.push("Cares about polished UI, clarity, and ergonomic details.");
  }

  if (/\b(psycholog|hook|upgrade|register|conversion|retention)\b/.test(text)) {
    signals.push("Often frames product work around motivation, value, and retention.");
  }

  if (/\b(immediately|quick|fast|frustrated|leave|time)\b/.test(text)) {
    signals.push("Sensitive to waiting time and wants visible progress while work happens.");
  }

  if (averageWords >= 35) {
    signals.push("Gives dense prompts; responses should organize requirements before solving.");
  } else if (averageWords > 0 && averageWords <= 12) {
    signals.push("Uses short prompts; responses should infer carefully and ask only when blocked.");
  }

  return signals.slice(0, 5);
}

export function analyzePromptPatterns(
  inputPrompts: PromptPatternInput[],
): PromptPatternProfile {
  const prompts = inputPrompts
    .map((prompt) => ({
      content: prompt.content.trim(),
      created_at: prompt.created_at || "",
    }))
    .filter((prompt) => prompt.content.length > 0);
  const wordCounts = prompts.map((prompt) => wordsFor(prompt.content).length);
  const averageWords = prompts.length
    ? Math.round(
        wordCounts.reduce((total, count) => total + count, 0) / prompts.length,
      )
    : 0;
  const intentMix = countMatches(prompts);
  const topTopics = getTopTopics(prompts);
  const styleSignals = getStyleSignals(prompts, averageWords);
  const primaryIntent = intentMix[0]?.label || "General research";
  const responseProfile =
    prompts.length === 0
      ? "No prompt pattern yet. Use the explicit prompt and ask for missing context only when needed."
      : [
          `Lead with ${primaryIntent.toLowerCase()} context.`,
          styleSignals.length
            ? "Reflect the user's preference for " +
              styleSignals
                .map((signal) => signal.replace(/\.$/, "").toLowerCase())
                .slice(0, 2)
                .join(" and ") +
              "."
            : "Keep the answer concise, practical, and well structured.",
          topTopics.length
            ? `Watch for recurring topics: ${topTopics.slice(0, 5).join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" ");

  return {
    promptCount: prompts.length,
    averageWords,
    lastActive: prompts[0]?.created_at || "",
    topTopics,
    intentMix,
    styleSignals,
    responseProfile,
    samplePrompt: prompts[0]?.content.slice(0, 180) || "",
  };
}

export function formatPromptPatternMemory(profile: PromptPatternProfile) {
  if (profile.promptCount === 0) {
    return "";
  }

  return [
    `Observed prompt pattern across ${profile.promptCount} recent user prompts.`,
    profile.intentMix.length
      ? `Primary intents: ${profile.intentMix
          .slice(0, 3)
          .map((intent) => `${intent.label} (${intent.count})`)
          .join(", ")}.`
      : "",
    profile.topTopics.length
      ? `Recurring topics: ${profile.topTopics.slice(0, 6).join(", ")}.`
      : "",
    profile.styleSignals.length
      ? `Style signals: ${profile.styleSignals.join(" ")}`
      : "",
    `Adaptive response profile: ${profile.responseProfile}`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatGfMemoMemory(profile: PromptPatternProfile) {
  const patternMemory = formatPromptPatternMemory(profile);

  if (!patternMemory) {
    return "";
  }

  return [
    "gf_memo adaptive personalization profile for this registered user.",
    patternMemory,
    "Use gf_memo to tailor examples, level of detail, pacing, and format. Do not use it to manipulate, pressure, or keep the user engaged unnecessarily.",
  ].join(" ");
}
