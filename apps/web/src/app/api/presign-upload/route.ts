import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ALLOWED_CONTENT_TYPES,
  createPresignedPutUrl,
  loadS3Config,
  buildEvidenceKey,
  type AllowedContentType,
} from "@/lib/s3";

/**
 * POST /api/presign-upload
 *
 * Generates a short-lived pre-signed AWS S3 PUT URL for a milestone proof
 * photo. The client uploads the photo directly to S3; the URL expires
 * within the configured window (default 5 minutes) so credentials never
 * reach the browser and the bucket stays private.
 *
 * Request body:
 *   { "campaignId": "42", "milestoneId": "1", "contentType": "image/jpeg" }
 *
 * Response 200:
 *   { "url": "...", "key": "...", "contentType": "...", "expiresAt": 1712... }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const schema = z.object({
    campaignId: z
      .string()
      .min(1, "campaignId is required")
      .max(128, "campaignId is too long"),
    milestoneId: z
      .string()
      .min(1, "milestoneId is required")
      .max(128, "milestoneId is too long"),
    contentType: z.enum(ALLOWED_CONTENT_TYPES),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let config;
  try {
    config = loadS3Config();
  } catch (error) {
    console.error("[presign-upload] S3 configuration error", error);
    return NextResponse.json(
      { error: "S3 uploads are not configured" },
      { status: 503 },
    );
  }

  try {
    const key = buildEvidenceKey(
      parsed.data.campaignId,
      parsed.data.milestoneId,
      parsed.data.contentType as AllowedContentType,
    );
    const result = createPresignedPutUrl(config, {
      key,
      contentType: parsed.data.contentType as AllowedContentType,
    });

    return NextResponse.json({
      url: result.url,
      key: result.key,
      contentType: result.contentType,
      expiresAt: result.expiresAt,
      requestId: result.requestId,
    });
  } catch (error) {
    console.error("[presign-upload] presigning error", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
}
