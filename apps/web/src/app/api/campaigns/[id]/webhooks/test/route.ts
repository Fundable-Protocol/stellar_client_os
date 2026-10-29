import { NextRequest, NextResponse } from "next/server";
import { externalWebhookService } from "@/services/external-webhook.service";

/**
 * POST /api/campaigns/[id]/webhooks/test
 *
 * Test a webhook by sending a sample event.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { webhookId } = body;

    if (!webhookId) {
      return NextResponse.json(
        { error: "webhookId is required in request body" },
        { status: 400 }
      );
    }

    // Verify webhook exists and belongs to this campaign
    const webhooks = await externalWebhookService.getWebhooks(id);
    const webhook = webhooks.find((w) => w.id === webhookId);

    if (!webhook) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    if (webhook.campaignId !== id) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    const result = await externalWebhookService.testWebhook(webhookId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to test webhook" },
      { status: 500 }
    );
  }
}
