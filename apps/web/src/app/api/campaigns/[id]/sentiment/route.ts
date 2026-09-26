import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignSentiment,
  recordCampaignFeedback,
  type CampaignFeedbackInput,
} from "../../../../../services/campaign-sentiment.service";

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
  const sentiment = await getCampaignSentiment((await params).id);
  return sentiment
    ? noStore({ data: sentiment })
    : noStore({ error: "Campaign not found" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const input = await request.json() as CampaignFeedbackInput;
    const sentiment = await recordCampaignFeedback((await params).id, input);
    return noStore({ data: sentiment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid feedback";
    return noStore({ error: message }, { status: message === "Campaign not found" ? 404 : 400 });
  }
}