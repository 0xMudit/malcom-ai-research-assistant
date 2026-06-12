export type FeedbackInput = {
  name: string;
  email: string;
  rating: number;
  suggestion: string;
};

export type AccessRequestInput = {
  name: string;
  email: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();

  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.replace(/\u0000/g, "").trim();

  if (!text || text.length > maxLength) {
    return null;
  }

  return text;
}

export function parseFeedbackInput(value: unknown): FeedbackInput | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["email", "name", "rating", "suggestion"])
  ) {
    return null;
  }

  const name = cleanText(value.name, 80);
  const email = cleanText(value.email, 180);
  const suggestion = cleanText(value.suggestion, 2_000);
  const rating = Number(value.rating);

  if (
    !name ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    !suggestion
  ) {
    return null;
  }

  return { name, email, rating, suggestion };
}

export function parseAccessRequestInput(
  value: unknown,
): AccessRequestInput | null {
  if (!isRecord(value) || !hasExactKeys(value, ["email", "name"])) {
    return null;
  }

  const name = cleanText(value.name, 80);
  const email = cleanText(value.email, 180);

  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return { name, email };
}
