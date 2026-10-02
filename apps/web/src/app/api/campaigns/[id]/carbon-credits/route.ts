import { NextResponse } from "next/server";
import { getCampaign } from "@/services/campaign.service";
import { carbonCreditService } from "@/services/carbon-credit.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = (await params).id;
  const url = new URL(request.url);
  const issuance = carbonCreditService.getIssuance(campaignId);
  const sponsor = url.searchParams.get("sponsor");
  const claim = sponsor ? carbonCreditService.getClaim(campaignId, sponsor) : undefined;
  return NextResponse.json({ issuance: issuance ?? null, claim: claim ?? null }, { headers: NO_STORE });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = (await params).id;
  try {
    const body = (await request.json()) as {
      action?: "finalize" | "claim";
      sponsorAddress?: string;
      verifiedTonnes?: string;
      verifiedTreeCount?: number;
      totalTreeCount?: number;
      methodologyHash?: string;
      network?: "testnet" | "mainnet";
      tokenCode?: string;
    };
    const campaign = await getCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404, headers: NO_STORE });
    if (body.action === "claim") {
      if (!body.sponsorAddress?.trim()) throw new Error("sponsorAddress is required");
      const claim = carbonCreditService.claimForSponsor(campaignId, body.sponsorAddress);
      return NextResponse.json({ success: true, claim }, { status: 200, headers: NO_STORE });
    }
    if (body.action !== "finalize") throw new Error("action must be finalize or claim");
    if (!body.verifiedTonnes) throw new Error("verifiedTonnes is required");
    const issuance = carbonCreditService.finalizeIssuance({
      campaignId,
      status: campaign.status,
      verifiedTonnes: body.verifiedTonnes,
      verifiedTreeCount: body.verifiedTreeCount,
      totalTreeCount: body.totalTreeCount ?? campaign.treeCount,
      methodologyHash: body.methodologyHash,
      network: body.network ?? campaign.network ?? "testnet",
      tokenCode: body.tokenCode,
    });
    return NextResponse.json({ success: true, issuance }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid carbon-credit request" }, { status: 400, headers: NO_STORE });
  }
}
