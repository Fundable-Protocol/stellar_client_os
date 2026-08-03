/**
 * Redis client singleton — issue #534
 *
 * Provides a shared ioredis client for rate limiting.
 * Returns null when Redis is unavailable so the app degrades
 * gracefully (allow-all) rather than hard-failing requests.
 *
 * Environment variables:
 * | Variable               | Default                  | Description                  |
 * |------------------------|--------------------------|------------------------------|
 * | REDIS_URL              | redis://localhost:6379   | Full Redis connection string  |
 * | REDIS_CONNECT_TIMEOUT  | 2000                     | Connect timeout (ms)         |
 * | REDIS_COMMAND_TIMEOUT  | 500                      | Per-command timeout (ms)     |
 */

import Redis from "ioredis";

export type RedisClient = Redis;

let _client: Redis | null = null;
let _attempted = false;

export function getRedisClient(): Redis | null {
  if (_attempted) return _client;
  _attempted = true;

  const url =
    process.env.REDIS_URL ??
    (process.env.NODE_ENV === "production" ? null : "redis://localhost:6379");

  if (!url) {
    console.warn(
      "[redis] REDIS_URL not configured — rate limiting disabled (allow-all mode)"
    );
    return null;
  }

  try {
    _client = new Redis(url, {
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT ?? 2_000),
      commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT ?? 500),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    _client.on("error", (err: Error) => {
      if (process.env.NODE_ENV !== "test") {
        console.error("[redis] connection error:", err.message);
      }
    });

    return _client;
  } catch (err) {
    console.error("[redis] failed to create client:", (err as Error).message);
    return null;
  }
}

/** Disconnect and reset the singleton — used in tests. */
export async function closeRedisClient(): Promise<void> {
  if (_client) {
    await _client.quit().catch(() => {});
    _client = null;
  }
  _attempted = false;
}
