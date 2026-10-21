import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { campaignComplianceService } from "@/services/campaign-compliance.service";
import { getCampaign } from "@/services/campaign.service";
import { MAX_COMPLIANCE_FILE_SIZE } from "@/types/campaign-compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UploadDocSchema = z.object({
  name: z.string().trim().min(1, "Document title is required").max(256),
  fileName: z.string().trim().min(1).max(256),
  fileUrl: z.string().url().or(z.string().startsWith("data:application/pdf")),
  fileSize: z.number().int().positive().max(MAX_COMPLIANCE_FILE_SIZE, "File size must not exceed 10 MB"),
  mimeType: z.literal("application/pdf"),
  documentType: z.enum(["business_registration", "non_profit_status", "certification", "other"]).default("other"),
  uploadedBy: z.string().trim().min(1).max(256),
  notes: z.string().max(1000).optional(),
});

const VerifyDocSchema = z.object({
  documentId: z.string().trim().min(1),
  adminAddress: z.string().trim().min(1),
  verified: z.boolean(),
  notes: z.string().max(1000).optional(),
});

/**
 * GET /api/campaigns/[id]/compliance-documents
 * Fetch compliance documents attached to a campaign.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const documents = await campaignComplianceService.getDocuments(id);
  return NextResponse.json({ documents });
}

/**
 * POST /api/campaigns/[id]/compliance-documents
 * Creators upload compliance documents (PDF, max 10MB) in campaign settings.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UploadDocSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const document = await campaignComplianceService.uploadDocument({
      ...parsed.data,
      campaignId: id,
    });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload compliance document";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * PATCH /api/campaigns/[id]/compliance-documents
 * Platform admins mark compliance documents as verified.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = VerifyDocSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid verification payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const document = await campaignComplianceService.verifyDocument({
      campaignId: id,
      documentId: parsed.data.documentId,
      adminAddress: parsed.data.adminAddress,
      verified: parsed.data.verified,
      notes: parsed.data.notes,
    });
    return NextResponse.json({ document }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify document";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
