import { z } from "zod";
import { isStellarAccount } from "@/lib/admin-auth";
import { CarbonMarketError, type CarbonMarketErrorCode } from "@/services/carbon-credit-market.service";

/** Bearer token for the impact oracle that issues credits from verified campaigns. */
export const ISSUER_TOKEN_ENV = "CARBON_MARKET_ADMIN_TOKEN";

export const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export const stellarAccount = z.string().refine(isStellarAccount, "must be a Stellar account address");

const ERROR_STATUS: Record<CarbonMarketErrorCode, number> = {
  INVALID_INPUT: 400,
  SELF_TRADE: 400,
  NOT_LISTING_OWNER: 403,
  LISTING_NOT_FOUND: 404,
  INSUFFICIENT_CREDITS: 409,
  LISTING_NOT_OPEN: 409,
  INSUFFICIENT_LISTING_QUANTITY: 409,
};

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json({ data }, { status, headers: NO_STORE_HEADERS });
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400, headers: NO_STORE_HEADERS });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof CarbonMarketError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: ERROR_STATUS[error.code], headers: NO_STORE_HEADERS },
    );
  }
  return Response.json(
    { error: "Carbon credit market request failed" },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}

/** Parses a JSON body against `schema`, returning the data or a 400 response. */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<{ data: T } | { response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: badRequest("Body must be JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: Response.json(
        { error: "Invalid carbon credit payload", details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS },
      ),
    };
  }
  return { data: parsed.data };
}
