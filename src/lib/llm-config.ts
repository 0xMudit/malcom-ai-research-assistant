import "server-only";

import { type ResponseMode } from "@/lib/response-modes";

export const MALCOM_MODEL =
  process.env.MALCOM_MODEL ||
  "hf.co/HauhauCS/Qwen3.5-2B-Uncensored-HauhauCS-Aggressive:latest";

export const MALCOM_LLM_BASE_URL = (
  process.env.MALCOM_LLM_BASE_URL || "http://127.0.0.1:11434"
)
  .replace(/\/v1\/?$/, "")
  .replace(/\/$/, "");

export const MALCOM_REQUEST_TIMEOUT_MS = readPositiveIntegerEnv(
  process.env.MALCOM_REQUEST_TIMEOUT_MS,
  170_000,
);

export const MALCOM_NUM_PREDICT = readPositiveIntegerEnv(
  process.env.MALCOM_NUM_PREDICT,
  2048,
);

export const MALCOM_MAX_NUM_PREDICT = readPositiveIntegerEnv(
  process.env.MALCOM_MAX_NUM_PREDICT,
  4096,
);

export function readPositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveNumPredict(mode: ResponseMode) {
  const target =
    mode === "brief"
      ? Math.min(768, MALCOM_NUM_PREDICT)
      : mode === "deep"
        ? Math.max(MALCOM_NUM_PREDICT, 3072)
        : MALCOM_NUM_PREDICT;

  return Math.min(target, MALCOM_MAX_NUM_PREDICT);
}

export function getResponseModeInstruction(mode: ResponseMode) {
  if (mode === "brief") {
    return "Prefer a concise answer. Lead with the answer, then include only the details needed to act.";
  }

  if (mode === "deep") {
    return "Provide a thorough answer with structure, assumptions, tradeoffs, and concrete next steps when useful.";
  }

  return "Use balanced depth: answer directly, include useful context, and avoid unnecessary expansion.";
}
