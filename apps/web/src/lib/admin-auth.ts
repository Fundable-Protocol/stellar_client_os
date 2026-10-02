import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Admin API authorization.
 *
 * Admin endpoints require `Authorization: Bearer <ADMIN_API_KEY>`. The check
 * fails closed: when `ADMIN_API_KEY` is not configured the endpoint answers 503
 * rather than serving admin data to anyone. The key is compared as SHA-256
 * digests with `timingSafeEqual`, so neither its content nor its length leaks
 * through response timing.
 *
 * The key is read from the header only, never from the query string, so it
 * cannot end up in access logs or browser history.
 */
export const ADMIN_API_KEY_ENV = "ADMIN_API_KEY";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Returns `null` when the request carries the admin key, or the response to
 * send instead: 503 when no key is configured, 401 when the key is missing or
 * wrong.
 */
export function authorizeAdminRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): NextResponse | null {
  const expected = env[ADMIN_API_KEY_ENV]?.trim();
  if (!expected) {
    return NextResponse.json({ error: "Admin API is not configured" }, { status: 503 });
  }

  const presented = bearerToken(request);
  if (presented === null || !timingSafeEqual(digest(presented), digest(expected))) {
    return NextResponse.json(
      { error: "Admin authorization required" },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="admin"' } },
    );
  }
  return null;
}
