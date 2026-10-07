import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminRequest } from "@/lib/admin-auth";
import {
  PARTNERSHIP_ERROR_STATUS,
  PartnershipError,
  getNGOById,
  reviewNGO,
} from "@/services/campaign-partnership.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

const ReviewNGOSchema = z.object({
  verdict: z.enum(["VERIFIED", "REJECTED"]),
  reviewer: z.string().trim().min(1).max(120).optional(),
});

function errorResponse(error: unknown): Response {
  if (error instanceof PartnershipError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: PARTNERSHIP_ERROR_STATUS[error.code], headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json(
    { error: "NGO request failed" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

/**
 * GET /api/ngos/:id — public NGO profile.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ngo = await getNGOById(id);
    if (!ngo) {
      return NextResponse.json(
        { error: "NGO not found", code: "NGO_NOT_FOUND" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ data: ngo }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/ngos/:id — verify or reject an NGO application (admin only).
 *
 * Requires `Authorization: Bearer <ADMIN_API_KEY>`. Moves an NGO between
 * PENDING/REJECTED and VERIFIED; only verified NGOs can be partnered with.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    const parsed = ReviewNGOSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid review payload", issues: parsed.error.flatten().fieldErrors },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const ngo = await reviewNGO(id, parsed.data.verdict, parsed.data.reviewer ?? "admin");
    return NextResponse.json({ data: ngo }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}