import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  appendVerificationEvent,
  getVerificationAuditTrail,
  isVerificationEventType,
  isUnderwriterId,
  getUnderwriterPolicy,
  requestUnderwriterCoverage,
} from "@/services/campaign-verification.service";
import { sendCampaignMilestonePush } from "@/services/campaign-notification.service";

const EventSchema = z.object({
  eventType: z.string().refine(isVerificationEventType, "Unsupported verification event type"),
  actorId: z.string().trim().min(1).max(256),
  occurredAt: z.number().int().positive().optional(),
  comment: z.string().max(2_000).optional(),
  evidenceId: z.string().max(256).optional(),
  evidenceUrl: z.string().url().optional(),
  blockchainTxHash: z.string().max(256).optional(),
  ledgerSequence: z.number().int().positive().optional(),
  underwriterId: z.string().refine(isUnderwriterId, "Unsupported underwriter").optional(),
  coverageAmount: z.number().positive().optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const trail = await getVerificationAuditTrail(id);
  if (!trail) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const policy = await getUnderwriterPolicy(id);
  return NextResponse.json({ data: { ...trail, insurance: policy ?? null } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = EventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid verification event", details: parsed.error.flatten() }, { status: 400 });
  try {
const campaignId = (await params).id;
    const entry = await appendVerificationEvent(campaignId, parsed.data);
    await sendCampaignMilestonePush(campaignId, parsed.data.eventType, entry);
    const insurance =
      parsed.data.underwriterId && parsed.data.coverageAmount
        ? await requestUnderwriterCoverage(campaignId, parsed.data.underwriterId, parsed.data.coverageAmount)
        : null;
    return NextResponse.json({ data: { ...entry, insurance } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to append verification event";
    return NextResponse.json({ error: message }, { status: message === "Campaign not found" ? 404 : 400 });
  }
}
