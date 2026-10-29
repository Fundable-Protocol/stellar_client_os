import { NextRequest, NextResponse } from "next/server";
import {
  getDeadlineExtension,
  listCampaignNotifications,
  requestDeadlineExtension,
  reviewDeadlineExtension,
} from "@/services/campaign-creator-features.service";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipient = request.nextUrl.searchParams.get("recipient") ?? undefined;
  return NextResponse.json({ request: getDeadlineExtension(id), notifications: listCampaignNotifications(id, recipient) }, { headers: noStore });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json() as { requestedBy?: string; requestedDays?: number; reason?: string };
    if (!body.requestedBy?.trim()) return NextResponse.json({ error: "requestedBy is required" }, { status: 400 });
    const result = await requestDeadlineExtension({ campaignId: id, requestedBy: body.requestedBy, requestedDays: body.requestedDays ?? 0, reason: body.reason });
    return NextResponse.json(result, { status: 201, headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to request extension" }, { status: 400 });
  }
}

/** Platform review endpoint. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json() as { approved?: boolean; reviewedBy?: string; reviewNote?: string };
    if (typeof body.approved !== "boolean" || !body.reviewedBy?.trim()) return NextResponse.json({ error: "approved and reviewedBy are required" }, { status: 400 });
    const result = await reviewDeadlineExtension({ campaignId: id, approved: body.approved, reviewedBy: body.reviewedBy, reviewNote: body.reviewNote });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to review extension" }, { status: 400 });
  }
}
