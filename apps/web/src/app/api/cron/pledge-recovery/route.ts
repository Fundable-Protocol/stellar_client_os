import { NextRequest, NextResponse } from "next/server";
import { pledgeRecoveryService } from "@/services/pledge-recovery.service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pledgeRecoveryService.sendDueReminders();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[pledge-recovery] Reminder dispatch failed:", error);
    return NextResponse.json({ error: "Pledge recovery dispatch failed." }, { status: 503 });
  }
}
