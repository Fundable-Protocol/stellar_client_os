import { NextResponse } from "next/server";
import { z } from "zod";
import {
  NGO_SERVICE_TYPES,
  PARTNERSHIP_ERROR_STATUS,
  PartnershipError,
  listNGOs,
  registerNGO,
  type NGOVerificationStatus,
} from "@/services/campaign-partnership.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

const VERIFICATION_STATUSES: readonly string[] = ["PENDING", "VERIFIED", "REJECTED"];

const RegisterNGOSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  services: z.array(z.enum(NGO_SERVICE_TYPES)).min(1),
  country: z.string().trim().min(1).max(80).optional(),
  website: z.string().url().max(500).optional(),
  contactEmail: z.string().email().max(254).optional(),
  walletAddress: z.string().trim().min(1).max(56).optional(),
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
 * GET /api/ngos — NGO marketplace directory.
 *
 * Query params:
 *  - q        : case-insensitive search over name, description and country
 *  - service  : LAND_ACCESS | PLANTING_LABOR | VERIFICATION
 *  - country  : exact ISO country / label match (case-insensitive)
 *  - status   : PENDING | VERIFIED | REJECTED — omit for verified NGOs only,
 *               pass `ALL` to include every verification status
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const service = url.searchParams.get("service") ?? undefined;
    const country = url.searchParams.get("country") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    if (service && !(NGO_SERVICE_TYPES as readonly string[]).includes(service)) {
      return NextResponse.json(
        { error: "service must be one of LAND_ACCESS, PLANTING_LABOR, VERIFICATION" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    if (status && status !== "ALL" && !VERIFICATION_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "status must be one of PENDING, VERIFIED, REJECTED or ALL" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const ngos = await listNGOs({
      q,
      service: service as (typeof NGO_SERVICE_TYPES)[number] | undefined,
      country,
      status: status === "ALL" ? "ALL" : (status as NGOVerificationStatus | undefined),
    });

    return NextResponse.json({ data: ngos }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/ngos — register a new NGO.
 *
 * The profile is created in `PENDING` status and only becomes partnerable after
 * an operator verifies it via `PATCH /api/ngos/[id]`.
 */
export async function POST(request: Request) {
  try {
    const parsed = RegisterNGOSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid NGO registration", issues: parsed.error.flatten().fieldErrors },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const ngo = await registerNGO(parsed.data);
    return NextResponse.json({ data: ngo }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}