/**
 * GET  /api/campaigns/:id/messages  — list sent messages (creator only)
 * POST /api/campaigns/:id/messages  — send a message to backers
 *
 * Issue #1206 — Backer messaging system for creators
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  void id;
  // Real impl: fetch from DB filtered by campaignId + creatorAddress
  return NextResponse.json({ success: true, messages: [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    creatorAddress?: string;
    recipientType?: string;
    tierId?: string;
    backerAddress?: string;
    subject?: string;
    body?: string;
  };

  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json(
      { success: false, error: "subject and body are required" },
      { status: 400 },
    );
  }

  const validTypes = ["ALL_BACKERS", "TIER", "INDIVIDUAL"];
  if (!body.recipientType || !validTypes.includes(body.recipientType)) {
    return NextResponse.json(
      { success: false, error: "invalid recipientType" },
      { status: 400 },
    );
  }

  const message = {
    id: `msg-${Date.now()}`,
    campaignId: id,
    creatorAddress: body.creatorAddress ?? "",
    recipientType: body.recipientType,
    tierId: body.tierId,
    backerAddress: body.backerAddress,
    subject: body.subject.trim(),
    body: body.body.trim(),
    status: "SENT",
    sentAt: Date.now(),
    // Real impl: resolve actual recipient count from DB
    recipientCount: null,
    createdAt: Date.now(),
  };

  return NextResponse.json({ success: true, message }, { status: 201 });
}
