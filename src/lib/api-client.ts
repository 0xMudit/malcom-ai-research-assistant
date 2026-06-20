export async function readApiJson<T extends object>(
  response: Response,
  fallbackError = "The server returned an invalid response.",
): Promise<T & { error?: string }> {
  const text = await response.text();

  if (!text.trim()) {
    return {} as T & { error?: string };
  }

  try {
    const parsed = JSON.parse(text);

    if (parsed && typeof parsed === "object") {
      return parsed as T & { error?: string };
    }
  } catch {
    // Proxy and platform errors often return HTML instead of JSON.
  }

  if (response.status === 504) {
    return {
      error:
        "Malcom timed out before returning a valid response. Try again with a shorter prompt or fewer attached documents.",
    } as T & { error?: string };
  }

  if (response.status === 502 || response.status === 503) {
    return {
      error: "Malcom is temporarily unavailable. Please try again.",
    } as T & { error?: string };
  }

  return { error: fallbackError } as T & { error?: string };
}
