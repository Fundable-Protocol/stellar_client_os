import { NextRequest } from "next/server";
import { recurringContributionService } from "@/services/recurring-contributions.service";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { status, amount, cancellationReason } = body;

    const updated = await recurringContributionService.updateSubscription(id, {
      status,
      amount,
      cancellationReason,
    });

    return Response.json({ subscription: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update subscription";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const sub = await recurringContributionService.getSubscription(id);
    if (!sub) {
      return Response.json({ error: "Subscription not found" }, { status: 404 });
    }
    return Response.json({ subscription: sub });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
