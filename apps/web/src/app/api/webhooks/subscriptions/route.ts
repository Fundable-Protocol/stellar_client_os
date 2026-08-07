import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WebhookService } from "@/services/webhook.service";

const VALID_EVENTS = ["stream.status_updated", "milestone.funds_released", "*"];

const CreateSubscriptionSchema = z.object({
  url: z.string().url("Invalid URL format"),
  events: z.array(z.string())
    .min(1, "At least one event type must be specified")
    .refine(
      (events) => events.every((e) => VALID_EVENTS.includes(e)),
      { message: "Invalid event type specified. Allowed events are: " + VALID_EVENTS.join(", ") }
    ),
  secret: z.string().min(8, "Secret must be at least 8 characters long").optional(),
});

/**
 * GET /api/webhooks/subscriptions
 * 
 * Retrieve all active webhook subscriptions.
 */
export async function GET() {
  try {
    const service = new WebhookService();
    const subscriptions = await service.getSubscriptions();
    return NextResponse.json(subscriptions);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to retrieve subscriptions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webhooks/subscriptions
 * 
 * Register a new webhook subscription.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSubscriptionSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { url, events, secret } = parsed.data;
    const service = new WebhookService();
    const subscription = await service.createSubscription(url, events, secret);

    return NextResponse.json(subscription, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to register subscription" },
      { status: 500 }
    );
  }
}
