import { NextRequest, NextResponse } from "next/server";
import {
  uploadCampaignMetadataToIpfs,
  fetchCampaignMetadataFromIpfs,
  CampaignIpfsMetadata,
} from "@/services/campaign-ipfs.service";
import { withRateLimit } from "@/middlewares/rate-limit.middleware";

export const POST = withRateLimit(
  async (req: NextRequest): Promise<NextResponse> => {
    try {
      const body = (await req.json()) as CampaignIpfsMetadata;

      if (!body.name || !body.description || !body.terms) {
        return NextResponse.json(
          {
            error:
              "Missing required metadata fields: name, description, and terms are required.",
          },
          { status: 400 }
        );
      }

      const result = await uploadCampaignMetadataToIpfs(body);

      return NextResponse.json({
        success: true,
        data: result,
      });
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message || "Failed to upload metadata to IPFS" },
        { status: 500 }
      );
    }
  },
  { limit: 30, windowMs: 60_000, keyPrefix: "rl:ipfs-upload" }
);

export const GET = withRateLimit(
  async (req: NextRequest): Promise<NextResponse> => {
    const { searchParams } = new URL(req.url);
    const cid = searchParams.get("cid") || searchParams.get("hash");

    if (!cid) {
      return NextResponse.json(
        { error: "Missing required query parameter: cid or hash" },
        { status: 400 }
      );
    }

    try {
      const metadata = await fetchCampaignMetadataFromIpfs(cid);

      if (!metadata) {
        return NextResponse.json(
          { error: "Metadata document not found for supplied IPFS CID/hash" },
          { status: 404 }
        );
      }

      return NextResponse.json({ data: metadata });
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message || "Failed to fetch IPFS metadata" },
        { status: 500 }
      );
    }
  },
  { limit: 60, windowMs: 60_000, keyPrefix: "rl:ipfs-fetch" }
);
