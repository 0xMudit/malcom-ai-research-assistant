import "server-only";

import { createClient } from "redis";

const defaultTtlSeconds = 60;
const keyPrefix = (process.env.REDIS_CACHE_PREFIX || "malcom").trim();

type CacheRedisClient = {
  connect(): Promise<unknown>;
  del(key: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  on(event: "error", listener: (error: Error) => void): unknown;
  set(key: string, value: string, options?: unknown): Promise<unknown>;
};

let clientPromise: Promise<CacheRedisClient> | null = null;
let redisUnavailable = false;
let reportedError = false;

function redisUrl() {
  return (process.env.REDIS_URL || process.env.KV_URL || "").trim();
}

function cacheKey(key: string) {
  return `${keyPrefix}:${key}`;
}

function reportRedisError(error: unknown) {
  if (reportedError) {
    return;
  }

  reportedError = true;
  console.error(
    `Redis cache disabled: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

async function getClient() {
  const url = redisUrl();

  if (!url || redisUnavailable) {
    return null;
  }

  if (!clientPromise) {
    const client = createClient({ url }) as unknown as CacheRedisClient;

    client.on("error", (error) => {
      redisUnavailable = true;
      clientPromise = null;
      reportRedisError(error);
    });

    clientPromise = (async () => {
      await client.connect();
      return client;
    })();
  }

  try {
    return await clientPromise;
  } catch (error) {
    redisUnavailable = true;
    clientPromise = null;
    reportRedisError(error);
    return null;
  }
}

export async function getCacheJson<T>(key: string): Promise<T | null> {
  const client = await getClient();

  if (!client) {
    return null;
  }

  try {
    const value = await client.get(cacheKey(key));

    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  } catch (error) {
    reportRedisError(error);
    return null;
  }
}

export async function setCacheJson(
  key: string,
  value: unknown,
  ttlSeconds = defaultTtlSeconds,
) {
  const client = await getClient();

  if (!client) {
    return;
  }

  try {
    await client.set(cacheKey(key), JSON.stringify(value), {
      expiration: {
        type: "EX",
        value: Math.max(1, Math.round(ttlSeconds)),
      },
    });
  } catch (error) {
    reportRedisError(error);
  }
}

export async function deleteCache(key: string) {
  const client = await getClient();

  if (!client) {
    return;
  }

  try {
    await client.del(cacheKey(key));
  } catch (error) {
    reportRedisError(error);
  }
}
