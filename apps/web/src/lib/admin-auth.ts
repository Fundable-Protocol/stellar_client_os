import { timingSafeEqual } from "crypto";
import { StrKey } from "@stellar/stellar-sdk";

/**
 * Returns true when the request carries `Authorization: Bearer <token>` matching
 * the secret stored in `process.env[envVar]`. An unset secret denies everyone,
 * so privileged endpoints stay closed until an operator configures them.
 */
export function hasAdminToken(request: Request, envVar: string): boolean {
  const expected = process.env[envVar];
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;

  const provided = Buffer.from(match[1]);
  const secret = Buffer.from(expected);
  return provided.length === secret.length && timingSafeEqual(provided, secret);
}

export function isStellarAccount(value: string): boolean {
  return StrKey.isValidEd25519PublicKey(value);
}
