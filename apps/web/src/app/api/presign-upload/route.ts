import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ALLOWED_CONTENT_TYPES,
  createPresignedPutUrl,
  loadS3Config,
  buildEvidenceKey,
  buildCampaignUpdateKey,
  type AllowedContentType,
} from "@/lib/s3";

/**
 * POST /api/presign-upload
 *
 * Generates a short-lived pre-signed AWS S3 PUT URL for milestone proof
 * photo, insurance claim evidence or a campaign update image. The client
 * uploads the file directly to S3; the URL expires within the configured
 * window (default 5 minutes) so credentials never reach the browser and the
 * bucket stays private.
 *
 * Request body:
 *   { "campaignId": "42", "milestoneId": "1", "contentType": "image/jpeg", "purpose": "milestone" }
 *   { "campaignId": "42", "milestoneId": "1", "contentType": "image/jpeg", "purpose": "insurance-claim" }
 *   { "campaignId": "42", "updateId": "upd_1", "contentType": "image/jpeg", "purpose": "campaign-update" }
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

  const schema = z
    .object({
      campaignId: z
        .string()
        .min(1, "campaignId is required")
        .max(128, "campaignId is too long"),
      milestoneId: z
        .string()
        .min(1, "milestoneId is required")
        .max(128, "milestoneId is too long")
        .optional(),
      updateId: z
        .string()
        .min(1, "updateId is required")
        .max(128, "updateId is too long")
        .optional(),
      contentType: z.enum(ALLOWED_CONTENT_TYPES),
      purpose: z.enum(["milestone", "insurance-claim", "campaign-update"]).default("milestone"),
    })
    .superRefine((value, ctx) => {
      if (value.purpose === "campaign-update") {
        if (!value.updateId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["updateId"],
            message: "updateId is required for campaign-update uploads",
          });
        }
        return;
      }
      if (!value.milestoneId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["milestoneId"],
          message: "milestoneId is required for evidence uploads",
        });
      }
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
    const key =
      parsed.data.purpose === "campaign-update"
        ? buildCampaignUpdateKey(
            parsed.data.campaignId,
            parsed.data.updateId as string,
            parsed.data.contentType as AllowedContentType,
          )
        : buildEvidenceKey(
            parsed.data.campaignId,
            parsed.data.purpose === "insurance-claim"
              ? "insurance-claim"
              : (parsed.data.milestoneId as string),
            parsed.data.contentType as AllowedContentType,
          );
    const result = createPresignedPutUrl(config, {
      key,
      contentType: parsed.data.contentType as AllowedContentType,
    });

    const publicBase =
      config.S3_PUBLIC_BASE_URL ??
      `https://${config.AWS_S3_BUCKET}.s3.${config.AWS_REGION}.amazonaws.com`;

    return NextResponse.json({
      url: result.url,
      key: result.key,
      publicUrl: `${publicBase.replace(/\/+$/, "")}/${result.key}`,
      contentType: result.contentType,
      expiresAt: result.expiresAt,
      requestId: result.requestId,
      purpose: parsed.data.purpose,
    });
  } catch (error) {
    console.error("[presign-upload] presigning error", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 },
    );
  }
}
