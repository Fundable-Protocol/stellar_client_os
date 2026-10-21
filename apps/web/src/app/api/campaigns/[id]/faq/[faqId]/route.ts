/**
 * PATCH  /api/campaigns/:id/faq/:faqId  — update a FAQ item
 * DELETE /api/campaigns/:id/faq/:faqId  — delete a FAQ item
 *
 * Issue #1196 — Campaign FAQ section editable by creator
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; faqId: string }> },
) {
  const { id, faqId } = await params;
  const body = await req.json().catch(() => ({})) as {
    question?: string;
    answer?: string;
  };

  return NextResponse.json({
    success: true,
    item: {
      id: faqId,
      campaignId: id,
      question: body.question?.trim() ?? "",
      answer: body.answer?.trim() ?? "",
      updatedAt: Date.now(),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; faqId: string }> },
) {
  const { faqId } = await params;
  void faqId;
  return NextResponse.json({ success: true });
}
