import { NextRequest, NextResponse } from "next/server";
import { pledgeRecoveryService } from "@/services/pledge-recovery.service";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const details = await pledgeRecoveryService.getRecoveryDetails(token);
    if (!details) {
      return NextResponse.json({ error: "This pledge recovery link is no longer available." }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ details }, { headers: NO_STORE });
  } catch (error) {
    console.error("[pledge-recovery] Failed to load recovery details:", error);
    return NextResponse.json({ error: "Unable to load pledge recovery details." }, { status: 503, headers: NO_STORE });
  }
}
