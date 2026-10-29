import { NextRequest, NextResponse } from "next/server";
import { pledgeRecoveryService } from "@/services/pledge-recovery.service";
import { isSupportedPlanMonths } from "@/types/campaign-instalments";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      campaignId?: string;
      tierId?: string;
      backerAddress?: string;
      backerEmail?: string;
      planMonths?: number;
    };
    if (
      !body.campaignId ||
      !body.tierId ||
      !body.backerAddress ||
      !body.backerEmail ||
      !isSupportedPlanMonths(body.planMonths)
    ) {
      return NextResponse.json({ error: "campaignId, tierId, backerAddress, backerEmail, and a supported planMonths value are required" }, { status: 400, headers: NO_STORE });
    }

    await pledgeRecoveryService.trackCheckout({
      campaignId: body.campaignId,
      tierId: body.tierId,
      backerAddress: body.backerAddress,
      backerEmail: body.backerEmail,
      planMonths: body.planMonths,
    });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save checkout recovery details.";
    const status = message.includes("REDIS_URL") ? 503 : 400;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      campaignId?: string;
      backerAddress?: string;
      backerEmail?: string;
    };
    if (!body.campaignId || !body.backerAddress || !body.backerEmail) {
      return NextResponse.json({ error: "campaignId, backerAddress, and backerEmail are required" }, { status: 400, headers: NO_STORE });
    }
    await pledgeRecoveryService.cancelCheckout(body.campaignId, body.backerAddress, body.backerEmail);
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel checkout recovery.";
    const status = message.includes("REDIS_URL") ? 503 : 400;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
