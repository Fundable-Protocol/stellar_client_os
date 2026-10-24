import { z } from "zod";
import {
  ALLOWED_CONTENT_TYPES,
  buildCreatorIdentityDocumentKey,
  createPresignedPutUrl,
  loadS3Config,
  type AllowedContentType,
} from "@/lib/s3";
import { NO_STORE, readJson, requireCreatorSession, type CreatorRouteContext } from "@/lib/creator-verification-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({ contentType: z.enum(ALLOWED_CONTENT_TYPES) }).strict();

/**
 * POST /api/creators/:address/verification/government-id/upload
 *
 * Returns a short-lived pre-signed PUT URL for the creator's government ID
 * document. Documents are stored under `creator-identity/<address>/` — a
 * private prefix separate from public campaign evidence. Pass the returned
 * `key` as `documentReference` when submitting the government ID step.
 * Requires a creator session.
 */
export async function POST(request: Request, context: CreatorRouteContext) {
  const auth = await requireCreatorSession(request, context);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: `contentType must be one of ${ALLOWED_CONTENT_TYPES.join(", ")}` },
      { status: 400, headers: NO_STORE },
    );
  }

  let config;
  try {
    config = loadS3Config();
  } catch (error) {
    console.error("[creator-verification] S3 configuration error", error);
    return Response.json({ error: "Document uploads are not configured" }, { status: 503, headers: NO_STORE });
  }

  try {
    const contentType = parsed.data.contentType as AllowedContentType;
    const result = createPresignedPutUrl(config, {
      key: buildCreatorIdentityDocumentKey(auth.creator, contentType),
      contentType,
    });
    return Response.json(
      { url: result.url, key: result.key, contentType: result.contentType, expiresAt: result.expiresAt },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[creator-verification] presigning error", error);
    return Response.json({ error: "Failed to generate upload URL" }, { status: 500, headers: NO_STORE });
  }
}
