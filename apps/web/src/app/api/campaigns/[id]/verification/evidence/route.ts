import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCampaign, getCampaignDataSource } from "@/services/campaign.service";
import type { VerificationEvidence } from "@/types/campaign-verification";

const EvidenceSchema = z.object({
  id: z.string().trim().min(1).max(256),
  type: z.enum(["photo", "video"]),
  url: z.string().url(),
  capturedAt: z.number().int().positive(),
  uploadedAt: z.number().int().positive().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  verifierId: z.string().trim().min(1).max(256).optional(),
  caption: z.string().max(2_000).optional(),
  contentHash: z.string().max(256).optional(),
});

export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = (await params).id;
  const campaign = await getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const parsed = EvidenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid evidence", details: parsed.error.flatten() }, { status: 400 });
  const evidence: VerificationEvidence = { ...parsed.data, campaignId, uploadedAt: parsed.data.uploadedAt ?? Date.now() };
  if ((campaign.verificationEvidence ?? []).some((item) => item.id === evidence.id)) {
    return NextResponse.json({ error: "Evidence already exists" }, { status: 409 });
  }
  const updated = await getCampaignDataSource().saveCampaign({ ...campaign, verificationEvidence: [...(campaign.verificationEvidence ?? []), evidence], updatedAt: Date.now() });
  return NextResponse.json({ data: updated.verificationEvidence?.at(-1) }, { status: 201 });
}
