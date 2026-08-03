import { z } from "zod";

/**
 * Server-only S3 configuration for the presigned-upload endpoint.
 *
 * These values are read from the server environment at request time (never
 * exposed to the client bundle) and validated with zod so misconfiguration
 * fails loudly instead of producing broken URLs at runtime.
 */
export const s3ConfigSchema = z.object({
  /** AWS region hosting the evidence bucket, e.g. "us-east-1". */
  AWS_REGION: z.string().min(1, "AWS_REGION is required"),
  /** S3 bucket that stores milestone proof photos (private by default). */
  AWS_S3_BUCKET: z.string().min(1, "AWS_S3_BUCKET is required"),
  /** IAM access key with `s3:PutObject` on the evidence bucket. */
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID is required"),
  /** IAM secret access key. */
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY is required"),
  /** Optional STS session token for temporary credentials. */
  AWS_SESSION_TOKEN: z.string().optional(),
  /**
   * URL presign lifetime in seconds. Bounded to 60..900 so the window is
   * short-lived but large enough for a multi-megabyte photo upload.
   */
  S3_PRESIGN_EXPIRES_SECONDS: z.coerce
    .number()
    .int("must be an integer")
    .min(60, "presign lifetime must be at least 60s")
    .max(900, "presign lifetime must be at most 900s")
    .default(300),
});

export type S3Config = z.infer<typeof s3ConfigSchema>;

/**
 * Validate the server S3 environment and return a typed config object.
 *
 * @returns typed S3 configuration
 * @throws {Error} when any required S3 variable is missing or invalid
 */
export function loadS3Config(env: NodeJS.ProcessEnv = process.env): S3Config {
  const parsed = s3ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`S3 configuration is invalid:\n${issues}`);
  }
  return parsed.data;
}
