import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { VideoAnchorService } from "@/services/video-anchor.service";

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== "valid-verifier-token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Extract Metadata
    const campaignId = req.headers.get("x-campaign-id");
    const verifierId = req.headers.get("x-verifier-id");
    if (!campaignId || !verifierId) {
      return NextResponse.json({ error: "Missing campaignId or verifierId" }, { status: 400 });
    }

    // 3. Process Video Stream Chunks
    if (!req.body) {
      return NextResponse.json({ error: "No video stream body provided" }, { status: 400 });
    }

    const reader = req.body.getReader();
    const hash = crypto.createHash("sha256");
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        hash.update(value);
        length += value.length;
      }
    }
    
    if (length === 0) {
      return NextResponse.json({ error: "Empty video stream" }, { status: 400 });
    }

    const videoHash = hash.digest("hex");
    const timestamp = new Date().toISOString();

    // 4. On-Chain Anchoring (Stellar)
    const secretKey = process.env.ANCHOR_SECRET_KEY || "SAQ3C66F7W77XUSK5C44KCH3GMDHHKDDFHNNK5D6M7OXZTMMZCDXIF3I";
    const serverUrl = process.env.STELLAR_SERVER_URL || "https://horizon-testnet.stellar.org";
    
    const anchorService = new VideoAnchorService(serverUrl, secretKey);
    const { tx } = await anchorService.anchorVideoProof(campaignId, verifierId, timestamp, videoHash);

    return NextResponse.json({ 
       success: true, 
       txHash: tx.hash().toString("hex"),
       proof: {
         campaignId,
         verifierId,
         timestamp,
         videoHash
       }
    });

  } catch (err: any) {
    console.error("Error anchoring video proof:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
