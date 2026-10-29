import { NextResponse } from "next/server";
import { campaignReferralService } from "@/services/campaign-referral.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve a short referral URL, count its click, and keep attribution on the landing URL. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const resolved = await campaignReferralService.resolveLink(code);
  if (!resolved) return NextResponse.json({ error: "Referral link not found" }, { status: 404 });

  campaignReferralService.recordClick(code);
  const destination = new URL(`/campaigns/${encodeURIComponent(resolved.campaign.id)}`, new URL(request.url).origin);
  destination.searchParams.set("ref", code);
  return NextResponse.redirect(destination, 307);
}
