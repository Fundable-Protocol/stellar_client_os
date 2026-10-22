import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { externalWebhookService } from "@/services/external-webhook.service";

const CreateWebhookSchema = z.object({
  platform: z.enum(["telegram", "discord"]),
  webhookUrl: z.string().url("Invalid webhook URL"),
  botToken: z.string().optional(),
  events: z
    .array(
      z.enum([
        "pledge.created",
        "milestone.reached",
        "stretch_goal.unlocked",
        "refund.requested",
        "campaign.completed",
      ])
    )
    .min(1, "At least one event must be specified"),
  enabled: z.boolean().optional(),
});

const UpdateWebhookSchema = z.object({
  webhookUrl: z.string().url().optional(),
  botToken: z.string().optional(),
  events: z
    .array(
      z.enum([
        "pledge.created",
        "milestone.reached",
        "stretch_goal.unlocked",
        "refund.requested",
        "campaign.completed",
      ])
    )
    .optional(),
  enabled: z.boolean().optional(),
});

/**
 * GET /api/campaigns/[id]/webhooks
 *
 * Retrieve all external webhooks for a campaign.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const webhooks = await externalWebhookService.getWebhooks(id);
    
    // Remove sensitive data before sending to client
    const sanitized = webhooks.map((w) => ({
      ...w,
      botToken: w.botToken ? "***" : undefined,
    }));
    
    return NextResponse.json(sanitized);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to retrieve webhooks" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns/[id]/webhooks
 *
 * Create a new external webhook for a campaign.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = CreateWebhookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { platform, webhookUrl, botToken, events, enabled } = parsed.data;

    const webhook = await externalWebhookService.createWebhook(
      id,
      platform,
      webhookUrl,
      events,
      { botToken, enabled }
    );

    // Sanitize response
    const sanitized = {
      ...webhook,
      botToken: webhook.botToken ? "***" : undefined,
    };

    return NextResponse.json(sanitized, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to create webhook" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/campaigns/[id]/webhooks/[webhookId]
 *
 * Update an existing webhook.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const webhookId = url.searchParams.get("webhookId");

    if (!webhookId) {
      return NextResponse.json(
        { error: "webhookId query parameter is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = UpdateWebhookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const webhook = await externalWebhookService.updateWebhook(webhookId, parsed.data);

    if (!webhook) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    // Verify webhook belongs to this campaign
    if (webhook.campaignId !== id) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    // Sanitize response
    const sanitized = {
      ...webhook,
      botToken: webhook.botToken ? "***" : undefined,
    };

    return NextResponse.json(sanitized);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to update webhook" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/campaigns/[id]/webhooks/[webhookId]
 *
 * Delete a webhook.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(_req.url);
    const webhookId = url.searchParams.get("webhookId");

    if (!webhookId) {
      return NextResponse.json(
        { error: "webhookId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify webhook exists and belongs to this campaign
    const webhooks = await externalWebhookService.getWebhooks(id);
    const webhook = webhooks.find((w) => w.id === webhookId);

    if (!webhook) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    const deleted = await externalWebhookService.deleteWebhook(webhookId);

    if (!deleted) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to delete webhook" },
      { status: 500 }
    );
  }
}
