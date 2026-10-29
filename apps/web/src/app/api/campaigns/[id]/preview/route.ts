import { NextResponse } from "next/server";
import { createPrivatePreview } from "@/services/campaign-creator-features.service";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = await createPrivatePreview((await params).id);
    return NextResponse.json({ token, url: `/campaigns/preview/${token}` }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create preview" }, { status: 404 });
  }
}
