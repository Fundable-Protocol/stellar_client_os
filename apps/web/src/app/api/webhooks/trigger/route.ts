import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WebhookService } from "@/services/webhook.service";

const TriggerWebhookSchema = z.object({
  event: z.string().min(1, "Event type is required"),
  payload: z.record(z.any(), { message: "Payload must be a JSON object" }),
});

/**
 * POST /api/webhooks/trigger
 * 
 * Manually trigger a webhook event for testing.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = TriggerWebhookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { event, payload } = parsed.data;
    const service = new WebhookService();
    
    // Dispatch event (runs in parallel background)
    await service.dispatchEvent(event, payload);

    return NextResponse.json({ success: true, message: `Event '${event}' dispatched successfully` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to trigger event" },
      { status: 500 }
    );
  }
}
