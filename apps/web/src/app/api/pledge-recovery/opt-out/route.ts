import { NextRequest, NextResponse } from "next/server";
import { pledgeRecoveryService } from "@/services/pledge-recovery.service";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string };
    if (!body.token) {
      return NextResponse.json({ error: "An opt-out token is required." }, { status: 400, headers: NO_STORE });
    }
    const optedOut = await pledgeRecoveryService.optOut(body.token);
    if (!optedOut) {
      return NextResponse.json({ error: "This opt-out link is invalid or has expired." }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("[pledge-recovery] Failed to process opt-out:", error);
    return NextResponse.json({ error: "Unable to update email preferences." }, { status: 503, headers: NO_STORE });
  }
}
