import { z } from "zod";
import { authorizeAdminRequest } from "@/lib/admin-auth";
import {
  NO_STORE,
  errorResponse,
  readJson,
  requireCreatorSession,
  verificationService,
  type CreatorRouteContext,
} from "@/lib/creator-verification-http";
import { GOVERNMENT_ID_DOCUMENT_TYPES } from "@/lib/creator-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const submitSchema = z.object({
  documentType: z.enum(GOVERNMENT_ID_DOCUMENT_TYPES),
  issuingCountry: z.string().min(2).max(2),
  documentReference: z.string().min(4).max(256),
}).strict();

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reviewer: z.string().min(1).max(128),
  reason: z.string().max(500).optional(),
}).strict();

/**
 * POST /api/creators/:address/verification/government-id
 *
 * Creator submits a government ID for review. Upload the document first via
 * /api/presign-upload and pass the returned storage key as `documentReference`.
 * Requires a creator session.
 */
export async function POST(request: Request, context: CreatorRouteContext) {
  const auth = await requireCreatorSession(request, context);
  if (auth instanceof Response) return auth;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: `Invalid request body. documentType must be one of ${GOVERNMENT_ID_DOCUMENT_TYPES.join(", ")}` },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const verification = await verificationService().submitGovernmentId(auth.creator, parsed.data);
    return Response.json({ verification }, { status: 202, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/creators/:address/verification/government-id
 *
 * Admin-only review: `{ "decision": "approve" | "reject", "reviewer": "...", "reason"?: "..." }`.
 * Requires `Authorization: Bearer <ADMIN_API_KEY>`.
 */
export async function PATCH(request: Request, context: CreatorRouteContext) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400, headers: NO_STORE });
  }
  try {
    const address = decodeURIComponent((await context.params).address);
    const verification = await verificationService().reviewGovernmentId(address, parsed.data);
    return Response.json({ verification }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
