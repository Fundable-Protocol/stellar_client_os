import {
  NO_STORE,
  errorResponse,
  requireCreatorSession,
  verificationService,
  type CreatorRouteContext,
} from "@/lib/creator-verification-http";
import { creatorSessionToken } from "@/services/creator-identity-verification.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/creators/:address/verification
 *
 * Public creator identity verification status (summary + verified steps). When
 * the request carries the creator's own session token, the owner view is
 * returned instead (masked destinations, pending expiries, rejection reasons).
 */
export async function GET(request: Request, context: CreatorRouteContext) {
  try {
    const address = decodeURIComponent((await context.params).address);
    const service = verificationService();
    const publicView = service.getPublicStatus(address);
    const sessionCreator = service.resolveSession(creatorSessionToken(request));
    if (sessionCreator && sessionCreator === publicView.creator) {
      return Response.json({ verification: service.getOwnerStatus(publicView.creator), owner: true }, { headers: NO_STORE });
    }
    return Response.json(
      { verification: publicView, owner: false },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/creators/:address/verification
 *
 * Verification is optional: the creator may withdraw at any time. All stored
 * verification data is erased and the badge is removed from their campaigns.
 */
export async function DELETE(request: Request, context: CreatorRouteContext) {
  const auth = await requireCreatorSession(request, context);
  if (auth instanceof Response) return auth;
  try {
    const verification = await verificationService().withdraw(auth.creator);
    return Response.json({ verification, withdrawn: true }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
