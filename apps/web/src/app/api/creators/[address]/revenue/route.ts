import { NextRequest, NextResponse } from "next/server";
import {
  getCreatorRevenueDashboard,
  initiateCreatorWithdrawal,
  type RevenuePeriod,
} from "@/services/creator-revenue-dashboard.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await params;
    const period = (new URL(request.url).searchParams.get("period") ?? "30d") as RevenuePeriod;
    if (!["7d", "30d", "90d", "all"].includes(period)) return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    return NextResponse.json({ success: true, data: await getCreatorRevenueDashboard(address, period) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to load revenue" }, { status: 400 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await params;
    const body = await request.json().catch(() => ({}));
    const requestRecord = await initiateCreatorWithdrawal(address, body.amount);
    return NextResponse.json({ success: true, data: requestRecord }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to initiate withdrawal" }, { status: 400 });
  }
}
