import { NextRequest } from "next/server";
import { recurringContributionService } from "@/services/recurring-contributions.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const backerAddress = searchParams.get("backerAddress");

  if (!backerAddress) {
    return Response.json(
      { error: "backerAddress query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const subscriptions = await recurringContributionService.listSubscriptionsByBacker(backerAddress);
    return Response.json({ subscriptions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      campaignId,
      campaignTitle,
      creatorAddress,
      backerAddress,
      backerName,
      backerEmail,
      amount,
      token,
    } = body;

    if (!campaignId || !creatorAddress || !backerAddress || !amount) {
      return Response.json(
        { error: "Missing required fields: campaignId, creatorAddress, backerAddress, amount" },
        { status: 400 }
      );
    }

    const subscription = await recurringContributionService.createSubscription({
      campaignId,
      campaignTitle,
      creatorAddress,
      backerAddress,
      backerName,
      backerEmail,
      amount,
      token,
    });

    return Response.json({ subscription }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create subscription";
    return Response.json({ error: message }, { status: 400 });
  }
}
