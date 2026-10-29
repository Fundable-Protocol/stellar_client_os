import {
  CreatorVerificationError,
  creatorIdentityVerificationService,
  creatorSessionToken,
  normalizeCreatorAddress,
  type CreatorIdentityVerificationService,
} from "@/services/creator-identity-verification.service";

export const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export type CreatorRouteContext = { params: Promise<{ address: string }> };

/** Indirection so tests can swap the service instance. */
export function verificationService(): CreatorIdentityVerificationService {
  return creatorIdentityVerificationService;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Request body must be a JSON object" }, { status: 400, headers: NO_STORE });
    }
    return body as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Malformed JSON request body" }, { status: 400, headers: NO_STORE });
  }
}

/**
 * Resolves the creator address from the route and checks that the request
 * carries a wallet-signed creator session for that same address.
 */
export async function requireCreatorSession(
  request: Request,
  context: CreatorRouteContext,
): Promise<{ creator: string } | Response> {
  let creator: string;
  try {
    creator = normalizeCreatorAddress(decodeURIComponent((await context.params).address));
  } catch (error) {
    return errorResponse(error);
  }
  const sessionCreator = verificationService().resolveSession(creatorSessionToken(request));
  if (!sessionCreator) {
    return Response.json(
      { error: "Creator session required. Sign a verification challenge with your wallet first." },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="creator-verification"' } },
    );
  }
  if (sessionCreator !== creator) {
    return Response.json({ error: "This session belongs to a different creator" }, { status: 403, headers: NO_STORE });
  }
  return { creator };
}

export function errorResponse(error: unknown): Response {
  if (error instanceof CreatorVerificationError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
  }
  console.error("[CreatorVerification] Unexpected error:", error);
  return Response.json({ error: "Unable to process verification request" }, { status: 500, headers: NO_STORE });
}
