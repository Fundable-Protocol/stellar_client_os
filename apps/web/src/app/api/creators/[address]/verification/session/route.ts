import { z } from "zod";
import {
  NO_STORE,
  errorResponse,
  readJson,
  verificationService,
  type CreatorRouteContext,
} from "@/lib/creator-verification-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("challenge") }).strict(),
  z.object({
    action: z.literal("verify"),
    nonce: z.string().uuid(),
    signature: z.string().min(1).max(512),
  }).strict(),
]);

/**
 * POST /api/creators/:address/verification/session
 *
 * Step 0 of the verification flow — prove wallet ownership.
 *   { "action": "challenge" }                         → { nonce, message, expiresAt }
 *   { "action": "verify", "nonce", "signature" }      → { token, expiresAt }
 * The token is then sent as `Authorization: Bearer <token>` on mutating calls.
 */
export async function POST(request: Request, context: CreatorRouteContext) {
  try {
    const address = decodeURIComponent((await context.params).address);
    const body = await readJson(request);
    if (body instanceof Response) return body;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400, headers: NO_STORE });
    }
    const service = verificationService();
    if (parsed.data.action === "challenge") {
      return Response.json(service.issueSessionChallenge(address), { headers: NO_STORE });
    }
    const session = service.verifySessionChallenge({
      address,
      nonce: parsed.data.nonce,
      signature: parsed.data.signature,
    });
    if (!session) {
      return Response.json({ error: "Signature verification failed or challenge expired" }, { status: 401, headers: NO_STORE });
    }
    return Response.json(session, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
