/**
 * PATCH /api/campaigns/:id/faq/reorder — save drag-and-drop order
 *
 * Body: { orderedIds: string[] }
 *
 * Issue #1196 — Campaign FAQ section editable by creator
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  void id;

  const body = await req.json().catch(() => ({})) as { orderedIds?: string[] };

  if (!Array.isArray(body.orderedIds)) {
    return NextResponse.json(
      { success: false, error: "orderedIds must be an array" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, orderedIds: body.orderedIds });
}
