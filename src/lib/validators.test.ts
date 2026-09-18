import { describe, expect, it } from "vitest";

import { parseAccessRequestInput, parseFeedbackInput } from "./validators";

const validFeedback = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  rating: 5,
  suggestion: "Ship the retrieval citations.",
};

describe("parseFeedbackInput", () => {
  it("accepts a well-formed payload unchanged", () => {
    expect(parseFeedbackInput(validFeedback)).toEqual(validFeedback);
  });

  it("trims surrounding whitespace on text fields", () => {
    expect(
      parseFeedbackInput({
        ...validFeedback,
        name: "  Ada Lovelace  ",
        email: "  ada@example.com  ",
        suggestion: "  Ship the retrieval citations.  ",
      }),
    ).toEqual(validFeedback);
  });

  it("strips NUL bytes rather than passing them through", () => {
    const parsed = parseFeedbackInput({
      ...validFeedback,
      suggestion: "ship\u0000 it",
    });

    expect(parsed?.suggestion).not.toContain("\u0000");
    expect(parsed?.suggestion).toBe("ship it");
  });

  it("rejects extra keys instead of ignoring them", () => {
    expect(parseFeedbackInput({ ...validFeedback, role: "admin" })).toBeNull();
  });

  it("rejects a payload missing a required key", () => {
    for (const key of Object.keys(validFeedback)) {
      const partial: Record<string, unknown> = { ...validFeedback };
      delete partial[key];

      expect(parseFeedbackInput(partial), `missing ${key}`).toBeNull();
    }
  });

  it("rejects non-object bodies", () => {
    for (const value of [null, undefined, "feedback", 42, true, []]) {
      expect(parseFeedbackInput(value)).toBeNull();
    }
  });

  it("rejects non-string text fields", () => {
    for (const bad of [null, 42, { nested: true }, ["a"]]) {
      expect(parseFeedbackInput({ ...validFeedback, name: bad })).toBeNull();
      expect(parseFeedbackInput({ ...validFeedback, suggestion: bad })).toBeNull();
    }
  });

  it("rejects empty or whitespace-only text", () => {
    expect(parseFeedbackInput({ ...validFeedback, name: "   " })).toBeNull();
    expect(parseFeedbackInput({ ...validFeedback, suggestion: "\n\t" })).toBeNull();
  });

  it("enforces the per-field length caps", () => {
    expect(parseFeedbackInput({ ...validFeedback, name: "a".repeat(80) })).not.toBeNull();
    expect(parseFeedbackInput({ ...validFeedback, name: "a".repeat(81) })).toBeNull();

    expect(parseFeedbackInput({ ...validFeedback, email: `${"a".repeat(168)}@example.com` })).not.toBeNull();

    expect(parseFeedbackInput({ ...validFeedback, suggestion: "a".repeat(2_000) })).not.toBeNull();
    expect(parseFeedbackInput({ ...validFeedback, suggestion: "a".repeat(2_001) })).toBeNull();
  });

  it("rejects malformed email addresses", () => {
    for (const email of [
      "no-at-sign",
      "no@domain",
      "@example.com",
      "spaces in@example.com",
      "two@@example.com",
    ]) {
      expect(parseFeedbackInput({ ...validFeedback, email }), email).toBeNull();
    }
  });

  it("accepts only integer ratings from 1 to 5", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(parseFeedbackInput({ ...validFeedback, rating })?.rating).toBe(rating);
    }

    for (const rating of [0, 6, -1, 2.5, "abc", null, undefined, [], {}]) {
      expect(parseFeedbackInput({ ...validFeedback, rating }), String(rating)).toBeNull();
    }
  });

  it("coerces numeric-ish ratings, which is lenient by design here", () => {
    // Number() coercion means a numeric string and even `true` satisfy the
    // integer-range check. Pinned so the behaviour is visible and any future
    // tightening is a deliberate, tested change rather than a silent one.
    expect(parseFeedbackInput({ ...validFeedback, rating: "3" })?.rating).toBe(3);
    expect(parseFeedbackInput({ ...validFeedback, rating: true })?.rating).toBe(1);
  });
});

describe("parseAccessRequestInput", () => {
  it("accepts a well-formed payload", () => {
    expect(parseAccessRequestInput({ name: "Ada", email: "ada@example.com" })).toEqual({
      name: "Ada",
      email: "ada@example.com",
    });
  });

  it("trims text and ignores no extra keys", () => {
    expect(
      parseAccessRequestInput({ name: "  Ada  ", email: " ada@example.com ", note: "hi" }),
    ).toBeNull();
    expect(parseAccessRequestInput({ name: "  Ada  ", email: " ada@example.com " })).toEqual({
      name: "Ada",
      email: "ada@example.com",
    });
  });

  it("rejects malformed input", () => {
    for (const value of [
      null,
      undefined,
      "ada",
      [],
      { name: "Ada" },
      { email: "ada@example.com" },
      { name: "", email: "ada@example.com" },
      { name: "Ada", email: "nope" },
      { name: 42, email: "ada@example.com" },
    ]) {
      expect(parseAccessRequestInput(value)).toBeNull();
    }
  });
});
