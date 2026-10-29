import { authorizeAdminRequest } from "@/lib/admin-auth";
import { NO_STORE, verificationService } from "@/lib/creator-verification-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/creator-verifications
 *
 * Admin review queue: government IDs awaiting review, oldest first.
 * Approve/reject via PATCH /api/creators/:address/verification/government-id.
 */
export async function GET(request: Request) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;
  const pending = verificationService().listPendingGovernmentIdReviews();
  return Response.json({ pending, count: pending.length }, { headers: NO_STORE });
}
