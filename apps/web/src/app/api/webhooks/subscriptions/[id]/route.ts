import { NextRequest, NextResponse } from "next/server";
import { WebhookService } from "@/services/webhook.service";

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

/**
 * DELETE /api/webhooks/subscriptions/[id]
 * 
 * Delete/unregister a webhook subscription.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json({ error: "Missing subscription ID" }, { status: 400 });
    }

    const service = new WebhookService();
    const deleted = await service.deleteSubscription(id);

    if (!deleted) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Subscription deleted successfully" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to delete subscription" },
      { status: 500 }
    );
  }
}
