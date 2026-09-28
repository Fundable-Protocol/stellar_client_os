/**
 * Campaign sponsorship receipt — issue and verify (issue #994).
 *
 * `POST` issues a receipt for a sponsorship of trees in a campaign. `PUT`
 * verifies a receipt the caller presents against the Stellar transaction that
 * should carry its commitment. Both are stateless: the receipt is its own
 * proof, so there is nothing to persist.
 *
 * @see {@link @/lib/sponsorship-receipt}
 * @see {@link @/services/campaign-sponsorship-receipt.service}
 */

import { NextRequest, NextResponse } from "next/server";
import {
  SponsorshipReceiptError,
  parseSponsorshipReceipt,
  parseSponsorshipReceiptInput,
} from "@/lib/sponsorship-receipt";
import { sanitizeError } from "@/lib/sanitize-error";
import {
  issueCampaignSponsorshipReceipt,
  verifyCampaignSponsorshipReceipt,
} from "@/services/campaign-sponsorship-receipt.service";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** A rejected lookup or a failed parse does not have to be an `Error`. */
function logFailure(message: string, error: unknown) {
  console.error(message, sanitizeError(error instanceof Error ? error : new Error(String(error))));
}

/** A receipt may arrive as JSON or as the string a QR code carried. */
function readReceiptField(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new SponsorshipReceiptError("receipt must be a receipt object or its JSON string");
  }
}

function readBody(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SponsorshipReceiptError("A JSON object body is required");
  }
  return value as Record<string, unknown>;
}

/**
 * Issue the receipt for a sponsorship. The campaign id comes from the URL; a
 * body `campaignId` is allowed but must agree with it, so a receipt can never
 * be issued under a campaign the request did not name.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id: campaignId } = await params;

  let body: Record<string, unknown>;
  try {
    body = readBody(await request.json());
  } catch (error) {
    if (error instanceof SponsorshipReceiptError) {
      return errorResponse(error.message, 400);
    }
    return errorResponse("A JSON body is required", 400);
  }

  if (typeof body.campaignId === "string" && body.campaignId.trim() !== campaignId) {
    return errorResponse("campaignId in the body must match the campaign in the URL", 400);
  }

  try {
    const issuance = issueCampaignSponsorshipReceipt(
      // The URL's campaign id wins; the body's copy was checked above only to
      // reject a mismatch.
      parseSponsorshipReceiptInput({ ...body, campaignId }),
    );
    return NextResponse.json({ success: true, ...issuance }, { status: 201 });
  } catch (error) {
    if (error instanceof SponsorshipReceiptError) {
      return errorResponse(error.message, 400);
    }
    logFailure("Failed to issue sponsorship receipt", error);
    return errorResponse("Failed to issue the sponsorship receipt", 500);
  }
}

/**
 * Verify a receipt against its Stellar transaction.
 *
 * Verification outcomes are reported, not thrown: a receipt that fails a check
 * is a successful answer to the question "is this receipt valid?", so this
 * returns 200 with `verified: false` and the failing `status`. Only a malformed
 * request (unparseable body, bad hash, receipt for another campaign) is a 400.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id: campaignId } = await params;

  let body: Record<string, unknown>;
  try {
    body = readBody(await request.json());
  } catch (error) {
    if (error instanceof SponsorshipReceiptError) {
      return errorResponse(error.message, 400);
    }
    return errorResponse("A JSON body is required", 400);
  }

  if (body.receipt === undefined) {
    return errorResponse("receipt is required", 400);
  }
  const transactionHash = body.transactionHash;
  if (typeof transactionHash !== "string") {
    return errorResponse("transactionHash is required as a 64-character hex hash", 400);
  }

  try {
    const receipt = parseSponsorshipReceipt(readReceiptField(body.receipt));
    if (receipt.campaignId !== campaignId) {
      return errorResponse("receipt does not belong to this campaign", 400);
    }

    const verification = await verifyCampaignSponsorshipReceipt(receipt, transactionHash);
    return NextResponse.json({ success: true, campaignId, ...verification });
  } catch (error) {
    if (error instanceof SponsorshipReceiptError) {
      return errorResponse(error.message, 400);
    }
    logFailure("Failed to verify sponsorship receipt", error);
    return errorResponse("Failed to verify the sponsorship receipt", 502);
  }
}
