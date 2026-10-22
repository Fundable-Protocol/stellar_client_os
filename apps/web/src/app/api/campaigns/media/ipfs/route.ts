import { NextRequest, NextResponse } from "next/server";
import {
  campaignMediaIpfsService,
  resolveMediaGateways,
} from "@/services/campaign-media-ipfs.service";
import { CampaignMediaAssetType } from "@/types/campaign-media";

export const runtime = "nodejs";

/**
 * IPFS Campaign Media Upload & Streaming API — Issue #1356
 *
 * POST /api/campaigns/media/ipfs — Upload campaign pitch deck (PDF) or demo video to IPFS
 * GET  /api/campaigns/media/ipfs?cid=... — Stream or retrieve metadata with fallback CDN gateways
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const type = (formData.get("type") as CampaignMediaAssetType) || undefined;
      const campaignId = (formData.get("campaignId") as string) || undefined;
      const name = (formData.get("name") as string) || undefined;

      if (!file) {
        return NextResponse.json(
          { error: "No media file provided in 'file' field" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await campaignMediaIpfsService.uploadMedia(
        buffer,
        file.name,
        file.type || "application/octet-stream",
        {
          campaignId,
          type,
          name: name || file.name,
        }
      );

      return NextResponse.json({
        success: true,
        data: result.asset,
      }, { status: 201 });
    }

    // JSON upload mode (base64 or metadata registration)
    const body = await req.json();
    const { base64Data, fileName, mimeType, type, campaignId, name } = body;

    if (!base64Data || !fileName || !mimeType) {
      return NextResponse.json(
        { error: "Required fields: base64Data, fileName, and mimeType" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(base64Data, "base64");
    const result = await campaignMediaIpfsService.uploadMedia(buffer, fileName, mimeType, {
      campaignId,
      type,
      name,
    });

    return NextResponse.json({
      success: true,
      data: result.asset,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload media to IPFS";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid");
  const campaignId = searchParams.get("campaignId");

  if (campaignId) {
    const assets = campaignMediaIpfsService.getCampaignMediaAssets(campaignId);
    return NextResponse.json({ success: true, data: assets });
  }

  if (!cid) {
    return NextResponse.json(
      { error: "Missing required query parameter: cid or campaignId" },
      { status: 400 }
    );
  }

  const stored = campaignMediaIpfsService.getMediaBuffer(cid);

  // If client requests raw stream directly (e.g., video/audio player or pdf reader)
  const isStreamRequest = req.headers.get("accept")?.includes("video") ||
    req.headers.get("accept")?.includes("application/pdf") ||
    searchParams.get("stream") === "true";

  if (stored && isStreamRequest) {
    const { buffer, asset } = stored;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": buffer.length.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-IPFS-CID": asset.cid,
        "X-OnChain-Hash": asset.onChainHashHex,
      },
    });
  }

  const asset = campaignMediaIpfsService.getMediaAsset(cid);
  const gateways = resolveMediaGateways(cid);

  return NextResponse.json({
    success: true,
    data: {
      ...(asset || { cid }),
      gateways,
    },
  });
}
