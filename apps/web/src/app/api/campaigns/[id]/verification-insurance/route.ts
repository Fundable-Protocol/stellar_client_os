import { z } from "zod";
import { hasAdminToken, isStellarAccount } from "@/lib/admin-auth";
import { isAmountString } from "@/lib/decimal-amount";
import {
  VERIFICATION_STANDARDS,
  VerificationInsuranceError,
  getCampaignVerificationInsuranceService,
  type VerificationInsuranceErrorCode,
} from "@/services/campaign-verification-insurance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bearer token for the verification oracle that settles policies. */
export const SETTLEMENT_TOKEN_ENV = "VERIFICATION_INSURANCE_ADMIN_TOKEN";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

const stellarAccount = z.string().refine(isStellarAccount, "must be a Stellar account address");

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("quote"),
    co2TargetTonnes: z.number().positive(),
    coverageAmount: z.string().refine(isAmountString, "must be a decimal amount"),
    asset: z.string().min(1).max(64).default("USDC"),
    verificationStandard: z.enum(VERIFICATION_STANDARDS),
    verificationWindowDays: z.number().int(),
    underwriterId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("bind"),
    quoteId: z.string().min(1),
    sponsorAddress: stellarAccount,
  }),
  z.object({
    action: z.literal("settle"),
    policyId: z.string().min(1),
    verifiedCo2Tonnes: z.number().nonnegative(),
  }),
]);

const ERROR_STATUS: Record<VerificationInsuranceErrorCode, number> = {
  INVALID_INPUT: 400,
  NO_UNDERWRITER: 422,
  QUOTE_NOT_FOUND: 404,
  POLICY_NOT_FOUND: 404,
  QUOTE_EXPIRED: 409,
  QUOTE_ALREADY_BOUND: 409,
  POLICY_NOT_ACTIVE: 409,
  VERIFICATION_WINDOW_OPEN: 409,
};

function errorResponse(error: unknown): Response {
  if (error instanceof VerificationInsuranceError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: ERROR_STATUS[error.code], headers: NO_STORE_HEADERS },
    );
  }
  return Response.json(
    { error: "Verification insurance request failed" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

/**
 * GET /api/campaigns/:id/verification-insurance[?sponsorAddress=G...]
 *
 * Lists partner underwriters and the campaign's policies (optionally only one
 * sponsor's).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sponsorAddress = new URL(request.url).searchParams.get("sponsorAddress") ?? undefined;
  const service = getCampaignVerificationInsuranceService();
  return Response.json(
    {
      data: {
        underwriters: service.listUnderwriters(),
        policies: service.listPolicies(id, sponsorAddress),
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

/**
 * POST /api/campaigns/:id/verification-insurance
 *
 * - `quote`  — get premium quotes from eligible underwriters.
 * - `bind`   — turn a quote into a policy for a sponsor.
 * - `settle` — record the verified CO2 outcome (verification oracle only).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid verification insurance payload", details: parsed.error.flatten() },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const service = getCampaignVerificationInsuranceService();
  const input = parsed.data;
  try {
    switch (input.action) {
      case "quote": {
        const quotes = await service.requestQuotes(
          {
            campaignId: id,
            co2TargetTonnes: input.co2TargetTonnes,
            coverageAmount: input.coverageAmount,
            asset: input.asset,
            verificationStandard: input.verificationStandard,
            verificationWindowDays: input.verificationWindowDays,
          },
          input.underwriterId,
        );
        return Response.json({ data: quotes }, { headers: NO_STORE_HEADERS });
      }
      case "bind": {
        const policy = await service.bindPolicy(id, input.quoteId, input.sponsorAddress);
        return Response.json({ data: policy }, { status: 201, headers: NO_STORE_HEADERS });
      }
      case "settle": {
        if (!hasAdminToken(request, SETTLEMENT_TOKEN_ENV)) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
        }
        const policy = await service.settlePolicy(id, input.policyId, input.verifiedCo2Tonnes);
        return Response.json({ data: policy }, { headers: NO_STORE_HEADERS });
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}
