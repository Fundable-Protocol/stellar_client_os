import { NextRequest, NextResponse } from "next/server";
import { INITIAL_MOCK_SPONSORS, calculateSponsorTier, Sponsor } from "@/types/sponsor";

// In-memory store for demo API route
let sponsorsStore: Sponsor[] = [...INITIAL_MOCK_SPONSORS];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignSponsors = sponsorsStore.filter((s) => s.campaignId === id || id === "demo" || id === "camp-101");
  return NextResponse.json({
    campaignId: id,
    total: campaignSponsors.length,
    sponsors: campaignSponsors,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, address, amount, token, message, avatarUrl } = body;

    if (!address || !amount) {
      return NextResponse.json({ error: "Address and amount are required" }, { status: 400 });
    }

    const amountStr = String(amount);
    const newSponsor: Sponsor = {
      id: `sp-${Date.now()}`,
      campaignId: id,
      name,
      address,
      avatarUrl,
      amount: amountStr,
      token: token || "XLM",
      tier: calculateSponsorTier(amountStr),
      sponsoredAt: Date.now(),
      message,
      isRecent: true,
    };

    sponsorsStore.unshift(newSponsor);

    return NextResponse.json({ success: true, sponsor: newSponsor }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Invalid sponsor payload" }, { status: 500 });
  }
}
