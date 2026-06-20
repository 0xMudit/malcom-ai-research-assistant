import "server-only";

type RateLimitOptions = {
  namespace: string;
  limit: number;
  windowMs: number;
};

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

const rateLimitWindows = new Map<string, RateLimitWindow>();

function clientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedIp || realIp || "unknown";
}

export function checkRateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  const key = `${options.namespace}:${clientKey(request)}`;
  const current = rateLimitWindows.get(key);

  for (const [windowKey, window] of rateLimitWindows) {
    if (window.resetAt <= now) {
      rateLimitWindows.delete(windowKey);
    }
  }

  if (!current || current.resetAt <= now) {
    rateLimitWindows.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });

    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  rateLimitWindows.set(key, current);

  return { allowed: true, retryAfterSeconds: 0 };
}
