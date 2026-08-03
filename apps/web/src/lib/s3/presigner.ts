import { createHash, createHmac, randomUUID } from "node:crypto";
import type { S3Config } from "./config";

/**
 * AWS Signature V4 pre-signed URL generator for private S3 uploads.
 *
 * This module produces short-lived PUT URLs for the milestone-evidence bucket
 * so clients can upload photos directly to S3 without exposing bucket
 * credentials. Signing is implemented locally (AWS SigV4) so the code is
 * fully unit-testable offline and does not pull the full AWS SDK into the
 * server bundle.
 */

/** Allowed content types for milestone proof photos. */
export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** Max object key length (S3 enforces 1024; we keep a tighter bound). */
export const MAX_KEY_LENGTH = 512;

export interface PresignUploadRequest {
  /**
   * Object key (path) inside the evidence bucket. Should be namespaced,
   * e.g. `evidence/<campaignId>/<milestoneId>/<uuid>.<ext>`.
   */
  key: string;
  /** MIME type of the file to be uploaded. Must be in {@link ALLOWED_CONTENT_TYPES}. */
  contentType: AllowedContentType;
  /** Requested URL lifetime in seconds (clamped to the configured max). */
  expiresInSeconds?: number;
}

export interface PresignUploadResult {
  /** HTTPS PUT URL the client should upload the photo to. */
  url: string;
  /** Object key the file was (or will be) written to. */
  key: string;
  /** Content type the upload must use so the object is served correctly. */
  contentType: AllowedContentType;
  /** Absolute expiry time (epoch seconds). */
  expiresAt: number;
  /** Request ID the caller can correlate with a backend record. */
  requestId: string;
}

const HOST_HEADER = "host";
const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
const TERMINATOR = "aws4_request";

/**
 * Percent-encode a string per RFC 3986 with the S3-specific relaxed rules:
 * unreserved characters are left as-is, everything else is upper-hex encoded.
 */
export function awsUriEncode(value: string, encodeSlash = false): string {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return encodeSlash ? encoded : encoded.replace(/%2F/gi, "/");
}

/** Build the canonical (presign-safe) resource path for an S3 object. *//** Derive the per-service signing key. */
function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = createHmac("sha256", `AWS4${secret}`).update(date).digest();
  const regionKey = createHmac("sha256", dateKey).update(region).digest();
  const serviceKey = createHmac("sha256", regionKey).update(SERVICE).digest();
  return createHmac("sha256", serviceKey).update(TERMINATOR).digest();
}

function hmacHex(key: Buffer | string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Generate a short-lived pre-signed PUT URL for a private S3 object.
 *
 * @param config validated S3 server configuration
 * @param request object key, content type and requested lifetime
 * @param now unix timestamp in seconds (injectable for deterministic tests)
 */
export function createPresignedPutUrl(
  config: S3Config,
  request: PresignUploadRequest,
  now: number = Math.floor(Date.now() / 1000),
): PresignUploadResult {
  const bucket = config.AWS_S3_BUCKET;
  const region = config.AWS_REGION;
  const key = request.key;
  const contentType = request.contentType;

  const expiresIn = Math.min(
    Math.max(60, request.expiresInSeconds ?? config.S3_PRESIGN_EXPIRES_SECONDS),
    config.S3_PRESIGN_EXPIRES_SECONDS,
  );

  const amzDate = new Date(now * 1000).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${SERVICE}/${TERMINATOR}`;

  const canonicalUri = `/${awsUriEncode(key, true)}`;
  const canonicalQuerystring = [
    "X-Amz-Algorithm=AWS4-HMAC-SHA256",
    `X-Amz-Credential=${awsUriEncode(`${config.AWS_ACCESS_KEY_ID}/${credentialScope}`)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    "X-Amz-SignedHeaders=host",
    ...(config.AWS_SESSION_TOKEN
      ? [`X-Amz-Security-Token=${awsUriEncode(config.AWS_SESSION_TOKEN)}`]
      : []),
  ].sort().join("&");

  const canonicalHeaders = `${HOST_HEADER}:${bucket}.s3.${region}.amazonaws.com\n`;
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hmacHex(signingKey(config.AWS_SECRET_ACCESS_KEY, dateStamp, region), stringToSign);

  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}?${canonicalQuerystring}&X-Amz-Signature=${signature}`;

  return {
    url,
    key,
    contentType,
    expiresAt: now + expiresIn,
    requestId: randomUUID(),
  };
}
