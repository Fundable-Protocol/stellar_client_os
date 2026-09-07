import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignAnalytics,
  recordCampaignContribution,
  recordCampaignRefund,
  recordCampaignView,
} from "../../../../../services/campaign-analytics.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const analytics = await getCampaignAnalytics((await params).id);
  return analytics ? noStore({ data: analytics }) : noStore({ error: "Campaign not found" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const campaignId = (await params).id;
  try {
    const body = await request.json() as {
      event?: "view" | "contribution" | "refund";
      viewerId?: string;
      sponsor?: string;
      amount?: string;
    };
    if (body.event === "view") {
      await recordCampaignView(campaignId, body.viewerId);
    } else if (body.event === "contribution") {
      if (!body.amount || !body.sponsor) return noStore({ error: "amount and sponsor are required" }, { status: 400 });
      await recordCampaignContribution(campaignId, body.amount, body.sponsor);
    } else if (body.event === "refund") {
      await recordCampaignRefund(campaignId);
    } else {
      return noStore({ error: "event must be view, contribution, or refund" }, { status: 400 });
    }
    const analytics = await getCampaignAnalytics(campaignId);
    return noStore({ data: analytics }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analytics event";
    return noStore({ error: message }, { status: message === "Campaign not found" ? 404 : 400 });
  }
}
