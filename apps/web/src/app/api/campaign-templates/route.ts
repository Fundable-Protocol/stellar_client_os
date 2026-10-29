import { NextRequest, NextResponse } from "next/server";
import { CAMPAIGN_TEMPLATES } from "@/services/campaign-creator-features.service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const templates = category ? CAMPAIGN_TEMPLATES.filter((template) => template.category === category) : CAMPAIGN_TEMPLATES;
  return NextResponse.json({ templates });
}
