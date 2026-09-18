import { afterEach, describe, expect, it, vi } from "vitest";

import { getResponseModeInstruction, readPositiveIntegerEnv } from "./llm-config";

// The module reads process.env into constants at import time, so anything that
// depends on those constants has to be imported fresh with the env stubbed.
async function loadConfig(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  return import("./llm-config");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("readPositiveIntegerEnv", () => {
  it("falls back when the value is absent or blank", () => {
    expect(readPositiveIntegerEnv(undefined, 42)).toBe(42);
    expect(readPositiveIntegerEnv("", 42)).toBe(42);
  });

  it("parses positive integers", () => {
    expect(readPositiveIntegerEnv("7", 42)).toBe(7);
    expect(readPositiveIntegerEnv("  7  ", 42)).toBe(7);
  });

  it("falls back on zero, negatives, and non-numeric input", () => {
    for (const value of ["0", "-0", "-1", "abc", " ", "NaN", "Infinity", "inf"]) {
      expect(readPositiveIntegerEnv(value, 42), value).toBe(42);
    }
  });

  it("takes the leading integer and ignores any suffix", () => {
    // parseInt semantics, pinned deliberately: this is what lets an operator
    // write MALCOM_REQUEST_TIMEOUT_MS=170s, but it also means "1e3" reads as 1
    // rather than 1000. Changing it would be a behaviour change, not a fix.
    expect(readPositiveIntegerEnv("170s", 42)).toBe(170);
    expect(readPositiveIntegerEnv("42abc", 42)).toBe(42);
    expect(readPositiveIntegerEnv("7.9", 42)).toBe(7);
    expect(readPositiveIntegerEnv("1e3", 42)).toBe(1);
  });
});

describe("base URL normalisation", () => {
  it("strips a trailing /v1 and trailing slash", async () => {
    // Ollama exposes /v1; the client appends its own path, so a stray suffix
    // would produce /v1/v1/... requests.
    expect((await loadConfig({ MALCOM_LLM_BASE_URL: "http://localhost:11434/v1" })).MALCOM_LLM_BASE_URL).toBe("http://localhost:11434");
    expect((await loadConfig({ MALCOM_LLM_BASE_URL: "http://localhost:11434/v1/" })).MALCOM_LLM_BASE_URL).toBe("http://localhost:11434");
    expect((await loadConfig({ MALCOM_LLM_BASE_URL: "http://localhost:11434/" })).MALCOM_LLM_BASE_URL).toBe("http://localhost:11434");
    expect((await loadConfig({ MALCOM_LLM_BASE_URL: "http://localhost:11434" })).MALCOM_LLM_BASE_URL).toBe("http://localhost:11434");
  });

  it("defaults to local Ollama", async () => {
    const { MALCOM_LLM_BASE_URL } = await loadConfig();
    expect(MALCOM_LLM_BASE_URL).toBe("http://127.0.0.1:11434");
  });
});

describe("resolveNumPredict", () => {
  it("scales brief down and deep up within the configured budget", async () => {
    const { resolveNumPredict } = await loadConfig({
      MALCOM_NUM_PREDICT: "2048",
      MALCOM_MAX_NUM_PREDICT: "4096",
    });

    expect(resolveNumPredict("brief")).toBe(768);
    expect(resolveNumPredict("standard")).toBe(2048);
    expect(resolveNumPredict("deep")).toBe(3072);
  });

  it("never returns fewer tokens for deep than for standard", async () => {
    const { resolveNumPredict } = await loadConfig({
      MALCOM_NUM_PREDICT: "300",
      MALCOM_MAX_NUM_PREDICT: "4096",
    });

    expect(resolveNumPredict("brief")).toBe(300);
    expect(resolveNumPredict("standard")).toBe(300);
    expect(resolveNumPredict("deep")).toBe(3072);
  });

  it("clamps everything to the configured maximum", async () => {
    const { resolveNumPredict } = await loadConfig({
      MALCOM_NUM_PREDICT: "5000",
      MALCOM_MAX_NUM_PREDICT: "4096",
    });

    expect(resolveNumPredict("brief")).toBe(768);
    expect(resolveNumPredict("standard")).toBe(4096);
    expect(resolveNumPredict("deep")).toBe(4096);
  });

  it("respects a maximum below the brief floor", async () => {
    const { resolveNumPredict } = await loadConfig({
      MALCOM_NUM_PREDICT: "512",
      MALCOM_MAX_NUM_PREDICT: "512",
    });

    expect(resolveNumPredict("brief")).toBe(512);
    expect(resolveNumPredict("standard")).toBe(512);
    expect(resolveNumPredict("deep")).toBe(512);
  });
});

describe("getResponseModeInstruction", () => {
  it("gives each mode a distinct instruction", () => {
    const brief = getResponseModeInstruction("brief");
    const standard = getResponseModeInstruction("standard");
    const deep = getResponseModeInstruction("deep");

    expect(new Set([brief, standard, deep]).size).toBe(3);
    expect(brief).toMatch(/concise/i);
    expect(standard).toMatch(/balanced/i);
    expect(deep).toMatch(/thorough/i);
  });
});
