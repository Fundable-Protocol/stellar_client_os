import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  campaignVerificationAuditService,
} from "@/services/campaign-verification-audit.service";
import { isVerificationEventType } from "@/services/campaign-verification.service";

const AuditEventSchema = z.object({
  eventType: z.string().refine(isVerificationEventType, "Unsupported verification event type"),
  actorId: z.string().trim().min(1).max(256),
  occurredAt: z.number().int().positive().optional(),
  comment: z.string().max(2_000).optional(),
  evidenceId: z.string().max(256).optional(),
  evidenceUrl: z.string().url().optional(),
  blockchainTxHash: z.string().max(256).optional(),
  ledgerSequence: z.number().int().positive().optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const summary = await campaignVerificationAuditService.getAuditTrailSummary(id);
  if (!summary) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("certificate") === "true") {
    const certificate = await campaignVerificationAuditService.generateAuditCertificate(id);
    return NextResponse.json({ data: summary, certificate });
  }

  return NextResponse.json({ data: summary });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = AuditEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid verification activity payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const entry = await campaignVerificationAuditService.logActivity(id, parsed.data);
    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log verification activity";
    return NextResponse.json(
      { error: message },
      { status: message === "Campaign not found" ? 404 : 400 }
    );
  }
}
