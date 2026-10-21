/**
 * GET  /api/campaigns/:id/faq       — list FAQ items
 * POST /api/campaigns/:id/faq       — create a new FAQ item
 *
 * Issue #1196 — Campaign FAQ section editable by creator
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// In a real implementation these would hit a database.
// The stubs below return success shapes that match the frontend contract.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  void id;
  // Return empty list — real impl queries DB
  return NextResponse.json({ success: true, items: [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    question?: string;
    answer?: string;
  };

  if (!body.question?.trim() || !body.answer?.trim()) {
    return NextResponse.json(
      { success: false, error: "question and answer are required" },
      { status: 400 },
    );
  }

  const newItem = {
    id: `faq-${Date.now()}`,
    campaignId: id,
    question: body.question.trim(),
    answer: body.answer.trim(),
    order: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return NextResponse.json({ success: true, item: newItem }, { status: 201 });
}
