import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit } from "./rate-limit";

// The limiter keeps its windows in a module-level Map, so every test uses its
// own namespace and client identity to stay independent of the others.
let namespaceCounter = 0;
function freshNamespace() {
  namespaceCounter += 1;
  return `test-${namespaceCounter}`;
}

function requestFrom(headers: Record<string, string> = {}) {
  return new Request("https://malcom.example/api/feedback", { headers });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows exactly `limit` requests and denies the one after", () => {
    const options = { namespace: freshNamespace(), limit: 3, windowMs: 60_000 };
    const request = requestFrom({ "x-forwarded-for": "203.0.113.7" });

    expect(checkRateLimit(request, options).allowed).toBe(true);
    expect(checkRateLimit(request, options).allowed).toBe(true);
    expect(checkRateLimit(request, options).allowed).toBe(true);

    const denied = checkRateLimit(request, options);
    expect(denied.allowed).toBe(false);
  });

  it("reports a bounded retryAfterSeconds when denying", () => {
    const options = { namespace: freshNamespace(), limit: 1, windowMs: 30_000 };
    const request = requestFrom({ "x-forwarded-for": "203.0.113.8" });

    expect(checkRateLimit(request, options).allowed).toBe(true);

    const denied = checkRateLimit(request, options);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it("resets once the window has elapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const options = { namespace: freshNamespace(), limit: 1, windowMs: 1_000 };
    const request = requestFrom({ "x-forwarded-for": "203.0.113.9" });

    expect(checkRateLimit(request, options).allowed).toBe(true);
    expect(checkRateLimit(request, options).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:00:01.001Z"));

    expect(checkRateLimit(request, options).allowed).toBe(true);
  });

  it("does not share counters across namespaces", () => {
    const request = requestFrom({ "x-forwarded-for": "203.0.113.10" });
    const first = { namespace: freshNamespace(), limit: 1, windowMs: 60_000 };
    const second = { namespace: freshNamespace(), limit: 1, windowMs: 60_000 };

    expect(checkRateLimit(request, first).allowed).toBe(true);
    expect(checkRateLimit(request, first).allowed).toBe(false);

    // Same client, different endpoint budget: still allowed.
    expect(checkRateLimit(request, second).allowed).toBe(true);
  });

  it("does not share counters across clients", () => {
    const options = { namespace: freshNamespace(), limit: 1, windowMs: 60_000 };

    expect(checkRateLimit(requestFrom({ "x-forwarded-for": "198.51.100.1" }), options).allowed).toBe(true);
    expect(checkRateLimit(requestFrom({ "x-forwarded-for": "198.51.100.2" }), options).allowed).toBe(true);
  });

  it("keys on the first hop of x-forwarded-for", () => {
    const options = { namespace: freshNamespace(), limit: 1, windowMs: 60_000 };

    const first = requestFrom({ "x-forwarded-for": "198.51.100.3, 10.0.0.1, 10.0.0.2" });
    expect(checkRateLimit(first, options).allowed).toBe(true);

    // Same originating client, different proxy chain: must still be denied.
    const again = requestFrom({ "x-forwarded-for": "198.51.100.3, 172.16.0.9" });
    expect(checkRateLimit(again, options).allowed).toBe(false);

    // A different originating client gets its own budget.
    expect(checkRateLimit(requestFrom({ "x-forwarded-for": "198.51.100.4" }), options).allowed).toBe(true);
  });

  it("falls back to x-real-ip, then to a shared unknown bucket", () => {
    const options = { namespace: freshNamespace(), limit: 1, windowMs: 60_000 };

    expect(checkRateLimit(requestFrom({ "x-real-ip": "198.51.100.5" }), options).allowed).toBe(true);
    expect(checkRateLimit(requestFrom({ "x-real-ip": "198.51.100.5" }), options).allowed).toBe(false);

    const unknownOptions = { namespace: freshNamespace(), limit: 1, windowMs: 60_000 };
    // Requests with no identifying header share one bucket, so an unheadered
    // client cannot bypass the limit by simply omitting headers.
    expect(checkRateLimit(requestFrom(), unknownOptions).allowed).toBe(true);
    expect(checkRateLimit(requestFrom(), unknownOptions).allowed).toBe(false);
  });
});
