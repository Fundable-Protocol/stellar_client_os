import { NextResponse } from "next/server";
import { cloneCampaign } from "@/services/campaign-creator-features.service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json().catch(() => ({})) as { creator?: string; templateId?: string };
    if (!body.creator?.trim()) return NextResponse.json({ error: "creator is required" }, { status: 400 });
    const campaign = await cloneCampaign((await params).id, body.creator, body.templateId);
    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to clone campaign" }, { status: 400 });
  }
}
