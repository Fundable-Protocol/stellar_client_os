import { NextRequest, NextResponse } from "next/server";
import { campaignMediaIpfsService } from "@/services/campaign-media-ipfs.service";
import { getCampaign } from "@/services/campaign.service";

export const runtime = "nodejs";

/**
 * On-Chain IPFS Media Verification Route — Issue #1356
 *
 * POST /api/campaigns/[id]/media/verify
 * Verifies that an IPFS media CID's cryptographic hash corresponds with the on-chain
 * campaign metadata or registered contract anchor.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const campaign = await getCampaign(id);
    const body = await req.json();
    const { cid, expectedHash } = body;

    if (!cid) {
      return NextResponse.json(
        { error: "Missing required parameter: cid" },
        { status: 400 }
      );
    }

    // Determine expected hash: from body, or matching campaign pitch deck/video hash
    let targetHash = expectedHash;
    if (!targetHash && campaign) {
      const campaignRecord = campaign as unknown as Record<string, unknown>;
      if (campaignRecord.pitchDeckCid === cid) {
        targetHash = campaignRecord.pitchDeckHashHex as string;
      } else if (campaignRecord.videoCid === cid) {
        targetHash = campaignRecord.videoHashHex as string;
      }
    }

    const verificationResult = campaignMediaIpfsService.verifyMediaOnChain(cid, targetHash);

    return NextResponse.json({
      success: true,
      data: {
        campaignId: id,
        ...verificationResult,
        campaignName: campaign?.name || null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
