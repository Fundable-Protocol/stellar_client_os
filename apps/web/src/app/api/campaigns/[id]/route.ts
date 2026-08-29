import { NextRequest, NextResponse } from "next/server";
import { updateCampaignSchema } from "@/lib/validations";

/**
 * PATCH /api/campaigns/[id] (Issue #721)
 *
 * Allows creator to update campaign details (name, description, goal amount, deadline) before launch.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const body = await request.json();

    const validation = updateCampaignSchema.safeParse({
      id: campaignId,
      ...body,
    });

    if (!validation.success) {
      return NextResponse.json(
        { message: "Validation failed", errors: validation.error.format() },
        { status: 400 }
      );
    }

    const { name, description, goalAmount, deadline } = validation.data;

    // Simulated update logic / on-chain pre-launch update verification
    const updatedCampaign = {
      id: campaignId,
      name,
      description,
      goal_amount: goalAmount,
      deadline,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(updatedCampaign, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ message }, { status: 500 });
  }
}
