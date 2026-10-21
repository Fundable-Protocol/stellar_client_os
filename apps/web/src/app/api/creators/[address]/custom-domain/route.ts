import { NextRequest, NextResponse } from "next/server";
import {
  configureCreatorCustomDomain,
  getCreatorCustomDomain,
  removeCreatorCustomDomain,
} from "@/services/custom-domain.service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return NextResponse.json({ success: true, data: getCreatorCustomDomain(address) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await params;
    const body = await request.json();
    if (body.isPremium !== true) return NextResponse.json({ success: false, error: "Custom domains are available on premium creator plans" }, { status: 403 });
    const data = configureCreatorCustomDomain(address, body.domain);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to configure custom domain" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  removeCreatorCustomDomain(address);
  return NextResponse.json({ success: true });
}
