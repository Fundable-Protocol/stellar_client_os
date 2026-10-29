import { z } from "zod";
import {
  NO_STORE,
  errorResponse,
  readJson,
  requireCreatorSession,
  verificationService,
  type CreatorRouteContext,
} from "@/lib/creator-verification-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), phone: z.string().min(1).max(32) }).strict(),
  z.object({ action: z.literal("confirm"), code: z.string().min(1).max(12) }).strict(),
]);

/**
 * POST /api/creators/:address/verification/phone
 *
 *   { "action": "start", "phone": "..." }  → sends a 6-digit code to the phone number (E.164)
 *   { "action": "confirm", "code": "123456" } → marks the step verified
 *
 * Requires a creator session (see ./session).
 */
export async function POST(request: Request, context: CreatorRouteContext) {
  const auth = await requireCreatorSession(request, context);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400, headers: NO_STORE });
  }
  try {
    const service = verificationService();
    if (parsed.data.action === "start") {
      const dispatch = await service.startPhoneVerification(auth.creator, parsed.data.phone);
      return Response.json({ dispatch, verification: service.getOwnerStatus(auth.creator) }, { status: 202, headers: NO_STORE });
    }
    const verification = await service.confirmPhoneVerification(auth.creator, parsed.data.code);
    return Response.json({ verification }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
